const HallTicketService = require('../services/hallTicketService');

let hallTicketService;

function initialize(bot) {
  hallTicketService = new HallTicketService(bot);
}

async function handleHallTicket(ctx) {
  return await hallTicketService.sendHallTicket(ctx);
}

module.exports = {
  initialize,
  handleHallTicket
};