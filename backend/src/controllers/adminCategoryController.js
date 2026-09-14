const adminCategoryService = require('../services/adminCategoryService');
const asyncHandler = require('../utils/asyncHandler');

const listCategories = asyncHandler(async (req, res) => {
  const categories = await adminCategoryService.listCategoriesForAdmin();
  res.status(200).json({ categories });
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await adminCategoryService.createCategory(req.body);
  res.status(201).json({ category });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await adminCategoryService.updateCategory(req.params.id, req.body);
  res.status(200).json({ category });
});

const listSkills = asyncHandler(async (req, res) => {
  const skills = await adminCategoryService.listSkillsForAdmin();
  res.status(200).json({ skills });
});

const createSkill = asyncHandler(async (req, res) => {
  const skill = await adminCategoryService.createSkill(req.body);
  res.status(201).json({ skill });
});

const updateSkill = asyncHandler(async (req, res) => {
  const skill = await adminCategoryService.updateSkill(req.params.id, req.body);
  res.status(200).json({ skill });
});

module.exports = { listCategories, createCategory, updateCategory, listSkills, createSkill, updateSkill };
