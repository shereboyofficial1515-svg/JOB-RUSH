const express = require('express');
const controller = require('../controllers/contractController');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { validateBody, createContractSchema } = require('../validators/paymentValidators');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.listOwn);
router.post('/', requireRole('hirer'), validateBody(createContractSchema), controller.create);
router.get('/:id', controller.getById);

module.exports = router;
