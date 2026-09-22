const { z } = require('zod');

const uuid = z.string().uuid();

// Shared across worker/hirer — gender is optional and, when set to
// 'custom', requires the self-described value; any other value must
// NOT carry one (enforced in the controller, which nulls it out —
// see profileExtrasController/profileController).
const genderSchema = z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say', 'custom']).nullable().optional();
const genderCustomSchema = z.string().trim().min(1).max(60).nullable().optional();
const visibilitySchema = z.enum(['public', 'private']).optional();

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
  gender: genderSchema,
  genderCustom: genderCustomSchema,
  genderVisibility: visibilitySchema,
});

const updateHirerProfileSchema = z.object({
  displayName: z.string().trim().max(150).optional(),
  isCompany: z.boolean().optional(),
  bio: z.string().trim().max(2000).optional(),
  stateId: uuid.optional(),
  lgaId: uuid.optional(),
  areaId: uuid.optional(),
  profilePictureUrl: z.string().url().optional(),
  gender: genderSchema,
  genderCustom: genderCustomSchema,
  genderVisibility: visibilitySchema,
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

const educationTypeSchema = z.enum([
  'university', 'college', 'polytechnic', 'secondary_school',
  'vocational_training', 'professional_training', 'certification', 'online',
]);

const createEducationSchema = z.object({
  institution: z.string().trim().min(2).max(200),
  educationType: educationTypeSchema.optional(),
  degree: z.string().trim().max(150).optional(),
  fieldOfStudy: z.string().trim().max(150).optional(),
  location: z.string().trim().max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  isCurrent: z.boolean().optional(),
  visibility: visibilitySchema,
});
const updateEducationSchema = createEducationSchema.partial();
const reorderEducationSchema = z.object({ orderedIds: z.array(uuid).min(1).max(50) });

const updateCvVisibilitySchema = z.object({
  visibility: z.enum(['public', 'private', 'verified_hirers_only']),
});

const updateCvSchema = z.object({
  cvType: z.enum(['uploaded_file', 'built']).optional(),
  storagePath: z.string().trim().min(1).max(500).optional(),
  fileName: z.string().trim().max(255).optional(),
  mimeType: z.string().trim().max(100).optional(),
  fileSize: z.number().int().positive().max(15 * 1024 * 1024).optional(),
  visibility: z.enum(['public', 'private', 'verified_hirers_only']).optional(),
});

const upsertBusinessProfileSchema = z.object({
  // Required to CREATE a business profile, but a PUT that only touches
  // one field (e.g. just the storefront photo or isEnabled) on an
  // already-existing profile shouldn't have to resend it — the service
  // layer itself enforces "required on first create" (businessProfileService.upsert).
  businessName: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  stateId: uuid.optional(),
  lgaId: uuid.optional(),
  areaId: uuid.optional(),
  address: z.string().trim().max(255).optional(),
  landmark: z.string().trim().max(255).optional(),
  openingHours: z.string().trim().max(255).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  contactEmail: z.string().trim().email().max(255).optional(),
  storefrontPhotoUrl: z.string().url().nullable().optional(),
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

const upsertSocialLinkSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  isEnabled: z.boolean().optional(),
});
const setSocialLinkEnabledSchema = z.object({
  isEnabled: z.boolean(),
});

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
    gender: 'gender',
    genderCustom: 'gender_custom',
    genderVisibility: 'gender_visibility',
    institution: 'institution',
    educationType: 'education_type',
    fieldOfStudy: 'field_of_study',
    visibility: 'visibility',
    cvType: 'cv_type',
    storagePath: 'storage_path',
    fileName: 'file_name',
    mimeType: 'mime_type',
    fileSize: 'file_size',
  };
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    out[map[key] || key] = value;
  }
  return out;
}

/**
 * gender_custom only means anything alongside gender='custom' — if the
 * request sets gender to anything else (or clears it), any custom text
 * that slipped through must not be silently kept around from a
 * previous save.
 */
function normalizeGenderInput(input) {
  if ('gender' in input && input.gender !== 'custom') {
    input.gender_custom = null;
  }
  return input;
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
  createEducationSchema,
  updateEducationSchema,
  reorderEducationSchema,
  updateCvSchema,
  updateCvVisibilitySchema,
  upsertBusinessProfileSchema,
  addBusinessMediaSchema,
  upsertSocialLinkSchema,
  setSocialLinkEnabledSchema,
  createProfessionalServiceSchema,
  updateProfessionalServiceSchema,
  reportProfileSchema,
  toSnakeCaseProfileInput,
  normalizeGenderInput,
  validateBody,
};
