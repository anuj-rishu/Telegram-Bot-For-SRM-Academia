const User = require('../model/user');

class CustomMessageService {
  constructor(bot) {
    this.bot = bot;
    console.log("📨 Custom Message Service initialized");
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
        parse_mode: options.parseMode || 'Markdown',
        disable_web_page_preview: options.disablePreview || false,
        ...options
      });
      
      console.log(`✅ Message sent to user ${userId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      console.error(`❌ Error sending message to user ${userId}:`, error.message);
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
        errors: []
      };
      
      for (const user of users) {
        try {
          await this.bot.telegram.sendMessage(user.telegramId, message, {
            parse_mode: options.parseMode || 'Markdown',
            disable_web_page_preview: options.disablePreview || false,
            ...options
          });
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: user.telegramId,
            error: error.message
          });
        }
        
     
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`✅ Broadcast complete: ${results.successful}/${results.total} successful`);
      return { success: true, results };
    } catch (error) {
      console.error('❌ Error broadcasting message:', error.message);
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
        errors: []
      };
      
      for (const user of users) {
        try {
          await this.bot.telegram.sendMessage(user.telegramId, message, {
            parse_mode: options.parseMode || 'Markdown',
            disable_web_page_preview: options.disablePreview || false,
            ...options
          });
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: user.telegramId,
            error: error.message
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`✅ Filtered message sent: ${results.successful}/${results.total} successful`);
      return { success: true, results };
    } catch (error) {
      console.error('❌ Error sending filtered message:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = CustomMessageService;