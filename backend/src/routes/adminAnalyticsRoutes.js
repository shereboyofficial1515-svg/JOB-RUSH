const express = require('express');
const controller = require('../controllers/adminAnalyticsController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');

const router = express.Router();
router.use(authenticate);

router.get('/summary', requireAdmin(), controller.getSummary);

module.exports = router;
