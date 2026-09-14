const express = require('express');
const controller = require('../controllers/adminLocationController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateBody, setStateActiveSchema, createLgaSchema, createAreaSchema } = require('../validators/adminValidators');

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin('content_admin'));

router.get('/states', controller.listStates);
router.patch('/states/:id', validateBody(setStateActiveSchema), controller.setStateActive);
router.post('/states/:stateId/lgas', validateBody(createLgaSchema), controller.createLga);
router.post('/lgas/:lgaId/areas', validateBody(createAreaSchema), controller.createArea);

module.exports = router;
