const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const { API_BASE_URL } = require("../config/config");
const logger = require("../utils/logger");

async function handleLogout(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session) {
    await ctx.reply("You are not logged in.");
    return;
  }

  const processingMsg = await ctx.reply("Logging out...");

  let apiLogoutSuccess = false;

  try {
    await apiService.logout(session);
    apiLogoutSuccess = true;
  } catch (error) {
    // Silent error handling
  }

  try {
    await sessionManager.deleteSession(userId);

    if (apiLogoutSuccess) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        "✅ You have been logged out successfully."
      );
    } else {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        "✅ You have been logged out from this bot."
      );
    }
  } catch (sessionError) {
    logger.error(
      `Session deletion failed for user ${userId}: ${sessionError.message}`
    );
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      "❌ There was a problem logging you out. Please try again."
    );
  }
}

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