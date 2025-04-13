const User = require("../model/user");
const NotificationTracking = require("../model/notification");
const axios = require("axios");

class CustomMessageService {
  constructor(bot) {
    this.bot = bot;
    this.lastNotificationSent = null;
    this.startNotificationPolling();
  }

  startNotificationPolling() {
    this.pollInterval = setInterval(() => {
      this.checkAndSendNotifications();
    }, 60000);
  }

  stopNotificationPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  async checkAndSendNotifications() {
    const currentTime = Date.now();
    const tenMinutesInMs = 10 * 60 * 1000;

    if (
      this.lastNotificationSent &&
      currentTime - this.lastNotificationSent < tenMinutesInMs
    ) {
      return;
    }

    try {
      const notificationApiUrl = process.env.NOTIFICATION_API_URL;
      const response = await axios.get(notificationApiUrl);
      const data = response.data;

      if (data.success && data.count > 0) {
        let newNotificationsCount = 0;

        for (const notification of data.notifications) {
          try {
            await new NotificationTracking({
              notificationId: notification.id,
            }).save();

            await this.broadcastMessage(notification.message);
            newNotificationsCount++;
          } catch (error) {
            if (error.code !== 11000) {
            }
          }
        }

        if (newNotificationsCount > 0) {
          this.lastNotificationSent = Date.now();
        }
      }
    } catch (error) {}
  }

  /**
   * Send a message to a specific user by Telegram ID
   * @param {String} userId - Telegram user ID
   * @param {String} message - Message text (supports Markdown)
   * @param {Object} options - Additional message options
   * @returns {Promise<Object>} Result of the operation
   */
  async sendMessageToUser(userId, message, options = {}) {
    try {
      const result = await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: options.parseMode || "Markdown",
        disable_web_page_preview: options.disablePreview || false,
        ...options,
      });

      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Broadcast a message to all users
   * @param {String} message - Message text (supports Markdown)
   * @param {Object} options - Additional message options
   * @returns {Promise<Object>} Result statistics
   */
  async broadcastMessage(message, options = {}) {
    try {
      const users = await User.find({});

      const results = {
        total: users.length,
        successful: 0,
        failed: 0,
        errors: [],
      };

      for (const user of users) {
        try {
          await this.bot.telegram.sendMessage(user.telegramId, message, {
            parse_mode: options.parseMode || "Markdown",
            disable_web_page_preview: options.disablePreview || false,
            ...options,
          });
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: user.telegramId,
            error: error.message,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send message to users matching specific criteria
   * @param {Object} filter - MongoDB filter criteria
   * @param {String} message - Message text (supports Markdown)
   * @param {Object} options - Additional message options
   * @returns {Promise<Object>} Result statistics
   */
  async sendMessageToFilteredUsers(filter, message, options = {}) {
    try {
      const users = await User.find(filter);

      const results = {
        total: users.length,
        successful: 0,
        failed: 0,
        errors: [],
      };

      for (const user of users) {
        try {
          await this.bot.telegram.sendMessage(user.telegramId, message, {
            parse_mode: options.parseMode || "Markdown",
            disable_web_page_preview: options.disablePreview || false,
            ...options,
          });
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: user.telegramId,
            error: error.message,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = CustomMessageService;
