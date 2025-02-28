// In-memory storage for user sessions
const sessions = new Map();

const sessionManager = {
  /**
   * Set user session data
   * @param {number} userId - Telegram user ID
   * @param {Object} sessionData - Session data to store
   */
  setSession(userId, sessionData) {
    sessions.set(userId, sessionData);
  },
  
  /**
   * Get user session data
   * @param {number} userId - Telegram user ID
   * @returns {Object|undefined} Session data or undefined if not found
   */
  getSession(userId) {
    return sessions.get(userId);
  },
  
  /**
   * Delete user session
   * @param {number} userId - Telegram user ID
   * @returns {boolean} True if session was deleted, false otherwise
   */
  deleteSession(userId) {
    return sessions.delete(userId);
  }
};

module.exports = sessionManager;