const logger = require("../utils/logger");
const StudentPortalUser = require("../model/studentPortalUser");
const sessionManager = require("../utils/sessionManager");
const HallTicketService = require("../services/hallTicketService");

class HallTicketNotificationService {
  constructor(bot) {
    this.bot = bot;
    this.hallTicketService = new HallTicketService(bot);
    this.batchSize = 10;
    this.batchDelay = 2000;
    this.isProcessing = false;

    setTimeout(() => this.startBatchHallTicketCheck(), 15000);
    setInterval(() => this.startBatchHallTicketCheck(), 6 * 60 * 60 * 1000);
  }

  async startBatchHallTicketCheck() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const users = await StudentPortalUser.find({
        token: { $exists: true },
      });
      
      const usersNeedingNotification = users.filter(
        user => !user.hallTicketNotified
      );
      
      let index = 0;
      const total = usersNeedingNotification.length;

      const processBatch = async () => {
        const batch = usersNeedingNotification.slice(index, index + this.batchSize);

        await Promise.all(
          batch.map(async (user) => {
            await this.processUserHallTicket(user);
          })
        );

        index += this.batchSize;

        if (index < total) {
          setTimeout(processBatch, this.batchDelay);
        } else {
          this.isProcessing = false;
        }
      };

      if (total > 0) {
        processBatch();
      } else {
        this.isProcessing = false;
      }
    } catch (error) {
      logger.error(`Error in batch hall ticket check: ${error.message}`);
      this.isProcessing = false;
    }
  }

  async processUserHallTicket(user) {
    try {
      const session = sessionManager.getStudentPortalSession(user.telegramId);
      if (!session || !session.token) {
        return;
      }

      const pdfBuffer = await this.hallTicketService.fetchHallTicket(
        user.telegramId
      );

      await this.sendHallTicketNotification(user.telegramId, pdfBuffer);

      await StudentPortalUser.findByIdAndUpdate(user._id, {
        hallTicketNotified: true,
        hallTicketSentDate: new Date(),
      });
    } catch (error) {
      logger.error(
        `Failed to process hall ticket for user ${user.telegramId}: ${error.message}`
      );

      if (error.response?.status === 401 || error.response?.status === 403) {
        await sessionManager.deleteStudentPortalSession(user.telegramId);
      }
    }
  }

  async sendHallTicketNotification(telegramId, pdfBuffer) {
    try {
      const message = await this.bot.telegram.sendMessage(
        telegramId,
        "🎓 *Your Hall Ticket is ready!*\n\nHere's your exam hall ticket. Keep it safe and make sure to carry it for your exams.",
        { parse_mode: "Markdown" }
      );

      await this.bot.telegram.sendDocument(
        telegramId,
        {
          source: Buffer.from(pdfBuffer),
          filename: "hall_ticket.pdf",
        },
        {
          caption: "📝 Good luck with your exams!",
        }
      );

      return true;
    } catch (error) {
      logger.error(
        `Failed to send hall ticket notification to ${telegramId}: ${error.message}`
      );
      throw error;
    }
  }
}

module.exports = HallTicketNotificationService;