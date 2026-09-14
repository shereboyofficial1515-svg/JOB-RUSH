const profileService = require('../services/profileService');
const asyncHandler = require('../utils/asyncHandler');
const { toSnakeCaseProfileInput } = require('../validators/profileValidators');

/** GET /api/profiles/worker/:userId — public profile view */
const getWorkerProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getWorkerProfile(req.params.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found.', code: 'NOT_FOUND' });
  res.status(200).json({ profile });
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
  const input = toSnakeCaseProfileInput(req.body);
  const profile = await profileService.updateWorkerProfile(req.user.id, input);
  res.status(200).json({ profile });
});

const getHirerProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getHirerProfile(req.params.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found.', code: 'NOT_FOUND' });
  res.status(200).json({ profile });
});

const getOwnHirerProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getHirerProfile(req.user.id);
  res.status(200).json({ profile });
});

const updateOwnHirerProfile = asyncHandler(async (req, res) => {
  const input = toSnakeCaseProfileInput(req.body);
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
