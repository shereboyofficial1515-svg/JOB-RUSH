const express = require('express');
const controller = require('../controllers/catalogController');

const router = express.Router();

router.get('/categories', controller.listCategories);
router.get('/skills', controller.listSkills);
router.get('/stats', controller.stats);

module.exports = router;
