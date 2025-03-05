const User = require('../model/user');
const sessions = new Map();

const sessionManager = {
  async initializeSessions() {
    try {
      const users = await User.find({ token: { $exists: true } });
      users.forEach(user => {
        if (user.token) {
          sessions.set(String(user.telegramId), {
            token: user.token,
            csrfToken: user.token
          });
        }
      });
      console.log(`✅ Initialized ${users.length} sessions from database`);
    } catch (error) {
      console.error('❌ Error initializing sessions:', error);
    }
  },

  async setSession(userId, sessionData) {
    // Convert userId to string to ensure consistent keys
    sessions.set(String(userId), sessionData);
    try {
      await User.findOneAndUpdate(
        { telegramId: String(userId) },
        { token: sessionData.token },
        { upsert: true }
      );
      console.log(`✅ Session set and persisted for user ${userId}`);
    } catch (error) {
      console.error(`❌ Error persisting session for user ${userId}:`, error);
    }
  },
  
  getSession(userId) {
    const session = sessions.get(String(userId));
    console.log(`Getting session for user ${userId}: ${session ? 'Found' : 'Not found'}`);
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
      console.error(`❌ Error deleting session for user ${userId}:`, error);
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
      users: Array.from(sessions.keys())
    };
  }
};

module.exports = sessionManager;