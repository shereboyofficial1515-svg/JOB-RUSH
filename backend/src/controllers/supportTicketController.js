const supportTicketService = require('../services/supportTicketService');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const ticket = await supportTicketService.createTicket(req.user.id, req.body);
  res.status(201).json({ ticket });
});

const listOwn = asyncHandler(async (req, res) => {
  const tickets = await supportTicketService.listOwnTickets(req.user.id);
  res.status(200).json({ tickets });
});

const getOwn = asyncHandler(async (req, res) => {
  const ticket = await supportTicketService.getOwnedTicket(req.params.id, req.user.id);
  res.status(200).json({ ticket });
});

// --- Admin ---
const listForAdmin = asyncHandler(async (req, res) => {
  const tickets = await supportTicketService.listTicketsForAdmin(req.query.status);
  res.status(200).json({ tickets });
});

const getForAdmin = asyncHandler(async (req, res) => {
  const ticket = await supportTicketService.getTicketForAdmin(req.params.id);
  res.status(200).json({ ticket });
});

const respond = asyncHandler(async (req, res) => {
  const ticket = await supportTicketService.respondToTicket(req.params.id, req.user.id, req.body);
  res.status(200).json({ ticket });
});

module.exports = { create, listOwn, getOwn, listForAdmin, getForAdmin, respond };
