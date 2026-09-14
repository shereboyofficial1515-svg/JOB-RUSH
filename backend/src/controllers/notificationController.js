const notificationService = require('../services/notificationService');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const notifications = await notificationService.listForUser(req.user.id, {
    unreadOnly: req.query.unreadOnly === 'true',
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  res.status(200).json({ notifications });
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id);
  res.status(200).json({ count });
});

const markRead = asyncHandler(async (req, res) => {
  await notificationService.markRead(req.params.id, req.user.id);
  res.status(200).json({ message: 'Marked as read.' });
});

const markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllRead(req.user.id);
  res.status(200).json({ message: 'All notifications marked as read.' });
});

const getPreferences = asyncHandler(async (req, res) => {
  const preferences = await notificationService.getPreferences(req.user.id);
  res.status(200).json({ preferences });
});

const updatePreferences = asyncHandler(async (req, res) => {
  const preferences = await notificationService.updatePreferences(req.user.id, req.body);
  res.status(200).json({ preferences });
});

module.exports = { list, unreadCount, markRead, markAllRead, getPreferences, updatePreferences };
