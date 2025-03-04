const sessions = new Map();

const sessionManager = {
  setSession(userId, sessionData) {
    // Convert userId to string to ensure consistent keys
    sessions.set(String(userId), sessionData);
    console.log(`Session set for user ${userId}`);
  },
  
  getSession(userId) {
    // Convert userId to string when retrieving
    const session = sessions.get(String(userId));
    console.log(`Getting session for user ${userId}: ${session ? 'Found' : 'Not found'}`);
    return session;
  },
  
  deleteSession(userId) {
    return sessions.delete(String(userId));
  },

  getAllSessions() {
    // Convert Map to plain object
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