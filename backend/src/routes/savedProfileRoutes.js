const express = require('express');
const controller = require('../controllers/savedItemsController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');

const router = express.Router();

router.get('/', authenticate, requireRole('hirer'), controller.listSavedProfiles);
router.post('/:workerUserId', authenticate, requireRole('hirer'), controller.saveProfile);
router.delete('/:workerUserId', authenticate, requireRole('hirer'), controller.unsaveProfile);

module.exports = router;
