const { z } = require('zod');

const uuid = z.string().uuid();

const createJobSchema = z.object({
  title: z.string().trim().min(5).max(150),
  description: z.string().trim().min(20).max(5000),
  categoryId: uuid.optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'one_time']).optional(),
  experienceLevel: z.enum(['entry', 'intermediate', 'expert']).optional(),
  budgetType: z.enum(['fixed', 'hourly', 'salary']).optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
  stateId: uuid.optional(),
  lgaId: uuid.optional(),
  areaId: uuid.optional(),
  deadline: z.string().date().optional(),
  additionalRequirements: z.string().trim().max(2000).optional(),
  skillIds: z.array(uuid).max(20).optional(),
});

const updateJobSchema = createJobSchema.partial();

const jobStatusSchema = z.object({
  status: z.enum(['open', 'closed', 'filled', 'cancelled']),
});

const jobSearchSchema = z.object({
  categoryId: uuid.optional(),
  skillId: uuid.optional(),
  stateId: uuid.optional(),
  lgaId: uuid.optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'one_time']).optional(),
  experienceLevel: z.enum(['entry', 'intermediate', 'expert']).optional(),
  minBudget: z.coerce.number().nonnegative().optional(),
  keyword: z.string().trim().max(100).optional(),
  sort: z.enum(['newest', 'budget_high', 'deadline']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(50).optional(),
});

const applyToJobSchema = z.object({
  coverNote: z.string().trim().max(2000).optional(),
  proposedRate: z.number().nonnegative().optional(),
});

const inviteWorkerSchema = z.object({
  workerUserId: uuid,
});

const respondToInvitationSchema = z.object({
  accept: z.boolean(),
});

function toSnakeCaseJobInput(body) {
  const map = {
    categoryId: 'category_id',
    employmentType: 'employment_type',
    experienceLevel: 'experience_level',
    budgetType: 'budget_type',
    budgetMin: 'budget_min',
    budgetMax: 'budget_max',
    stateId: 'state_id',
    lgaId: 'lga_id',
    areaId: 'area_id',
    additionalRequirements: 'additional_requirements',
  };
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    out[map[key] || key] = value;
  }
  return out;
}

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

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    req.query = result.data;
    next();
  };
}

module.exports = {
  createJobSchema,
  updateJobSchema,
  jobStatusSchema,
  jobSearchSchema,
  applyToJobSchema,
  inviteWorkerSchema,
  respondToInvitationSchema,
  toSnakeCaseJobInput,
  validateBody,
  validateQuery,
};
