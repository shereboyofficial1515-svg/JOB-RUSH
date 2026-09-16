const { z } = require('zod');

const uuid = z.string().uuid();

const startConversationSchema = z.object({
  otherUserId: uuid,
  jobId: uuid.optional(),
});

const sendMessageSchema = z
  .object({
    content: z.string().trim().max(5000).optional(),
    messageType: z.enum(['text', 'image', 'video', 'document', 'voice_note']).optional(),
    mediaItems: z
      .array(
        z.object({
          mediaType: z.enum(['image', 'video', 'document', 'voice_note']),
          storagePath: z.string().min(1),
          fileSize: z.number().int().nonnegative().optional(),
        })
      )
      .max(10)
      .optional(),
  })
  .refine((data) => data.content || (data.mediaItems && data.mediaItems.length > 0), {
    message: 'A message needs text content or at least one attachment',
    path: ['content'],
  });

const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
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
  reportMessageSchema,
  blockUserSchema,
  initiateCallSchema,
  updateCallStatusSchema,
  validateBody,
};
