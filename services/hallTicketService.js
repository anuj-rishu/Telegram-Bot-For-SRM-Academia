const axios = require("axios");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const config = require("../config/config");

class HallTicketService {
  constructor(bot) {
    this.bot = bot;
  }

  async fetchHallTicket(telegramId) {
    try {
      const session = sessionManager.getStudentPortalSession(telegramId);
      if (!session || !session.token) {
        throw new Error("No active student portal session found");
      }

      const response = await axios({
        method: 'get',
        url: `${config.STUDENT_PORTAL_API_URL}/hall-ticket`,
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Error fetching hall ticket for user ${telegramId}: ${error.message}`);
      throw error;
    }
  }
  
  async sendHallTicket(ctx) {
    try {
      const telegramId = ctx.from.id;
      const loadingMsg = await ctx.reply("Fetching your hall ticket, please wait...");
      
      const pdfBuffer = await this.fetchHallTicket(telegramId);
      
      await ctx.replyWithDocument({ 
        source: Buffer.from(pdfBuffer),
        filename: 'hall_ticket.pdf' 
      });
      
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      } catch (e) {}
      
      return true;
    } catch (error) {
      if (error.message === "No active student portal session found") {
        await ctx.reply("You need to login to the Student Portal first. Use /loginstudentportal command.");
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        await ctx.reply("Your Student Portal session has expired. Please login again using /loginstudentportal");
        await sessionManager.deleteStudentPortalSession(ctx.from.id);
      } else {
        await ctx.reply("Failed to fetch your hall ticket. Please try again later.");
      }
      
      return false;
    }
  }
}

module.exports = HallTicketService;