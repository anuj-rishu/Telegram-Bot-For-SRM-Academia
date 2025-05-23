const User = require("../model/user");
const StudentPortalUser = require("../model/studentPortalUser");
const logger = require("./logger");
const axios = require("axios");
const config = require("../config/config");
const sessions = new Map();
const studentPortalSessions = new Map();

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
            lastActivity: new Date().toISOString(),
          });
          loadedCount++;
        }
      });

      const studentPortalUsers = await StudentPortalUser.find({
        token: { $exists: true },
      });
      let studentPortalLoadedCount = 0;

      studentPortalUsers.forEach((user) => {
        if (user.token) {
          studentPortalSessions.set(String(user.telegramId), {
            token: user.token,
            telegramId: user.telegramId,
            lastActivity: new Date().toISOString(),
          });
          studentPortalLoadedCount++;
        }
      });

      logger.info(
        `Initialized ${loadedCount} SRM sessions and ${studentPortalLoadedCount} student portal sessions`
      );
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
    if (!userId) return false;

    try {
      const memoryResult = sessions.delete(String(userId));

      await User.findOneAndUpdate(
        { telegramId: String(userId) },
        { $unset: { token: 1 } }
      );

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
          await this.deleteSession(userId);
          invalidCount++;
        } else {
          validCount++;
        }
      } catch (error) {
        logger.error(
          `Error validating session for user ${userId}: ${error.message}`
        );
      }
    }

    return { valid: validCount, invalid: invalidCount };
  },

  startPeriodicValidation(intervalMinutes = 30) {
    const interval = intervalMinutes * 60 * 1000;

    setTimeout(async () => {
      try {
        await this.validateAllSessions();
        await this.validateAllStudentPortalSessions();
      } catch (error) {
        logger.error(
          `Error during initial session validation: ${error.message}`
        );
      }
    }, 10000);

    setInterval(async () => {
      try {
        await this.validateAllSessions();
        await this.validateAllStudentPortalSessions();
      } catch (error) {
        logger.error(
          `Error during periodic session validation: ${error.message}`
        );
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
      logger.error(
        `Error saving student portal session to database: ${error.message}`
      );
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
      logger.error(
        `Error deleting student portal session from database: ${error.message}`
      );
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
          logger.warn(`Invalid student portal token for user ${userId}`);
          await this.deleteStudentPortalSession(userId);
          invalidCount++;
        } else {
          logger.error(
            `Error validating student portal session: ${error.message}`
          );
        }
      }
    }

    return { valid: validCount, invalid: invalidCount };
  },

  studentPortalDebug() {
    return {
      count: studentPortalSessions.size,
      users: Array.from(studentPortalSessions.keys()),
    };
  },
};

module.exports = sessionManager;
