const express = require('express');
const controller = require('../controllers/adminCategoryController');
const { authenticate } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const {
  validateBody,
  createCategorySchema,
  updateCategorySchema,
  createSkillSchema,
  updateSkillSchema,
} = require('../validators/adminValidators');

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin('content_admin'));

router.get('/categories', controller.listCategories);
router.post('/categories', validateBody(createCategorySchema), controller.createCategory);
router.patch('/categories/:id', validateBody(updateCategorySchema), controller.updateCategory);

router.get('/skills', controller.listSkills);
router.post('/skills', validateBody(createSkillSchema), controller.createSkill);
router.patch('/skills/:id', validateBody(updateSkillSchema), controller.updateSkill);

module.exports = router;
