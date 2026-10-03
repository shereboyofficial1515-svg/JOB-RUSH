const { z } = require('zod');

const uuid = z.string().uuid();

const startConversationSchema = z.object({
  otherUserId: uuid,
  jobId: uuid.optional(),
});

// Attachment descriptors. Only the uploaded object's path (plus display
// metadata) comes from the client; the media type, MIME type and size are
// read back from storage by the server (see messageService.resolveMediaItems),
// so any messageType/mediaType the client still sends is ignored.
const mediaItemSchema = z.object({
  storagePath: z.string().min(1).max(200),
  thumbnailPath: z.string().min(1).max(200).nullish(),
  fileName: z.string().max(255).nullish(),
  durationSeconds: z.number().nonnegative().max(3600).nullish(),
  waveform: z.array(z.number().min(0).max(100)).max(80).nullish(),
  width: z.number().int().positive().max(20000).nullish(),
  height: z.number().int().positive().max(20000).nullish(),
});

const sendMessageSchema = z
  .object({
    content: z.string().trim().max(5000).optional(),
    mediaItems: z.array(mediaItemSchema).max(10).optional(),
    replyToMessageId: uuid.optional(),
    clientMessageId: uuid.optional(),
  })
  .refine((data) => data.content || (data.mediaItems && data.mediaItems.length > 0), {
    message: 'A message needs text content or at least one attachment',
    path: ['content'],
  });

const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

const muteConversationSchema = z.object({
  duration: z.enum(['8h', '1w', 'forever']).nullable(),
});

const deleteMessageQuerySchema = z.object({
  scope: z.enum(['everyone', 'me']).default('everyone'),
});

const reportMessageSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const blockUserSchema = z.object({
  userId: uuid,
});

const initiateCallSchema = z.object({
  callType: z.enum(['audio', 'video']),
});

const updateCallStatusSchema = z.object({
  status: z.enum([
    'ringing', 'connecting', 'connected', 'reconnecting',
    'busy', 'declined', 'missed', 'ended', 'failed', 'cancelled',
  ]),
  failureReason: z.string().trim().max(300).optional(),
});

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  startConversationSchema,
  sendMessageSchema,
  editMessageSchema,
  muteConversationSchema,
  deleteMessageQuerySchema,
  reportMessageSchema,
  blockUserSchema,
  initiateCallSchema,
  updateCallStatusSchema,
  validateBody,
};
