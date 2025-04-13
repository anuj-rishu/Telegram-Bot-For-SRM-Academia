const User = require("../model/user");
const sessions = new Map();

const sessionManager = {
  async initializeSessions() {
    try {
      const users = await User.find({ token: { $exists: true } });
      users.forEach((user) => {
        if (user.token) {
          sessions.set(String(user.telegramId), {
            token: user.token,
            csrfToken: user.token,
          });
        }
      });
    } catch (error) {}
  },

  async setSession(userId, sessionData) {
    sessions.set(String(userId), sessionData);
    try {
      await User.findOneAndUpdate(
        { telegramId: String(userId) },
        { token: sessionData.token },
        { upsert: true }
      );
    } catch (error) {}
  },

  getSession(userId) {
    return sessions.get(String(userId));
  },

  async deleteSession(userId) {
    try {
      await User.findOneAndUpdate(
        { telegramId: String(userId) },
        { $unset: { token: 1 } }
      );
      return sessions.delete(String(userId));
    } catch (error) {
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

  debug() {
    return {
      count: sessions.size,
      users: Array.from(sessions.keys()),
    };
  },
};

module.exports = sessionManager;
