const { z } = require('zod');

const uuid = z.string().uuid();

const createContractSchema = z.object({
  applicationId: uuid,
  agreedAmount: z.number().positive(),
});

const initiateFundingSchema = z.object({
  contractId: uuid,
  callbackUrl: z.string().url(),
});

const verifyFundingSchema = z.object({
  reference: z.string().trim().min(5),
});

const refundEscrowSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const requestWithdrawalSchema = z.object({
  amount: z.number().positive(),
  bankAccountName: z.string().trim().min(2).max(150),
  bankAccountNumber: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit NUBAN account number'),
  bankCode: z.string().trim().min(2).max(10),
});

const rejectWithdrawalSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const updateFeePercentSchema = z.object({
  platformFeePercent: z.number().min(0).max(100),
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
  createContractSchema,
  initiateFundingSchema,
  verifyFundingSchema,
  refundEscrowSchema,
  requestWithdrawalSchema,
  rejectWithdrawalSchema,
  updateFeePercentSchema,
  validateBody,
};
