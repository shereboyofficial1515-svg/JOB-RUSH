const savedItemsService = require('../services/savedItemsService');
const asyncHandler = require('../utils/asyncHandler');

const saveJob = asyncHandler(async (req, res) => {
  await savedItemsService.saveJob(req.user.id, req.params.jobId);
  res.status(200).json({ message: 'Job saved.' });
});

const unsaveJob = asyncHandler(async (req, res) => {
  await savedItemsService.unsaveJob(req.user.id, req.params.jobId);
  res.status(200).json({ message: 'Job removed from saved list.' });
});

const listSavedJobs = asyncHandler(async (req, res) => {
  const jobs = await savedItemsService.listSavedJobs(req.user.id);
  res.status(200).json({ jobs });
});

const saveProfile = asyncHandler(async (req, res) => {
  await savedItemsService.saveProfile(req.user.id, req.params.workerUserId);
  res.status(200).json({ message: 'Profile saved.' });
});

const unsaveProfile = asyncHandler(async (req, res) => {
  await savedItemsService.unsaveProfile(req.user.id, req.params.workerUserId);
  res.status(200).json({ message: 'Profile removed from saved list.' });
});

const listSavedProfiles = asyncHandler(async (req, res) => {
  const profiles = await savedItemsService.listSavedProfiles(req.user.id);
  res.status(200).json({ profiles });
});

module.exports = { saveJob, unsaveJob, listSavedJobs, saveProfile, unsaveProfile, listSavedProfiles };
