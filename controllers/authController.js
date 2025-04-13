const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const { API_BASE_URL } = require("../config/config");

/**
 * Handle logout command
 * @param {Object} ctx - Telegraf context
 */
async function handleLogout(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session) {
    ctx.reply("You are not logged in.");
    return;
  }

  try {
    await apiService.logout(session);
    sessionManager.deleteSession(userId);
    ctx.reply("You have been logged out successfully.");
  } catch (error) {
    ctx.reply("Error during logout. Please try again.");
  }
}

/**
 * Handle debug command
 * @param {Object} ctx - Telegraf context
 */
async function handleDebug(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    ctx.reply("No active session found.");
    return;
  }

  const tokenLength = session.token.length;
  const maskedToken =
    tokenLength > 20
      ? `${session.token.slice(0, 7)}...${session.token.slice(-7)}`
      : session.token;

  const hasCSRF = Boolean(session.csrfToken);

  ctx.reply(
    `Bot Debug Info:

- User ID: ${userId}
- Token (masked): ${maskedToken}
- Has CSRF Token: ${hasCSRF}
- API Base URL: ${API_BASE_URL}

Try using a command like /user to test your authentication.`
  );
}

module.exports = {
  handleLogout,
  handleDebug,
};
