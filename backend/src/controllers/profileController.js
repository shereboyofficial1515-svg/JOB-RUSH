const profileService = require('../services/profileService');
const asyncHandler = require('../utils/asyncHandler');
const { toSnakeCaseProfileInput, normalizeGenderInput } = require('../validators/profileValidators');

/**
 * `SELECT wp.*`/`SELECT hp.*` in profileService pulls back every
 * column, including gender/gender_custom — correct for the owner's
 * own read, wrong for anyone else's, since gender_visibility is a
 * per-field opt-in, not something `profile_visibility`'s public/
 * private split already covers. Strips it before a non-owner ever
 * sees the response.
 */
function redactGenderForViewer(profile, isOwner) {
  if (!profile || isOwner || profile.gender_visibility === 'public') return profile;
  const { gender, gender_custom, ...rest } = profile;
  return rest;
}

/**
 * The profile queries pull back every column plus the account's email and phone, which is right
 * for the owner's own read and wrong for anyone else's: this endpoint is public (no login), and
 * search hands out user ids, so leaving these in let anyone harvest contact details and the
 * private home address. Non-owners get only what the public profile page shows.
 */
const PRIVATE_PROFILE_FIELDS = [
  'email', 'phone', 'email_verified_at', 'phone_verified_at', 'street_address', 'landmark',
  'account_status', 'deactivated_at', 'profile_visibility', 'service_radius_km', 'profile_completion_percent',
];
function redactPrivateForViewer(profile, isOwner) {
  if (!profile || isOwner) return profile;
  const out = { ...profile };
  for (const f of PRIVATE_PROFILE_FIELDS) delete out[f];
  return out;
}

/**
 * GET /api/profiles/worker/:userId — public profile view.
 * A private profile (or a deactivated/disabled account) reads as
 * "not found" to anyone but the profile's own owner — never revealed
 * as "exists but hidden," which would itself leak information.
 */
const getWorkerProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getWorkerProfile(req.params.userId);
  const isOwner = req.user?.id === req.params.userId;
  const isHidden =
    !profile ||
    profile.account_status !== 'active' ||
    profile.deactivated_at ||
    (profile.profile_visibility === 'private' && !isOwner);

  if (isHidden) return res.status(404).json({ error: 'Profile not found.', code: 'NOT_FOUND' });
  res.status(200).json({ profile: redactPrivateForViewer(redactGenderForViewer(profile, isOwner), isOwner) });
});

/** GET /api/profiles/worker/search — public browse/search */
const searchWorkers = asyncHandler(async (req, res) => {
  const profiles = await profileService.searchWorkers(req.query);
  res.status(200).json({ profiles });
});

/** GET /api/profiles/worker/me — the caller's own profile */
const getOwnWorkerProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getWorkerProfile(req.user.id);
  res.status(200).json({ profile });
});

/**
 * PATCH /api/profiles/worker/me
 * `req.user.id` (from the session, via `authenticate`) is the only
 * source of whose profile this updates — there is no userId in the
 * body or URL for this route, so it's impossible to target someone
 * else's profile through this endpoint.
 */
const updateOwnWorkerProfile = asyncHandler(async (req, res) => {
  const input = normalizeGenderInput(toSnakeCaseProfileInput(req.body));
  const profile = await profileService.updateWorkerProfile(req.user.id, input);
  res.status(200).json({ profile });
});

const getHirerProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getHirerProfile(req.params.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found.', code: 'NOT_FOUND' });
  const isOwner = req.user?.id === req.params.userId;
  res.status(200).json({ profile: redactPrivateForViewer(redactGenderForViewer(profile, isOwner), isOwner) });
});

const getOwnHirerProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getHirerProfile(req.user.id);
  res.status(200).json({ profile });
});

const updateOwnHirerProfile = asyncHandler(async (req, res) => {
  const input = normalizeGenderInput(toSnakeCaseProfileInput(req.body));
  const profile = await profileService.updateHirerProfile(req.user.id, input);
  res.status(200).json({ profile });
});

module.exports = {
  getWorkerProfile,
  searchWorkers,
  getOwnWorkerProfile,
  updateOwnWorkerProfile,
  getHirerProfile,
  getOwnHirerProfile,
  updateOwnHirerProfile,
};
