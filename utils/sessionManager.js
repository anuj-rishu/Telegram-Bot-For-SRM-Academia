const User = require("../model/user");
const logger = require("./logger");
const sessions = new Map();

const sessionManager = {
  async initializeSessions() {
    try {
      const users = await User.find({ token: { $exists: true } });
      let loadedCount = 0;
      
      users.forEach((user) => {
        if (user.token) {
          sessions.set(String(user.telegramId), {
            token: user.token,
            csrfToken: user.token,
            telegramId: user.telegramId,
            lastActivity: new Date().toISOString()
          });
          loadedCount++;
        }
      });
    } catch (error) {
      logger.error(`Failed to initialize sessions: ${error.message}`);
    }
  },

  async setSession(userId, sessionData) {
    const enhancedSessionData = {
      ...sessionData,
      telegramId: userId,
      lastActivity: new Date().toISOString()
    };
    
    sessions.set(String(userId), enhancedSessionData);
    
    try {
      await User.findOneAndUpdate(
        { telegramId: String(userId) },
        { token: sessionData.token },
        { upsert: true }
      );
    } catch (error) {
      logger.error(`Error saving session to database: ${error.message}`);
    }
  },

  getSession(userId) {
    if (!userId) return null;
    
    const session = sessions.get(String(userId));
    if (session) {
      session.lastActivity = new Date().toISOString();
    }
    return session;
  },

  async deleteSession(userId) {
    try {
      await User.findOneAndUpdate(
        { telegramId: String(userId) },
        { $unset: { token: 1 } }
      );
      return sessions.delete(String(userId));
    } catch (error) {
      logger.error(`Error deleting session from database: ${error.message}`);
      return false;
    }
  },

  getAllSessions() {
    const sessionsObj = {};
    for (const [key, value] of sessions.entries()) {
      sessionsObj[key] = value;
    }
    return sessionsObj;
  },
  
  async validateAllSessions() {
    const apiService = require('../services/apiService');
    const allSessions = this.getAllSessions();
    const userIds = Object.keys(allSessions);
    
    let validCount = 0;
    let invalidCount = 0;
    
    for (const userId of userIds) {
      const session = allSessions[userId];
      
      try {
        const isValid = await apiService.verifyToken(session);
        
        if (!isValid) {
          await apiService.notifyTokenExpiry(userId);
          await this.deleteSession(userId);
          invalidCount++;
        } else {
          validCount++;
        }
      } catch (error) {
        logger.error(`Error validating session for user ${userId}: ${error.message}`);
      }
    }
    
    return { valid: validCount, invalid: invalidCount };
  },
  
  startPeriodicValidation(intervalMinutes = 30) {
    const interval = intervalMinutes * 60 * 1000;
    
    setTimeout(async () => {
      try {
        await this.validateAllSessions();
      } catch (error) {
        logger.error(`Error during initial session validation: ${error.message}`);
      }
    }, 10000);
    
    setInterval(async () => {
      try {
        await this.validateAllSessions();
      } catch (error) {
        logger.error(`Error during periodic session validation: ${error.message}`);
      }
    }, interval);
  },

  debug() {
    return {
      count: sessions.size,
      users: Array.from(sessions.keys()),
    };
  },
};

module.exports = sessionManager;