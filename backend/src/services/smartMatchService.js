const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const geminiService = require('./geminiService');
const logger = require('../utils/logger');

const MAX_RECOMMENDATIONS = 10;

/**
 * Rule-based skill/keyword overlap score, used both as the fallback
 * ranking when Gemini isn't configured/available and as a sanity
 * floor — Gemini is only ever asked to rank and explain a candidate
 * set this same kind of real filtering already produced, never to
 * invent candidates or bypass it.
 */
function overlapScore(candidateSkillNames, referenceText) {
  if (!candidateSkillNames || candidateSkillNames.length === 0) return 0;
  const haystack = (referenceText || '').toLowerCase();
  return candidateSkillNames.filter((s) => haystack.includes(s.toLowerCase())).length;
}

/**
 * Recommends open jobs for a worker. Candidates are pulled from the
 * same `jobs` table any search would use, pre-filtered to the
 * worker's state and open status — Gemini (if configured) only
 * re-ranks and explains within that already-legitimate set; it never
 * decides who's eligible to apply, and applying still goes through
 * the normal, human-initiated `/jobs/:id/applications` endpoint
 * regardless of what's recommended here.
 */
async function recommendJobsForWorker(workerUserId) {
  const { rows: profileRows } = await query(
    `SELECT wp.*, array_agg(s.name) FILTER (WHERE s.name IS NOT NULL) AS skill_names
       FROM worker_profiles wp
       LEFT JOIN worker_profile_skills wps ON wps.worker_user_id = wp.user_id
       LEFT JOIN skills s ON s.id = wps.skill_id
      WHERE wp.user_id = $1
      GROUP BY wp.user_id`,
    [workerUserId]
  );
  const profile = profileRows[0];
  if (!profile) throw new AppError('Complete your worker profile to get job recommendations.', 400, 'PROFILE_INCOMPLETE');

  const params = [];
  let stateCondition = '';
  if (profile.state_id) {
    params.push(profile.state_id);
    stateCondition = `AND j.state_id = $${params.length}`;
  }
  params.push(MAX_RECOMMENDATIONS * 3);

  const { rows: candidates } = await query(
    `SELECT j.id, j.title, j.description, j.employment_type, j.experience_level, j.budget_min, j.budget_max,
            array_agg(s.name) FILTER (WHERE s.name IS NOT NULL) AS skill_names
       FROM jobs j
       LEFT JOIN job_skills js ON js.job_id = j.id
       LEFT JOIN skills s ON s.id = js.skill_id
      WHERE j.status = 'open' ${stateCondition}
      GROUP BY j.id
      ORDER BY j.created_at DESC
      LIMIT $${params.length}`,
    params
  );

  if (candidates.length === 0) return [];

  const skillNames = profile.skill_names || [];
  const ranked = await rankCandidates({
    referenceSummary: {
      professionalTitle: profile.professional_title,
      bio: profile.bio,
      skills: skillNames,
      experienceYears: profile.experience_years,
    },
    candidates: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      description: (c.description || '').slice(0, 300),
      skills: c.skill_names || [],
      employmentType: c.employment_type,
      experienceLevel: c.experience_level,
    })),
    fallbackScore: (c) => overlapScore(skillNames, `${c.title} ${c.description} ${(c.skills || []).join(' ')}`),
  });

  const byId = new Map(candidates.map((c) => [c.id, c]));
  return ranked.map((r) => ({ ...byId.get(r.id), matchReason: r.reason })).filter((r) => r.id);
}

/**
 * Recommends workers for a specific job the hirer owns. Same pattern:
 * candidates come from real filtering (open-to-work, same state,
 * matching category where the job has one), Gemini only ranks and
 * explains within that set. Inviting a recommended worker still goes
 * through the normal `/jobs/:jobId/invitations` endpoint.
 */
