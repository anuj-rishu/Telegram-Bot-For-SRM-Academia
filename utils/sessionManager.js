const User = require("../model/user");
const StudentPortalUser = require("../model/studentPortalUser");
const InactiveUser = require("../model/inactiveUser");
const logger = require("./logger");
const axios = require("axios");
const config = require("../config/config");
const sessions = new Map();
const studentPortalSessions = new Map();

const sessionManager = {
  async initializeSessions() {
    try {
      const users = await User.find({ token: { $exists: true } });
      users.forEach((user) => {
        if (user.token) {
          sessions.set(String(user.telegramId), {
            token: user.token,
            csrfToken: user.token,
            telegramId: user.telegramId,
            lastActivity: new Date().toISOString(),
          });
        }
      });
      const studentPortalUsers = await StudentPortalUser.find({ token: { $exists: true } });
      studentPortalUsers.forEach((user) => {
        if (user.token) {
          studentPortalSessions.set(String(user.telegramId), {
            token: user.token,
            telegramId: user.telegramId,
            lastActivity: new Date().toISOString(),
          });
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
      lastActivity: new Date().toISOString(),
    };
    sessions.set(String(userId), enhancedSessionData);
    try {
      const inactiveUser = await InactiveUser.findOne({ telegramId: String(userId) });
      if (inactiveUser) {
        const userData = inactiveUser.toObject();
        delete userData._id;
        delete userData.deactivatedAt;
        delete userData.reason;
        userData.token = sessionData.token;
        userData.lastLogin = new Date();
        await User.findOneAndUpdate(
          { telegramId: String(userId) },
          userData,
          { upsert: true, new: true }
        );
        await InactiveUser.deleteOne({ telegramId: String(userId) });
      } else {
        await User.findOneAndUpdate(
          { telegramId: String(userId) },
          { token: sessionData.token, lastLogin: new Date() },
          { upsert: true }
        );
      }
    } catch (error) {
      logger.error(`Error saving/restoring session to database: ${error.message}`);
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
    if (!userId) return false;
    try {
      const memoryResult = sessions.delete(String(userId));
      const user = await User.findOne({ telegramId: String(userId) });
      await User.findOneAndUpdate(
        { telegramId: String(userId) },
        { $unset: { token: 1 } }
      );
      if (user) {
        await this.transferUserToInactive(String(userId), 'session_deleted');
      }
      return memoryResult;
    } catch (error) {
      logger.error(`Error deleting session from database: ${error.message}`);
      return !sessions.has(String(userId));
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
    const apiService = require("../services/apiService");
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
          await this.transferUserToInactive(userId, 'token_expired');
          await this.deleteSessionWithoutTransfer(userId);
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

  async deleteSessionWithoutTransfer(userId) {
    if (!userId) return false;
    try {
      const memoryResult = sessions.delete(String(userId));
      await User.findOneAndUpdate(
        { telegramId: String(userId) },
        { $unset: { token: 1 } }
      );
      return memoryResult;
    } catch (error) {
      logger.error(`Error deleting session (no transfer): ${error.message}`);
      return !sessions.has(String(userId));
    }
  },

  async transferUserToInactive(userId, reason = 'no_token') {
    try {
      const user = await User.findOne({ telegramId: String(userId) });
      if (!user) {
        return false;
      }
      const existingInactiveUser = await InactiveUser.findOne({ telegramId: String(userId) });
      if (existingInactiveUser) {
        const userData = user.toObject();
        delete userData._id;
        userData.deactivatedAt = new Date();
        userData.reason = reason;
        await InactiveUser.findOneAndUpdate(
          { telegramId: String(userId) },
          userData
        );
      } else {
        const userData = user.toObject();
        delete userData._id;
        userData.deactivatedAt = new Date();
        userData.reason = reason;
        await InactiveUser.create(userData);
      }
      await User.deleteOne({ telegramId: String(userId) });
      return true;
    } catch (error) {
      logger.error(`Error transferring user ${userId} to inactive: ${error.message}`);
      return false;
    }
  },

  async transferAllInactiveUsers() {
    let transferredCount = 0;
    try {
      const inactiveUsers = await User.find({
        $or: [
          { token: { $exists: false } },
          { token: null },
          { token: "" }
        ]
      });
      for (const user of inactiveUsers) {
        const hasActiveSession = sessions.has(String(user.telegramId));
        if (!hasActiveSession) {
          const transferred = await this.transferUserToInactive(user.telegramId, 'no_token');
          if (transferred) transferredCount++;
        }
      }
      return { transferred: transferredCount };
    } catch (error) {
      logger.error(`Error bulk transferring inactive users: ${error.message}`);
      return { error: error.message };
    }
  },

  startPeriodicValidation(intervalMinutes = 30) {
    const interval = intervalMinutes * 60 * 1000;
    setTimeout(async () => {
      try {
        await this.validateAllSessions();
        await this.validateAllStudentPortalSessions();
        await this.transferAllInactiveUsers();
      } catch (error) {
        logger.error(`Error during initial session validation: ${error.message}`);
      }
    }, 10000);
    setInterval(async () => {
      try {
        await this.validateAllSessions();
        await this.validateAllStudentPortalSessions();
        await this.transferAllInactiveUsers();
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

  async setStudentPortalSession(userId, sessionData) {
    if (!userId || !sessionData || !sessionData.token) {
      logger.error("Invalid data provided to setStudentPortalSession");
      return null;
    }
    const enhancedSessionData = {
      ...sessionData,
      telegramId: userId,
      lastActivity: new Date().toISOString(),
    };
    studentPortalSessions.set(String(userId), enhancedSessionData);
    try {
      await StudentPortalUser.findOneAndUpdate(
        { telegramId: String(userId) },
        {
          telegramId: String(userId),
          token: sessionData.token,
          lastLogin: new Date(),
        },
        { upsert: true }
      );
      return enhancedSessionData;
    } catch (error) {
      logger.error(`Error saving student portal session to database: ${error.message}`);
      return enhancedSessionData;
    }
  },

  getStudentPortalSession(userId) {
    if (!userId) return null;
    const session = studentPortalSessions.get(String(userId));
    if (session) {
      session.lastActivity = new Date().toISOString();
    }
    return session;
  },

  deleteStudentPortalSession(userId) {
    if (!userId) return false;
    const sessionExists = studentPortalSessions.has(String(userId));
    if (!sessionExists) {
      return false;
    }
    const memoryResult = studentPortalSessions.delete(String(userId));
    StudentPortalUser.findOneAndUpdate(
      { telegramId: String(userId) },
      { $unset: { token: 1 } }
    ).catch((error) => {
      logger.error(`Error deleting student portal session from database: ${error.message}`);
    });
    return memoryResult;
  },

  getAllStudentPortalSessions() {
    const sessionsObj = {};
    for (const [key, value] of studentPortalSessions.entries()) {
      sessionsObj[key] = value;
    }
    return sessionsObj;
  },

  async validateAllStudentPortalSessions() {
    const allSessions = this.getAllStudentPortalSessions();
    const userIds = Object.keys(allSessions);
    let validCount = 0;
    let invalidCount = 0;
    for (const userId of userIds) {
      const session = allSessions[userId];
      if (!session || !session.token) {
        await this.notifyStudentPortalTokenExpiry(userId);
        await this.deleteStudentPortalSession(userId);
        invalidCount++;
        continue;
      }
      try {
        await axios.get(`${config.STUDENT_PORTAL_API_URL}/check-auth`, {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
          validateStatus: (status) => status < 500,
        });
        validCount++;
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          await this.notifyStudentPortalTokenExpiry(userId);
          await this.deleteStudentPortalSession(userId);
          invalidCount++;
        } else {
          logger.error(`Error validating student portal session: ${error.message}`);
        }
      }
    }
    return { valid: validCount, invalid: invalidCount };
  },

  async notifyStudentPortalTokenExpiry(userId) {
    try {
      const botInstance = global.botInstance;
      if (botInstance) {
        await botInstance.telegram.sendMessage(
          userId,
          "⚠️ Your Student Portal session has expired. Please login again to continue using Student Portal services."
        );
      }
    } catch (error) {
      logger.error(`Failed to notify user ${userId} about token expiry: ${error.message}`);
    }
  },

  studentPortalDebug() {
    return {
      count: studentPortalSessions.size,
      users: Array.from(studentPortalSessions.keys()),
    };
  }
};

module.exports = sessionManager;