const contractService = require('../services/contractService');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const contract = await contractService.createContractFromApplication(
    req.user.id,
    req.body.applicationId,
    req.body.agreedAmount
  );
  res.status(201).json({ contract });
});

const getById = asyncHandler(async (req, res) => {
  const contract = await contractService.getOwnedContract(req.params.id, req.user.id);
  res.status(200).json({ contract });
});

const listOwn = asyncHandler(async (req, res) => {
  const contracts = await contractService.listContractsForUser(req.user.id);
  res.status(200).json({ contracts });
});

module.exports = { create, getById, listOwn };
