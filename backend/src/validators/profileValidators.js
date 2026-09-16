const { z } = require('zod');

const uuid = z.string().uuid();

const updateWorkerProfileSchema = z.object({
  professionalTitle: z.string().trim().max(150).optional(),
  bio: z.string().trim().max(2000).optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
  availabilityStatus: z.enum(['available', 'busy', 'unavailable']).optional(),
  languages: z.array(z.string().trim().max(40)).max(10).optional(),
  stateId: uuid.optional(),
  lgaId: uuid.optional(),
  areaId: uuid.optional(),
  streetAddress: z.string().trim().max(255).optional(),
  landmark: z.string().trim().max(255).optional(),
  serviceRadiusKm: z.number().int().min(0).max(500).optional(),
  profilePictureUrl: z.string().url().optional(),
  skillIds: z.array(uuid).max(30).optional(),
  startingPrice: z.number().nonnegative().max(100000000).optional(),
  priceCurrency: z.enum(['NGN', 'USD']).optional(),
  workingDays: z.string().trim().max(100).optional(),
  workingHours: z.string().trim().max(100).optional(),
});

const updateHirerProfileSchema = z.object({
  displayName: z.string().trim().max(150).optional(),
  isCompany: z.boolean().optional(),
  bio: z.string().trim().max(2000).optional(),
  stateId: uuid.optional(),
  lgaId: uuid.optional(),
  areaId: uuid.optional(),
  profilePictureUrl: z.string().url().optional(),
});

// Only http(s) links are ever rendered as a real clickable external
// link — javascript:/data:/file: etc. are rejected here so there's
// never a stored value that would need scheme-sniffing at render time.
const externalLinkSchema = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((url) => /^https?:\/\//i.test(url), 'External link must start with http:// or https://');

const createPortfolioSchema = z.object({
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(3000).optional(),
  categoryId: uuid.optional(),
  projectType: z.string().trim().max(80).optional(),
  externalLink: externalLinkSchema.optional(),
});

const updatePortfolioSchema = createPortfolioSchema.partial();

const addPortfolioMediaSchema = z.object({
  mediaType: z.enum(['image', 'video', 'document']),
  storagePath: z.string().trim().min(1).max(500),
  isPrimary: z.boolean().optional(),
  fileSize: z.number().int().positive().max(200 * 1024 * 1024).optional(),
  durationSeconds: z.number().int().positive().max(120).optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
});

const reorderPortfolioMediaSchema = z.object({
  mediaIds: z.array(uuid).min(1).max(20),
});

const submitVerificationSchema = z.object({
  documents: z
    .array(
      z.object({
        documentType: z.string().trim().min(2).max(60),
        storagePath: z.string().trim().min(1).max(500),
        fileSize: z.number().int().positive().max(200 * 1024 * 1024).optional(),
      })
    )
    .min(1)
    .max(10),
});

const rejectVerificationSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
  requiresResubmission: z.boolean().default(false),
});

/**
 * Converts camelCase API input into the snake_case column names the
 * profile services expect, only for keys actually present.
 */
function toSnakeCaseProfileInput(body) {
  const map = {
    professionalTitle: 'professional_title',
    bio: 'bio',
    experienceYears: 'experience_years',
    availabilityStatus: 'availability_status',
    languages: 'languages',
    stateId: 'state_id',
    lgaId: 'lga_id',
    areaId: 'area_id',
    streetAddress: 'street_address',
    landmark: 'landmark',
    serviceRadiusKm: 'service_radius_km',
    profilePictureUrl: 'profile_picture_url',
    skillIds: 'skillIds', // handled specially in profileService, not a column
    startingPrice: 'starting_price',
    priceCurrency: 'price_currency',
    workingDays: 'working_days',
    workingHours: 'working_hours',
    displayName: 'display_name',
    isCompany: 'is_company',
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

module.exports = {
  updateWorkerProfileSchema,
  updateHirerProfileSchema,
  createPortfolioSchema,
  updatePortfolioSchema,
  addPortfolioMediaSchema,
  reorderPortfolioMediaSchema,
  submitVerificationSchema,
  rejectVerificationSchema,
  toSnakeCaseProfileInput,
  validateBody,
};
