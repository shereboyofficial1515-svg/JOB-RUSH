const conversationService = require('../services/conversationService');
const messageService = require('../services/messageService');
const reportService = require('../services/reportService');
const storageService = require('../services/storageService');
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const startConversation = asyncHandler(async (req, res) => {
  const conversation = await conversationService.getOrCreateConversation(
    req.user.id,
    req.body.otherUserId,
    req.body.jobId
  );
  res.status(201).json({ conversation });
});

const listConversations = asyncHandler(async (req, res) => {
  const conversations = await conversationService.listConversationsForUser(req.user.id);
  res.status(200).json({ conversations });
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
  const message = await messageService.deleteMessage(req.params.messageId, req.user.id);
  res.status(200).json({ message });
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
    `SELECT mm.*, m.conversation_id FROM message_media mm
       JOIN messages m ON m.id = mm.message_id
      WHERE mm.id = $1 AND mm.message_id = $2`,
    [req.params.mediaId, req.params.messageId]
  );
  const media = rows[0];
  if (!media) throw new AppError('Media not found.', 404, 'NOT_FOUND');

  await conversationService.assertParticipant(media.conversation_id, req.user.id); // authorization check

  const signedUrl = await storageService.getSignedUrl('CHAT_MEDIA', media.storage_path, 300);
  res.status(200).json({ signedUrl });
});

module.exports = {
  startConversation,
  listConversations,
  markRead,
  clearChat,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  searchMessages,
  reportMessage,
  getMediaUrl,
};
