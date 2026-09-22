const workExperienceService = require('../services/workExperienceService');
const educationService = require('../services/educationService');
const cvService = require('../services/cvService');
const businessProfileService = require('../services/businessProfileService');
const socialLinksService = require('../services/socialLinksService');
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

// ---------- Education ----------
const listOwnEducation = asyncHandler(async (req, res) => {
  const entries = await educationService.listForWorker(req.user.id);
  res.status(200).json({ entries });
});
const listEducationForWorker = asyncHandler(async (req, res) => {
  const entries = await educationService.listPublicForWorker(req.params.userId);
  res.status(200).json({ entries });
});
const createEducation = asyncHandler(async (req, res) => {
  const entry = await educationService.create(req.user.id, toSnakeCaseProfileInput(req.body));
  res.status(201).json({ entry });
});
const updateEducation = asyncHandler(async (req, res) => {
  const entry = await educationService.update(req.params.id, req.user.id, toSnakeCaseProfileInput(req.body));
  res.status(200).json({ entry });
});
const deleteEducation = asyncHandler(async (req, res) => {
  await educationService.remove(req.params.id, req.user.id);
  res.status(200).json({ message: 'Removed.' });
});
const reorderEducation = asyncHandler(async (req, res) => {
  const entries = await educationService.reorder(req.user.id, req.body.orderedIds);
  res.status(200).json({ entries });
});

// ---------- CV / résumé ----------
const getOwnCv = asyncHandler(async (req, res) => {
  const cv = await cvService.getOwn(req.user.id);
  res.status(200).json({ cv });
});
const getCvForWorker = asyncHandler(async (req, res) => {
  const cv = await cvService.getForViewer(req.params.userId, req.user || null);
  res.status(200).json({ cv });
});
const upsertCv = asyncHandler(async (req, res) => {
  const cv = await cvService.upsert(req.user.id, toSnakeCaseProfileInput(req.body));
  res.status(200).json({ cv });
});
const updateCvVisibility = asyncHandler(async (req, res) => {
  const cv = await cvService.updateVisibility(req.user.id, req.body.visibility);
  res.status(200).json({ cv });
});
const deleteCv = asyncHandler(async (req, res) => {
  await cvService.remove(req.user.id);
  res.status(200).json({ message: 'CV removed.' });
});

// ---------- Business profile (worker OR hirer — a business can belong to either) ----------
// req.user.role can be 'both', which is not a valid business-profile owner
// role, so each route pair hardcodes which owner column it operates as
// (mirroring profileController's separate getWorkerProfile/getHirerProfile),
// rather than trusting req.user.role directly.
function makeGetOwnBusinessProfile(role) {
  return asyncHandler(async (req, res) => {
    const profile = await businessProfileService.getOwn(role, req.user.id);
    res.status(200).json({ profile });
  });
}
function makeUpsertBusinessProfile(role) {
  return asyncHandler(async (req, res) => {
    const profile = await businessProfileService.upsert(role, req.user.id, toSnakeCaseProfileInput(req.body));
    res.status(200).json({ profile });
  });
}
function makeDeleteBusinessProfile(role) {
  return asyncHandler(async (req, res) => {
    await businessProfileService.remove(role, req.user.id);
    res.status(200).json({ message: 'Business profile removed.' });
  });
}
function makeAddBusinessMedia(role) {
  return asyncHandler(async (req, res) => {
    const media = await businessProfileService.addMedia(role, req.user.id, req.body.mediaUrl);
    res.status(201).json({ media });
  });
}
function makeRemoveBusinessMedia(role) {
  return asyncHandler(async (req, res) => {
    await businessProfileService.removeMedia(req.params.id, role, req.user.id);
    res.status(200).json({ message: 'Removed.' });
  });
}

const getOwnBusinessProfile = makeGetOwnBusinessProfile('worker');
const upsertBusinessProfile = makeUpsertBusinessProfile('worker');
const deleteBusinessProfile = makeDeleteBusinessProfile('worker');
const addBusinessMedia = makeAddBusinessMedia('worker');
const removeBusinessMedia = makeRemoveBusinessMedia('worker');

const getOwnHirerBusinessProfile = makeGetOwnBusinessProfile('hirer');
const upsertHirerBusinessProfile = makeUpsertBusinessProfile('hirer');
const deleteHirerBusinessProfile = makeDeleteBusinessProfile('hirer');
const addHirerBusinessMedia = makeAddBusinessMedia('hirer');
const removeHirerBusinessMedia = makeRemoveBusinessMedia('hirer');

const getBusinessProfileForUser = asyncHandler(async (req, res) => {
  const profile = await businessProfileService.getPublicByUserId(req.params.userId);
  if (!profile) return res.status(404).json({ error: 'Business profile not found.', code: 'NOT_FOUND' });
  res.status(200).json({ profile });
});

// ---------- Social links (worker-only) ----------
const listOwnSocialLinks = asyncHandler(async (req, res) => {
  const links = await socialLinksService.listForWorker(req.user.id);
  res.status(200).json({ links });
});
const listSocialLinksForWorker = asyncHandler(async (req, res) => {
  const links = await socialLinksService.listPublicForWorker(req.params.userId);
  res.status(200).json({ links });
});
const upsertSocialLink = asyncHandler(async (req, res) => {
  const link = await socialLinksService.upsert(req.user.id, req.params.platform, req.body);
  res.status(200).json({ link });
});
const setSocialLinkEnabled = asyncHandler(async (req, res) => {
  const link = await socialLinksService.setEnabled(req.user.id, req.params.platform, req.body.isEnabled);
  res.status(200).json({ link });
});
const deleteSocialLink = asyncHandler(async (req, res) => {
  await socialLinksService.remove(req.user.id, req.params.platform);
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
  listOwnEducation,
  listEducationForWorker,
  createEducation,
  updateEducation,
  deleteEducation,
  reorderEducation,
  getOwnCv,
  getCvForWorker,
  upsertCv,
  updateCvVisibility,
  deleteCv,
  getOwnBusinessProfile,
  upsertBusinessProfile,
  deleteBusinessProfile,
  addBusinessMedia,
  removeBusinessMedia,
  getOwnHirerBusinessProfile,
  upsertHirerBusinessProfile,
  deleteHirerBusinessProfile,
  addHirerBusinessMedia,
  removeHirerBusinessMedia,
  getBusinessProfileForUser,
  listOwnSocialLinks,
  listSocialLinksForWorker,
  upsertSocialLink,
  setSocialLinkEnabled,
  deleteSocialLink,
  listOwnServices,
  listServicesForWorker,
  createService,
  updateService,
  deleteService,
  reportProfile,
};
