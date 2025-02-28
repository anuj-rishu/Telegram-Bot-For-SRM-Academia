const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

/**
 * Handle logout command
 * @param {Object} ctx - Telegraf context
 */
async function handleLogout(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  try {
    await apiService.logout(session);
    sessionManager.deleteSession(userId);
    ctx.reply("You have been logged out successfully.");
  } catch (error) {
    console.error("Logout error:", error.response?.data || error.message);
    ctx.reply(
      `Error during logout: ${error.response?.data?.error || error.message}`
    );
  }
}

/**
 * Handle debug command
 * @param {Object} ctx - Telegraf context
 */
async function handleDebug(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  const maskedToken =
    session.token.length > 20
      ? `${session.token.substring(0, 7)}...${session.token.substring(
          session.token.length - 7
        )}`
      : session.token;

  const message =
    `Bot Debug Info:\n\n` +
    `- User ID: ${userId}\n` +
    `- Token (masked): ${maskedToken}\n` +
    `- Has CSRF Token: ${Boolean(session.csrfToken)}\n` +
    `- API Base URL: ${require("../config/config").API_BASE_URL}\n\n` +
    `Try using a command like /user to test your authentication.`;

  ctx.reply(message);
}

module.exports = {
  handleLogout,
  handleDebug,
};
