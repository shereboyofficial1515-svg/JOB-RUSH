const portfolioService = require('../services/portfolioService');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/portfolio/worker/:workerUserId — public view of a worker's portfolio */
const listForWorker = asyncHandler(async (req, res) => {
  const portfolios = await portfolioService.listPortfoliosForWorker(req.params.workerUserId);
  res.status(200).json({ portfolios });
});

/** GET /api/portfolio/me */
const listOwn = asyncHandler(async (req, res) => {
  const portfolios = await portfolioService.listPortfoliosForWorker(req.user.id);
  res.status(200).json({ portfolios });
});

/**
 * GET /api/portfolio/:id — public Portfolio Project Details view.
 * `attachUserIfPresent` (not `authenticate`) on this route means
 * req.user may be undefined for an anonymous visitor — the service
 * only uses it to let the project's own owner see it even while their
 * profile is set to private.
 */
const getById = asyncHandler(async (req, res) => {
  const portfolio = await portfolioService.getPortfolioDetails(req.params.id, req.user?.id);
  res.status(200).json({ portfolio });
});

/** POST /api/portfolio — worker_user_id is always req.user.id, never client-supplied */
const create = asyncHandler(async (req, res) => {
  const portfolio = await portfolioService.createPortfolio(req.user.id, req.body);
  res.status(201).json({ portfolio });
});

/** PATCH /api/portfolio/:id — ownership enforced inside the service, not just by the route */
const update = asyncHandler(async (req, res) => {
  const portfolio = await portfolioService.updatePortfolio(req.params.id, req.user.id, req.body);
  res.status(200).json({ portfolio });
});

const remove = asyncHandler(async (req, res) => {
  await portfolioService.deletePortfolio(req.params.id, req.user.id);
  res.status(200).json({ message: 'Portfolio project deleted.' });
});

const addMedia = asyncHandler(async (req, res) => {
  const media = await portfolioService.addPortfolioMedia(req.params.id, req.user.id, req.body);
  res.status(201).json({ media });
});

const removeMedia = asyncHandler(async (req, res) => {
  await portfolioService.removePortfolioMedia(req.params.id, req.params.mediaId, req.user.id);
  res.status(200).json({ message: 'Media removed.' });
});

const reorderMedia = asyncHandler(async (req, res) => {
  const media = await portfolioService.reorderPortfolioMedia(req.params.id, req.user.id, req.body.mediaIds);
  res.status(200).json({ media });
});

const setPrimaryMedia = asyncHandler(async (req, res) => {
  const media = await portfolioService.setPrimaryPortfolioMedia(req.params.id, req.params.mediaId, req.user.id);
  res.status(200).json({ media });
});

module.exports = {
  listForWorker,
  listOwn,
  getById,
  create,
  update,
  remove,
  addMedia,
  removeMedia,
  reorderMedia,
  setPrimaryMedia,
};
