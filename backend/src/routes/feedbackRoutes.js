const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/feedbackController');
const { authenticate } = require('../middleware/authenticate');

const submitFeedbackSchema = z.object({
  type: z.enum(['feature_request', 'bug_report', 'complaint', 'general']),
  message: z.string().trim().min(5).max(3000),
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

const router = express.Router();
router.use(authenticate);

router.post('/', validateBody(submitFeedbackSchema), controller.submit);
router.get('/', controller.listOwn);

module.exports = router;
