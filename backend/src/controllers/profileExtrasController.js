const workExperienceService = require('../services/workExperienceService');
const businessProfileService = require('../services/businessProfileService');
const professionalServiceService = require('../services/professionalServiceService');
const profileReportService = require('../services/profileReportService');
const asyncHandler = require('../utils/asyncHandler');
const { toSnakeCaseProfileInput } = require('../validators/profileValidators');

// ---------- Work experience ----------
const listOwnExperience = asyncHandler(async (req, res) => {
  const entries = await workExperienceService.listForWorker(req.user.id);
  res.status(200).json({ entries });
});
const listExperienceForWorker = asyncHandler(async (req, res) => {
  const entries = await workExperienceService.listForWorker(req.params.userId);
  res.status(200).json({ entries });
});
const createExperience = asyncHandler(async (req, res) => {
  const entry = await workExperienceService.create(req.user.id, toSnakeCaseProfileInput(req.body));
  res.status(201).json({ entry });
});
const updateExperience = asyncHandler(async (req, res) => {
  const entry = await workExperienceService.update(req.params.id, req.user.id, toSnakeCaseProfileInput(req.body));
  res.status(200).json({ entry });
});
const deleteExperience = asyncHandler(async (req, res) => {
  await workExperienceService.remove(req.params.id, req.user.id);
  res.status(200).json({ message: 'Removed.' });
});
const reorderExperience = asyncHandler(async (req, res) => {
  const entries = await workExperienceService.reorder(req.user.id, req.body.orderedIds);
  res.status(200).json({ entries });
});

// ---------- Business profile ----------
const getOwnBusinessProfile = asyncHandler(async (req, res) => {
  const profile = await businessProfileService.getOwn(req.user.id);
  res.status(200).json({ profile });
});
const getBusinessProfileForWorker = asyncHandler(async (req, res) => {
  const profile = await businessProfileService.getPublic(req.params.userId);
  if (!profile) return res.status(404).json({ error: 'Business profile not found.', code: 'NOT_FOUND' });
  res.status(200).json({ profile });
});
const upsertBusinessProfile = asyncHandler(async (req, res) => {
  const profile = await businessProfileService.upsert(req.user.id, toSnakeCaseProfileInput(req.body));
  res.status(200).json({ profile });
});
const deleteBusinessProfile = asyncHandler(async (req, res) => {
  await businessProfileService.remove(req.user.id);
  res.status(200).json({ message: 'Business profile removed.' });
});
const addBusinessMedia = asyncHandler(async (req, res) => {
  const media = await businessProfileService.addMedia(req.user.id, req.body.mediaUrl);
  res.status(201).json({ media });
});
const removeBusinessMedia = asyncHandler(async (req, res) => {
  await businessProfileService.removeMedia(req.params.id, req.user.id);
  res.status(200).json({ message: 'Removed.' });
});

// ---------- Professional services ----------
const listOwnServices = asyncHandler(async (req, res) => {
  const services = await professionalServiceService.listForWorker(req.user.id);
  res.status(200).json({ services });
});
const listServicesForWorker = asyncHandler(async (req, res) => {
  const services = await professionalServiceService.listForWorker(req.params.userId, { activeOnly: true });
  res.status(200).json({ services });
});
const createService = asyncHandler(async (req, res) => {
  const service = await professionalServiceService.create(req.user.id, toSnakeCaseProfileInput(req.body));
  res.status(201).json({ service });
});
const updateService = asyncHandler(async (req, res) => {
  const service = await professionalServiceService.update(req.params.id, req.user.id, toSnakeCaseProfileInput(req.body));
  res.status(200).json({ service });
});
const deleteService = asyncHandler(async (req, res) => {
  await professionalServiceService.remove(req.params.id, req.user.id);
  res.status(200).json({ message: 'Removed.' });
});

// ---------- Profile reports ----------
const reportProfile = asyncHandler(async (req, res) => {
  const report = await profileReportService.reportProfile(req.user.id, req.params.userId, req.body);
  res.status(201).json({ report });
});

module.exports = {
  listOwnExperience,
  listExperienceForWorker,
  createExperience,
  updateExperience,
  deleteExperience,
  reorderExperience,
  getOwnBusinessProfile,
  getBusinessProfileForWorker,
  upsertBusinessProfile,
  deleteBusinessProfile,
  addBusinessMedia,
  removeBusinessMedia,
  listOwnServices,
  listServicesForWorker,
  createService,
  updateService,
  deleteService,
  reportProfile,
};
