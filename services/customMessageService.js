const User = require("../model/user");
const config = require("../config/config");
const ioClient = require("socket.io-client");
const logger = require("../utils/logger");

class CustomMessageService {
  constructor(bot) {
    this.bot = bot;
    this.socket = null;
    this.initSocket();
  }

  initSocket() {
    const notificationSocketUrl = config.NOTIFICATION_API_URL.replace(
      "/api/notifications/get-notification",
      ""
    );
    this.socket = ioClient(notificationSocketUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    this.socket.on("connect", () => {
      this.socket.emit("notification:subscribe");
    });

    this.socket.on("notification:new", async (notification) => {
      if (!notification || !notification.message) {
        logger.error("[CustomMessageService] Notification payload missing 'message' field");
        return;
      }
      await this.broadcastMessage(notification.message);
    });

    this.socket.on("connect_error", (err) => {
      logger.error("[CustomMessageService] Socket connection error: " + err.message);
    });
  }

  async sendMessageToUser(userId, message, options = {}) {
    try {
      const result = await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: options.parseMode || "Markdown",
        disable_web_page_preview: options.disablePreview || false,
        ...options,
      });
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(`[CustomMessageService] Error sending to user ${userId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async broadcastMessage(message, options = {}) {
    try {
      const users = await User.find({ telegramId: { $exists: true } });
      const batchSize = 25;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(user =>
            this.bot.telegram.sendMessage(user.telegramId, message, {
              parse_mode: options.parseMode || "Markdown",
              disable_web_page_preview: options.disablePreview || false,
              ...options,
            }).catch(error => {
              logger.error(`[CustomMessageService] Failed to send message to ${user.telegramId}: ${error.message}`);
            })
          )
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return { success: true };
    } catch (error) {
      logger.error("[CustomMessageService] Broadcast error: " + error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = CustomMessageService;