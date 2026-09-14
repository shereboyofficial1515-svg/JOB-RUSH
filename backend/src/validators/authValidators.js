const { z } = require('zod');

const emailSchema = z.string().trim().toLowerCase().email();
const phoneSchema = z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number');

const registerSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(8).max(128),
    fullName: z.string().trim().min(2).max(150),
    role: z.enum(['worker', 'hirer', 'both']).default('worker'),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
    path: ['email'],
  });

const loginSchema = z.object({
  identifier: z.string().trim().min(3), // email or phone
  password: z.string().min(1),
});

const requestOtpSchema = z.object({
  destination: z.string().trim(),
  channel: z.enum(['email', 'sms']),
  purpose: z.enum(['registration_email', 'registration_phone', 'login_verification', 'password_reset']),
});

const verifyOtpSchema = z.object({
  destination: z.string().trim(),
  purpose: z.enum(['registration_email', 'registration_phone', 'login_verification', 'password_reset']),
  code: z.string().trim().regex(/^[0-9]{4,8}$/),
});

const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8).max(128),
});

/**
 * Express middleware factory: validates req.body against a zod schema,
 * replaces req.body with the parsed/coerced result, or returns 400.
 */
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
  registerSchema,
  loginSchema,
  requestOtpSchema,
  verifyOtpSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  validateBody,
};
