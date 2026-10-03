const express = require('express');
const conversationController = require('../controllers/messageController');
const blockController = require('../controllers/blockController');
const callController = require('../controllers/callController');
const realtimeHub = require('../services/realtimeHub');
const { authenticate } = require('../middleware/authenticate');
const {
  validateBody,
  startConversationSchema,
  sendMessageSchema,
  editMessageSchema,
  muteConversationSchema,
  reportMessageSchema,
  blockUserSchema,
  initiateCallSchema,
  updateCallStatusSchema,
} = require('../validators/messagingValidators');

const router = express.Router();

router.use(authenticate);

// Realtime push channel (Server-Sent Events): new/edited/deleted messages,
// pins, read receipts, incoming calls. See services/realtimeHub.js.
router.get('/stream', realtimeHub.openStream);

// Conversations
router.get('/conversations', conversationController.listConversations);
router.get('/conversations/unread-count', conversationController.unreadCount);
router.post('/conversations', validateBody(startConversationSchema), conversationController.startConversation);
router.get('/conversations/:id', conversationController.getConversation);
router.post('/conversations/:id/read', conversationController.markRead);
router.post('/conversations/:id/mute', validateBody(muteConversationSchema), conversationController.muteConversation);
router.post('/conversations/:id/clear', conversationController.clearChat);
router.post('/conversations/:id/archive', conversationController.archiveConversation);
router.post('/conversations/:id/unarchive', conversationController.unarchiveConversation);

// Messages
router.get('/conversations/:id/messages', conversationController.listMessages);
router.get('/conversations/:id/messages/search', conversationController.searchConversation);
router.get('/conversations/:id/pins', conversationController.listPinned);
router.get('/conversations/:id/media', conversationController.listConversationMedia);
router.post('/conversations/:id/messages', validateBody(sendMessageSchema), conversationController.sendMessage);
router.patch('/messages/:messageId', validateBody(editMessageSchema), conversationController.editMessage);
router.delete('/messages/:messageId', conversationController.deleteMessage);
router.post('/messages/:messageId/pin', conversationController.pinMessage);
router.delete('/messages/:messageId/pin', conversationController.unpinMessage);
router.post('/messages/:messageId/report', validateBody(reportMessageSchema), conversationController.reportMessage);
router.get('/messages/search', conversationController.searchMessages);
router.get('/messages/:messageId/media/:mediaId/url', conversationController.getMediaUrl);

// Blocking
router.post('/block', validateBody(blockUserSchema), blockController.blockUser);
router.delete('/block/:userId', blockController.unblockUser);
router.get('/block', blockController.listBlocked);

// Calls
router.post(
  '/conversations/:conversationId/calls',
  validateBody(initiateCallSchema),
  callController.initiateCall
);
router.get('/conversations/:conversationId/calls', callController.listForConversation);
// /calls/incoming must be registered before /calls/:id, or Express's
// :id param would match the literal path segment "incoming" first.
router.get('/calls/incoming', callController.getIncomingCall);
router.get('/calls/:id', callController.getCallStatus);
router.post('/calls/:id/status', validateBody(updateCallStatusSchema), callController.updateStatus);
router.get('/calls/:id/token', callController.getCallToken);

module.exports = router;
