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
  thumbnailStoragePath: z.string().trim().min(1).max(500).optional(),
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

const createWorkExperienceSchema = z.object({
  jobTitle: z.string().trim().min(2).max(150),
  companyName: z.string().trim().max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(255).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  isCurrent: z.boolean().optional(),
  skillsUsed: z.array(z.string().trim().max(40)).max(20).optional(),
});
const updateWorkExperienceSchema = createWorkExperienceSchema.partial();
const reorderWorkExperienceSchema = z.object({ orderedIds: z.array(uuid).min(1).max(50) });

const upsertBusinessProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).optional(),
  stateId: uuid.optional(),
  lgaId: uuid.optional(),
  areaId: uuid.optional(),
  address: z.string().trim().max(255).optional(),
  landmark: z.string().trim().max(255).optional(),
  openingHours: z.string().trim().max(255).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  contactEmail: z.string().trim().email().max(255).optional(),
  storefrontPhotoUrl: z.string().url().optional(),
  isEnabled: z.boolean().optional(),
});
const addBusinessMediaSchema = z.object({ mediaUrl: z.string().url() });

const createProfessionalServiceSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).optional(),
  pricingType: z.enum(['hourly', 'daily', 'project', 'fixed', 'negotiable', 'contact_for_quote']).optional(),
  price: z.number().nonnegative().max(100000000).optional(),
  priceCurrency: z.enum(['NGN', 'USD']).optional(),
  durationEstimate: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(),
});
const updateProfessionalServiceSchema = createProfessionalServiceSchema.partial();

const reportProfileSchema = z.object({
  category: z.enum(['fake_profile', 'fraud_scam', 'inappropriate_content', 'false_information', 'harassment', 'spam', 'other']),
  reason: z.string().trim().min(5).max(1000),
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
    jobTitle: 'job_title',
    companyName: 'company_name',
    startDate: 'start_date',
    endDate: 'end_date',
    isCurrent: 'is_current',
    skillsUsed: 'skills_used',
    businessName: 'business_name',
    openingHours: 'opening_hours',
    contactPhone: 'contact_phone',
    contactEmail: 'contact_email',
    storefrontPhotoUrl: 'storefront_photo_url',
    isEnabled: 'is_enabled',
    pricingType: 'pricing_type',
    priceCurrency: 'price_currency',
    durationEstimate: 'duration_estimate',
    isActive: 'is_active',
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
  createWorkExperienceSchema,
  updateWorkExperienceSchema,
  reorderWorkExperienceSchema,
  upsertBusinessProfileSchema,
  addBusinessMediaSchema,
  createProfessionalServiceSchema,
  updateProfessionalServiceSchema,
  reportProfileSchema,
  toSnakeCaseProfileInput,
  validateBody,
};