async function recommendWorkersForJob(jobId) {
  const { rows: jobRows } = await query(
    `SELECT j.*, array_agg(s.name) FILTER (WHERE s.name IS NOT NULL) AS skill_names
       FROM jobs j
       LEFT JOIN job_skills js ON js.job_id = j.id
       LEFT JOIN skills s ON s.id = js.skill_id
      WHERE j.id = $1
      GROUP BY j.id`,
    [jobId]
  );
  const job = jobRows[0];
  if (!job) throw new AppError('Job not found.', 404, 'NOT_FOUND');

  const params = [];
  let stateCondition = '';
  if (job.state_id) {
    params.push(job.state_id);
    stateCondition = `AND wp.state_id = $${params.length}`;
  }
  params.push(MAX_RECOMMENDATIONS * 3);

  const { rows: candidates } = await query(
    `SELECT wp.user_id, wp.professional_title, wp.bio, wp.experience_years, wp.rating_avg, wp.rating_count,
            wp.verification_status, wp.is_pro, u.full_name,
            array_agg(s.name) FILTER (WHERE s.name IS NOT NULL) AS skill_names
       FROM worker_profiles wp
       JOIN users u ON u.id = wp.user_id
       LEFT JOIN worker_profile_skills wps ON wps.worker_user_id = wp.user_id
       LEFT JOIN skills s ON s.id = wps.skill_id
      WHERE wp.availability_status = 'available' ${stateCondition}
      GROUP BY wp.user_id, u.full_name
      ORDER BY wp.is_pro DESC, wp.rating_avg DESC
      LIMIT $${params.length}`,
    params
  );

  if (candidates.length === 0) return [];

  const jobSkillNames = job.skill_names || [];
  const ranked = await rankCandidates({
    referenceSummary: {
      title: job.title,
      description: (job.description || '').slice(0, 300),
      skills: jobSkillNames,
      experienceLevel: job.experience_level,
    },
    candidates: candidates.map((c) => ({
      id: c.user_id,
      title: c.professional_title,
      description: (c.bio || '').slice(0, 300),
      skills: c.skill_names || [],
      experienceYears: c.experience_years,
      rating: c.rating_avg,
    })),
    fallbackScore: (c) => overlapScore(jobSkillNames, `${c.title} ${c.description} ${(c.skills || []).join(' ')}`),
  });

  const byId = new Map(candidates.map((c) => [c.user_id, c]));
  return ranked.map((r) => ({ ...byId.get(r.id), matchReason: r.reason })).filter((r) => r.id);
}

/**
 * Shared ranking step. Tries Gemini first (structured JSON: an
 * ordered array of {id, reason}); on any failure — not configured,
 * request error, bad JSON, or Gemini returning IDs that don't match
 * the candidate set — falls back to the deterministic overlap score
 * so the feature degrades to "still works, just less clever" rather
 * than breaking.
 */
async function rankCandidates({ referenceSummary, candidates, fallbackScore }) {
  const validIds = new Set(candidates.map((c) => c.id));

  if (geminiService.isConfigured()) {
    try {
      const prompt = buildRankingPrompt(referenceSummary, candidates);
      const result = await geminiService.generateJson(prompt);

      if (Array.isArray(result)) {
        const filtered = result.filter((r) => r && validIds.has(r.id) && typeof r.reason === 'string');
        if (filtered.length > 0) {
          return filtered.slice(0, MAX_RECOMMENDATIONS);
        }
      }
      logger.warn('Gemini ranking returned no usable candidates — falling back to rule-based ranking');
    } catch (err) {
      logger.warn('Gemini ranking failed — falling back to rule-based ranking', { error: err.message });
    }
  }

  return candidates
    .map((c) => ({ id: c.id, score: fallbackScore(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECOMMENDATIONS)
    .map((c) => ({ id: c.id, reason: c.score > 0 ? 'Matches your skills' : 'Recently posted' }));
}

function buildRankingPrompt(referenceSummary, candidates) {
  return `You are ranking candidates for a Nigerian job marketplace. Given the reference profile and a list of candidates, select and rank the best matches.

Reference:
${JSON.stringify(referenceSummary)}

Candidates:
${JSON.stringify(candidates)}

Return ONLY a JSON array, ordered best-match first, of at most ${MAX_RECOMMENDATIONS} items, each shaped exactly as:
{"id": "<candidate id, copied exactly>", "reason": "<one short sentence, under 20 words, explaining the match>"}

Do not include any candidate id that is not in the list above. Do not include any text outside the JSON array.`;
}

module.exports = { recommendJobsForWorker, recommendWorkersForJob };
