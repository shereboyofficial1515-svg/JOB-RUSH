const { z } = require('zod');

const uuid = z.string().uuid();

const WEEKDAY_IDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// 24-hour HH:MM, matching the value a native <input type="time"> sends.
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour time (HH:MM).');

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
  coverPhotoUrl: z.string().url().nullable().optional(),
  skillIds: z.array(uuid).max(30).optional(),
  startingPrice: z.number().nonnegative().max(100000000).optional(),
  priceCurrency: z.enum(['NGN', 'USD']).optional(),
  workingDaysStructured: z.array(z.enum(WEEKDAY_IDS)).max(7).optional(),
  workingHoursStart: timeSchema.nullable().optional(),
  workingHoursEnd: timeSchema.nullable().optional(),
  workingHoursEndsNextDay: z.boolean().optional(),
  gender: genderSchema,
  genderCustom: genderCustomSchema,
  genderVisibility: visibilitySchema,
}).refine(
  (body) => (body.workingHoursStart == null) === (body.workingHoursEnd == null),
  { message: 'Both a start time and an end time are required.', path: ['workingHoursEnd'] }
).refine(
  (body) => {
    if (!body.workingHoursStart || !body.workingHoursEnd) return true;
    if (body.workingHoursEndsNextDay) return true; // any end time is valid once it's explicitly next-day
    return body.workingHoursEnd > body.workingHoursStart;
  },
  { message: 'End time must be after start time. Check "Ends next day" for an overnight schedule.', path: ['workingHoursEnd'] }
);

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

/**
 * Business opening hours: always all 7 days, Monday..Sunday, one entry per
 * day. A day is Closed, Open 24 hours, or Open with an opening and a closing
 * time (24-hour HH:MM, what <input type="time"> sends). A closing time that
 * is not after the opening time is rejected unless the day says it closes
 * the next day (overnight) -- we never reinterpret "10:00 -> 05:00" as
 * something the owner did not say.
 */
const businessDaySchema = z.object({
  day: z.enum(WEEKDAY_IDS),
  open: z.boolean(),
  is24h: z.boolean().optional(),
  opens: timeSchema.optional(),
  closes: timeSchema.optional(),
  endsNextDay: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if (!d.open || d.is24h) return;
  if (!d.opens || !d.closes) {
    ctx.addIssue({ code: 'custom', path: ['opens'], message: `Set opening and closing times for ${d.day}, or mark it Closed or Open 24 hours.` });
  } else if (d.opens === d.closes) {
    ctx.addIssue({ code: 'custom', path: ['closes'], message: `Opening and closing time cannot be the same on ${d.day}. Choose "Open 24 hours" if that is what you mean.` });
  } else if (d.closes < d.opens && !d.endsNextDay) {
    ctx.addIssue({ code: 'custom', path: ['closes'], message: `On ${d.day}, closing time must be after opening time. Tick "Closes next day" for overnight hours.` });
  }
});

const openingHoursStructuredSchema = z.array(businessDaySchema).length(7, 'Provide all 7 days, Monday to Sunday.').superRefine((days, ctx) => {
  days.forEach((d, i) => {
    if (d.day !== WEEKDAY_IDS[i]) ctx.addIssue({ code: 'custom', path: [i, 'day'], message: `Entry ${i + 1} must be ${WEEKDAY_IDS[i]}.` });
  });
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
  openingHoursStructured: openingHoursStructuredSchema.nullable().optional(),
  contactPhone: z.string().trim().max(30).optional(),
  contactEmail: z.string().trim().email().max(255).optional(),
  storefrontPhotoUrl: z.string().url().nullable().optional(),
  isEnabled: z.boolean().optional(),
});
const addBusinessMediaSchema = z.object({ mediaUrl: z.string().url() });

const DURATION_UNITS = ['hours', 'days', 'weeks', 'months', 'years'];
const SERVICE_PRICING_TYPES = ['hourly', 'daily', 'weekly', 'monthly', 'project', 'fixed', 'negotiable', 'contact_for_quote'];

// Price and duration are different things: price + priceCurrency + pricingType
// say what it costs and per what; durationValue + durationUnit say how long
// the work takes. A duration always travels as a pair, so there is never an
// unexplained number: send both, or both null to clear it.
const serviceFields = {
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).optional(),
  pricingType: z.enum(SERVICE_PRICING_TYPES).optional(),
  price: z.number().nonnegative().max(100000000).optional(),
  priceCurrency: z.enum(['NGN', 'USD']).optional(),
  durationValue: z
    .number({ invalid_type_error: 'Duration must be a number.' })
    .int('Duration must be a whole number.')
    .min(1, 'Duration must be at least 1.')
    .max(999, 'Duration can be at most 999.')
    .nullable()
    .optional(),
  durationUnit: z.enum(DURATION_UNITS, { errorMap: () => ({ message: 'Choose hours, days, weeks, months or years.' }) }).nullable().optional(),
  isActive: z.boolean().optional(),
};
const durationPairRule = [
  (body) => (body.durationValue == null) === (body.durationUnit == null),
  { message: 'A duration needs both an amount and a unit (hours, days, weeks, months or years).', path: ['durationUnit'] },
];
const createProfessionalServiceSchema = z.object(serviceFields).refine(...durationPairRule);
const updateProfessionalServiceSchema = z.object(serviceFields).partial().refine(...durationPairRule);

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
    coverPhotoUrl: 'cover_photo_url',
    skillIds: 'skillIds', // handled specially in profileService, not a column
    startingPrice: 'starting_price',
    priceCurrency: 'price_currency',
    workingDaysStructured: 'working_days_structured',
    workingHoursStart: 'working_hours_start',
    workingHoursEnd: 'working_hours_end',
    workingHoursEndsNextDay: 'working_hours_ends_next_day',
    displayName: 'display_name',
    isCompany: 'is_company',
    jobTitle: 'job_title',
    companyName: 'company_name',
    startDate: 'start_date',
    endDate: 'end_date',
    isCurrent: 'is_current',
    skillsUsed: 'skills_used',
    businessName: 'business_name',
    openingHoursStructured: 'opening_hours_structured',
    contactPhone: 'contact_phone',
    contactEmail: 'contact_email',
    storefrontPhotoUrl: 'storefront_photo_url',
    isEnabled: 'is_enabled',
    pricingType: 'pricing_type',
    priceCurrency: 'price_currency',
    durationValue: 'duration_value',
    durationUnit: 'duration_unit',
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
