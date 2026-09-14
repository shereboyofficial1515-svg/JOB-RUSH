const { z } = require('zod');

const uuid = z.string().uuid();

const scheduleInterviewSchema = z
  .object({
    applicationId: uuid.optional(),
    jobId: uuid.optional(),
    workerUserId: uuid.optional(),
    interviewType: z.enum(['video', 'audio', 'text', 'in_person']),
    scheduledStartAt: z.string().datetime(),
    durationMinutes: z.number().int().min(10).max(240).optional(),
    timezone: z.string().max(60).optional(),
    locationAddress: z.string().trim().max(500).optional(),
    locationInstructions: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.applicationId || data.workerUserId, {
    message: 'Either applicationId or workerUserId is required',
    path: ['applicationId'],
  });

const respondSchema = z.object({ accept: z.boolean() });

const rescheduleRequestSchema = z.object({ proposedStartAt: z.string().datetime() });
const rescheduleConfirmSchema = z.object({ newStartAt: z.string().datetime() });

const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });

const addQuestionSchema = z.object({
  questionText: z.string().trim().min(2).max(500),
  sortOrder: z.number().int().optional(),
});
const updateQuestionSchema = z.object({
  questionText: z.string().trim().min(2).max(500).optional(),
  sortOrder: z.number().int().optional(),
  isAnswered: z.boolean().optional(),
});

const addNoteSchema = z.object({
  category: z
    .enum(['technical_skills', 'communication', 'experience', 'availability', 'salary_expectations', 'overall'])
    .optional(),
  noteText: z.string().trim().min(1).max(2000),
});
const updateNoteSchema = addNoteSchema.partial();

const submitEvaluationSchema = z.object({
  technicalSkillsRating: z.number().int().min(1).max(5).optional(),
  communicationRating: z.number().int().min(1).max(5).optional(),
  experienceRating: z.number().int().min(1).max(5).optional(),
  availabilityNotes: z.string().trim().max(1000).optional(),
  overallAssessment: z.string().trim().max(2000).optional(),
  recommendation: z.enum(['strong_candidate', 'consider', 'not_suitable']),
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
  scheduleInterviewSchema,
  respondSchema,
  rescheduleRequestSchema,
  rescheduleConfirmSchema,
  cancelSchema,
  addQuestionSchema,
  updateQuestionSchema,
  addNoteSchema,
  updateNoteSchema,
  submitEvaluationSchema,
  validateBody,
};
