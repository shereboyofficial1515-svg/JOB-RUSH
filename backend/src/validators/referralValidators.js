const { z } = require('zod');

const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedbackText: z.string().trim().min(1).max(2000),
});

const rejectRewardSchema = z.object({
  reason: z.string().trim().min(1).max(500),
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

module.exports = { submitFeedbackSchema, rejectRewardSchema, validateBody };
