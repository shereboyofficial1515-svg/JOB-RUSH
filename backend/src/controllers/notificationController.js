const notificationService = require('../services/notificationService');
const pushService = require('../services/pushService');
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

const getPushPublicKey = asyncHandler(async (req, res) => {
  res.status(200).json({ publicKey: pushService.getPublicKey(), configured: pushService.isConfigured });
});

const pushSubscribe = asyncHandler(async (req, res) => {
  await pushService.subscribe(req.user.id, req.body.subscription, req.headers['user-agent']);
  res.status(200).json({ message: 'Subscribed to push notifications.' });
});

const pushUnsubscribe = asyncHandler(async (req, res) => {
  await pushService.unsubscribe(req.user.id, req.body.endpoint);
  res.status(200).json({ message: 'Unsubscribed from push notifications.' });
});

module.exports = {
  list,
  unreadCount,
  markRead,
  markAllRead,
  getPreferences,
  updatePreferences,
  getPushPublicKey,
  pushSubscribe,
  pushUnsubscribe,
};
