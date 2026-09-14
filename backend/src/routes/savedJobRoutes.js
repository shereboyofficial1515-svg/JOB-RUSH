const express = require('express');
const controller = require('../controllers/savedItemsController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');

const router = express.Router();

router.get('/', authenticate, requireRole('worker'), controller.listSavedJobs);

module.exports = router;
