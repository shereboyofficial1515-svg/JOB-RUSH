const express = require('express');
const conversationController = require('../controllers/messageController');
const blockController = require('../controllers/blockController');
const callController = require('../controllers/callController');
const { authenticate } = require('../middleware/authenticate');
const {
  validateBody,
  startConversationSchema,
  sendMessageSchema,
  editMessageSchema,
  reportMessageSchema,
  blockUserSchema,
  initiateCallSchema,
  updateCallStatusSchema,
} = require('../validators/messagingValidators');

const router = express.Router();

router.use(authenticate);

// Conversations
router.get('/conversations', conversationController.listConversations);
router.post('/conversations', validateBody(startConversationSchema), conversationController.startConversation);
router.post('/conversations/:id/read', conversationController.markRead);
router.post('/conversations/:id/clear', conversationController.clearChat);

// Messages
router.get('/conversations/:id/messages', conversationController.listMessages);
router.post('/conversations/:id/messages', validateBody(sendMessageSchema), conversationController.sendMessage);
router.patch('/messages/:messageId', validateBody(editMessageSchema), conversationController.editMessage);
router.delete('/messages/:messageId', conversationController.deleteMessage);
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
router.post('/calls/:id/status', validateBody(updateCallStatusSchema), callController.updateStatus);
router.get('/calls/:id/token', callController.getCallToken);

module.exports = router;
