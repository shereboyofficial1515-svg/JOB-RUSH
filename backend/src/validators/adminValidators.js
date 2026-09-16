const { z } = require('zod');

const uuid = z.string().uuid();

const suspendUserSchema = z.object({ reason: z.string().trim().max(500).optional() });
const disableUserSchema = z.object({ reason: z.string().trim().max(500).optional() });

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  parentCategoryId: uuid.optional(),
  sortOrder: z.number().int().optional(),
});
const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  parentCategoryId: uuid.optional(),
});

const createSkillSchema = z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: uuid.optional(),
});
const updateSkillSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  isActive: z.boolean().optional(),
  categoryId: uuid.optional(),
});

const setStateActiveSchema = z.object({ isActive: z.boolean() });
const createLgaSchema = z.object({ name: z.string().trim().min(2).max(100) });
const createAreaSchema = z.object({ name: z.string().trim().min(2).max(120) });

const reportJobSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const adminRemoveJobSchema = z.object({ reason: z.string().trim().max(500).optional() });
const hideJobSchema = z.object({ reason: z.string().trim().max(500).optional() });

const reportPortfolioSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const hidePortfolioSchema = z.object({ reason: z.string().trim().max(500).optional() });

const removeMessageSchema = z.object({ reason: z.string().trim().max(500).optional() });

const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(3000),
  category: z
    .enum(['account', 'payment', 'technical', 'other', 'suspicious_activity', 'report_user'])
    .optional(),
  attachmentPath: z.string().trim().max(500).optional(),
  reportedUserId: uuid.optional(),
});
const respondTicketSchema = z.object({
  response: z.string().trim().min(3).max(3000),
  status: z.enum(['in_progress', 'awaiting_response', 'resolved', 'closed']).optional(),
});

const createPlacementSchema = z.object({
  placementType: z.enum(['homepage', 'category', 'location', 'spotlight']),
  workerUserId: uuid,
  categoryId: uuid.optional(),
  stateId: uuid.optional(),
  endsAt: z.string().datetime().optional(),
});

const ADMIN_ROLES = ['super_admin', 'verification_admin', 'support_admin', 'finance_admin', 'moderation_admin', 'content_admin'];

const grantAdminRoleSchema = z
  .object({
    userId: uuid.optional(),
    email: z.string().trim().email().optional(),
    adminRole: z.enum(ADMIN_ROLES),
    requires2FA: z.boolean().default(true),
  })
  .refine((v) => v.userId || v.email, { message: 'Provide either userId or email.' });

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
  suspendUserSchema,
  disableUserSchema,
  createCategorySchema,
  updateCategorySchema,
  createSkillSchema,
  updateSkillSchema,
  setStateActiveSchema,
  createLgaSchema,
  createAreaSchema,
  reportJobSchema,
  adminRemoveJobSchema,
  hideJobSchema,
  reportPortfolioSchema,
  hidePortfolioSchema,
  removeMessageSchema,
  createTicketSchema,
  respondTicketSchema,
  createPlacementSchema,
  ADMIN_ROLES,
  grantAdminRoleSchema,
  validateBody,
};
