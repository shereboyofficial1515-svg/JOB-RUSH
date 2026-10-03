const conversationService = require('../services/conversationService');
const messageService = require('../services/messageService');
const reportService = require('../services/reportService');
const storageService = require('../services/storageService');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { deleteMessageQuerySchema } = require('../validators/messagingValidators');

const startConversation = asyncHandler(async (req, res) => {
  const conversation = await conversationService.getOrCreateConversation(
    req.user.id,
    req.body.otherUserId,
    req.body.jobId
  );
  res.status(201).json({ conversation });
});

const listConversations = asyncHandler(async (req, res) => {
  const archived = req.query.archived === 'true';
  const conversations = await conversationService.listConversationsForUser(req.user.id, { archived });
  res.status(200).json({ conversations });
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await conversationService.countUnreadForUser(req.user.id);
  res.status(200).json({ count });
});

const archiveConversation = asyncHandler(async (req, res) => {
  await conversationService.setArchived(req.params.id, req.user.id, true);
  res.status(200).json({ message: 'Chat archived.' });
});

const unarchiveConversation = asyncHandler(async (req, res) => {
  await conversationService.setArchived(req.params.id, req.user.id, false);
  res.status(200).json({ message: 'Chat unarchived.' });
});

const markRead = asyncHandler(async (req, res) => {
  await conversationService.markRead(req.params.id, req.user.id);
  res.status(200).json({ message: 'Marked as read.' });
});

const clearChat = asyncHandler(async (req, res) => {
  await conversationService.clearChat(req.params.id, req.user.id);
  res.status(200).json({ message: 'Chat cleared.' });
});

const listMessages = asyncHandler(async (req, res) => {
  const messages = await messageService.listMessages(req.params.id, req.user.id, req.query);
  res.status(200).json({ messages });
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await messageService.sendMessage(req.params.id, req.user.id, req.body);
  res.status(201).json({ message });
});

const editMessage = asyncHandler(async (req, res) => {
  const message = await messageService.editMessage(req.params.messageId, req.user.id, req.body.content);
  res.status(200).json({ message });
});

const deleteMessage = asyncHandler(async (req, res) => {
  const parsed = deleteMessageQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError('scope must be "everyone" or "me".', 400, 'VALIDATION_FAILED');
  const { scope } = parsed.data;
  const message = await messageService.deleteMessage(req.params.messageId, req.user.id, scope);
  res.status(200).json({ message });
});

const getConversation = asyncHandler(async (req, res) => {
  const conversation = await conversationService.getConversationDetail(req.params.id, req.user.id);
  res.status(200).json({ conversation });
});

const muteConversation = asyncHandler(async (req, res) => {
  const result = await conversationService.setMuted(req.params.id, req.user.id, req.body.duration);
  res.status(200).json(result);
});

const listPinned = asyncHandler(async (req, res) => {
  const messages = await messageService.listPinned(req.params.id, req.user.id);
  res.status(200).json({ messages });
});

const searchConversation = asyncHandler(async (req, res) => {
  const messages = await messageService.searchConversation(req.params.id, req.user.id, req.query.q);
  res.status(200).json({ messages });
});

const listConversationMedia = asyncHandler(async (req, res) => {
  const media = await messageService.listConversationMedia(req.params.id, req.user.id, req.query);
  res.status(200).json({ media });
});

const pinMessage = asyncHandler(async (req, res) => {
  res.status(200).json(await messageService.pinMessage(req.params.messageId, req.user.id));
});

const unpinMessage = asyncHandler(async (req, res) => {
  res.status(200).json(await messageService.unpinMessage(req.params.messageId, req.user.id));
});

const searchMessages = asyncHandler(async (req, res) => {
  const messages = await messageService.searchOwnMessages(req.user.id, req.query.q || '');
  res.status(200).json({ messages });
});

const reportMessage = asyncHandler(async (req, res) => {
  const report = await reportService.reportMessage(req.user.id, req.params.messageId, req.body.reason);
  res.status(201).json({ report });
});

/**
 * GET /api/messaging/messages/:messageId/media/:mediaId/url
 * Resolves a private chat-media object to a short-lived signed URL,
 * only after confirming the requester is a participant in the
 * conversation the message belongs to.
 */
const getMediaUrl = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT mm.*, m.conversation_id, m.deleted_at FROM message_media mm
       JOIN messages m ON m.id = mm.message_id
      WHERE mm.id = $1 AND mm.message_id = $2`,
    [req.params.mediaId, req.params.messageId]
  );
  const media = rows[0];
  if (!media || media.deleted_at) throw new AppError('Media not found.', 404, 'NOT_FOUND');

  await conversationService.assertParticipant(media.conversation_id, req.user.id); // authorization check

  // `variant=thumb` serves the small preview object for images (never the
  // full-size photo inside a conversation); `download=1` asks storage to send
  // it as an attachment under the sanitised original file name.
  const path = req.query.variant === 'thumb' && media.thumbnail_path ? media.thumbnail_path : media.storage_path;
  const downloadName = req.query.download === '1' ? (media.file_name || 'download') : undefined;
  const expiresIn = 300;
  const signedUrl = await storageService.getSignedUrl('CHAT_MEDIA', path, expiresIn, downloadName);
  res.status(200).json({ signedUrl, expiresIn });
});

module.exports = {
  startConversation,
  listConversations,
  unreadCount,
  archiveConversation,
  unarchiveConversation,
  markRead,
  clearChat,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  searchMessages,
  reportMessage,
  getConversation,
  muteConversation,
  listPinned,
  searchConversation,
  listConversationMedia,
  pinMessage,
  unpinMessage,
  getMediaUrl,
};
