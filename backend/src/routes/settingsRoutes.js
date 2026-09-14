const express = require('express');
const controller = require('../controllers/settingsController');
const { authenticate } = require('../middleware/authenticate');
const { validateBody, updateSettingsSchema } = require('../validators/settingsValidators');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.getSettings);
router.patch('/', validateBody(updateSettingsSchema), controller.updateSettings);
router.get('/storage-usage', controller.getStorageUsage);

module.exports = router;
