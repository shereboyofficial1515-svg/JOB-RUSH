const { z } = require('zod');

// Every field is optional so a single switch can be saved on its own (e.g. only "Missed calls").
const updatePreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  // Category switches (see services/notificationCategories.js); unknown keys are ignored server-side.
  categories: z.record(z.string(), z.boolean()).optional(),
});

const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

const fcmTokenSchema = z.object({
  token: z.string().min(1),
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

module.exports = { updatePreferencesSchema, pushSubscribeSchema, pushUnsubscribeSchema, fcmTokenSchema, validateBody };
