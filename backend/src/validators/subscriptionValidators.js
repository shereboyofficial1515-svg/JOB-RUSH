const { z } = require('zod');

const initiateSubscriptionSchema = z.object({
  callbackUrl: z.string().url(),
});

const suspendSubscriptionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
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

module.exports = { initiateSubscriptionSchema, suspendSubscriptionSchema, validateBody };
