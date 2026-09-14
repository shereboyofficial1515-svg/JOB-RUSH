const { z } = require('zod');

const uuid = z.string().uuid();

const createReviewSchema = z.object({
  contractId: uuid,
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().trim().max(2000).optional(),
});

const reportReviewSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const hideReviewSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const openDisputeSchema = z.object({
  contractId: uuid,
  reason: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(3000),
});

const addEvidenceSchema = z.object({
  fileType: z.enum(['image', 'video', 'document']),
  storagePath: z.string().min(1),
  description: z.string().trim().max(1000).optional(),
});

const updateDisputeStatusSchema = z.object({
  status: z.enum(['under_review', 'awaiting_information']),
});

const resolveDisputeSchema = z.object({
  decision: z.string().trim().min(3).max(2000),
  action: z.enum(['release_to_worker', 'refund_to_hirer']),
  reason: z.string().trim().max(1000).optional(),
});

const rejectDisputeSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
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
  createReviewSchema,
  reportReviewSchema,
  hideReviewSchema,
  openDisputeSchema,
  addEvidenceSchema,
  updateDisputeStatusSchema,
  resolveDisputeSchema,
  rejectDisputeSchema,
  validateBody,
};
