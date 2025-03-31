const User = require("../model/user");
const NotificationTracking = require("../model/notification");
const axios = require("axios");

class CustomMessageService {
  constructor(bot) {
    this.bot = bot;
    this.lastNotificationSent = null;
    console.log("📨 Custom Message Service initialized");

    this.startNotificationPolling();
  }

  startNotificationPolling() {
    console.log("🔄 Starting notification polling (every 60 seconds)");
    this.pollInterval = setInterval(() => {
      this.checkAndSendNotifications();
    }, 60000);
  }

  stopNotificationPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      console.log("⏹️ Notification polling stopped");
    }
  }

  async checkAndSendNotifications() {
    console.log("🔍 Checking for new notifications...");

    const currentTime = Date.now();
    const tenMinutesInMs = 10 * 60 * 1000

    if (
      this.lastNotificationSent &&
      currentTime - this.lastNotificationSent < tenMinutesInMs
    ) {
      const waitTimeRemaining = Math.ceil(
        (tenMinutesInMs - (currentTime - this.lastNotificationSent)) / 60000
      );
      console.log(
        `⏳ Cooling down. Need to wait ${waitTimeRemaining} more minute(s) before sending new notifications.`
      );
      return;
    }

    try {
      const notificationApiUrl = process.env.NOTIFICATION_API_URL;
      const response = await axios.get(notificationApiUrl);

      const data = response.data;

      if (data.success && data.count > 0) {
        console.log(`📬 Found ${data.count} notification(s) to check`);

        let newNotificationsCount = 0;

        for (const notification of data.notifications) {
          try {
            // First try to save the notification record - will fail if it already exists
            await new NotificationTracking({
              notificationId: notification.id,
            }).save();
            
            // If save was successful, then send the notification
            console.log(`📤 Sending new notification: ${notification.id}`);
            await this.broadcastMessage(notification.message);
            newNotificationsCount++;
          } catch (error) {
            if (error.code === 11000) {
              // This is a duplicate key error (notification already exists)
              console.log(
                `📝 Skipping already sent notification: ${notification.id}`
              );
            } else {
              console.error(`Error processing notification ${notification.id}:`, error);
            }
          }
        }

        if (newNotificationsCount > 0) {
          this.lastNotificationSent = Date.now();
          console.log(
            `⏲️ Sent ${newNotificationsCount} new notification(s). Next notifications will be sent after a 10-minute cooldown`
          );
        } else {
          console.log("📭 No new notifications to send");
        }
      } else {
        console.log("📭 No notifications found");
      }
    } catch (error) {
      console.error("❌ Error checking notifications:", error.message);
    }
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

      console.log(`✅ Message sent to user ${userId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      console.error(
        `❌ Error sending message to user ${userId}:`,
        error.message
      );
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

      console.log(`🔄 Broadcasting message to ${users.length} users`);

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

      console.log(
        `✅ Broadcast complete: ${results.successful}/${results.total} successful`
      );
      return { success: true, results };
    } catch (error) {
      console.error("❌ Error broadcasting message:", error.message);
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

      console.log(`🔄 Sending filtered message to ${users.length} users`);

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

      console.log(
        `✅ Filtered message sent: ${results.successful}/${results.total} successful`
      );
      return { success: true, results };
    } catch (error) {
      console.error("❌ Error sending filtered message:", error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = CustomMessageService;