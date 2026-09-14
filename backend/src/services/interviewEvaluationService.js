const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const interviewService = require('./interviewService');

async function assertHirer(interviewId, hirerUserId) {
  const interview = await interviewService.assertParticipant(interviewId, hirerUserId);
  if (interview.caller_role !== 'hirer') {
    throw new AppError('Only the hirer can record an interview evaluation.', 403, 'FORBIDDEN');
  }
  return interview;
}

async function getEvaluation(interviewId, hirerUserId) {
  await assertHirer(interviewId, hirerUserId);
  const { rows } = await query('SELECT * FROM interview_evaluations WHERE interview_id = $1', [interviewId]);
  return rows[0] || null;
}

/**
 * Upserts the single evaluation for an interview. One row per
 * interview is enforced by the DB's UNIQUE constraint on
 * interview_id, not just by this upsert logic.
 */
async function submitEvaluation(interviewId, hirerUserId, input) {
  await assertHirer(interviewId, hirerUserId);

  const { rows } = await query(
    `INSERT INTO interview_evaluations (
       interview_id, hirer_user_id, technical_skills_rating, communication_rating,
       experience_rating, availability_notes, overall_assessment, recommendation
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (interview_id) DO UPDATE SET
       technical_skills_rating = EXCLUDED.technical_skills_rating,
       communication_rating = EXCLUDED.communication_rating,
       experience_rating = EXCLUDED.experience_rating,
       availability_notes = EXCLUDED.availability_notes,
       overall_assessment = EXCLUDED.overall_assessment,
       recommendation = EXCLUDED.recommendation
     RETURNING *`,
    [
      interviewId,
      hirerUserId,
      input.technicalSkillsRating ?? null,
      input.communicationRating ?? null,
      input.experienceRating ?? null,
      input.availabilityNotes || null,
      input.overallAssessment || null,
      input.recommendation,
    ]
  );
  return rows[0];
}

module.exports = { getEvaluation, submitEvaluation };
