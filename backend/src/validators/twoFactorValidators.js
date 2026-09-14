const { z } = require('zod');

const codeSchema = z.object({
  code: z.string().trim().regex(/^([0-9]{6}|[A-Z0-9]{4}-[A-Z0-9]{4})$/, 'Enter a 6-digit code or an XXXX-XXXX backup code'),
});

const verifyLoginSchema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().trim().min(6).max(20),
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

module.exports = { codeSchema, verifyLoginSchema, validateBody };
