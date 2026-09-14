const express = require('express');
const controller = require('../controllers/locationController');

const router = express.Router();

router.get('/states', controller.listStates);
router.get('/states/:stateId/lgas', controller.listLgas);
router.get('/lgas/:lgaId/areas', controller.listAreas);

module.exports = router;
