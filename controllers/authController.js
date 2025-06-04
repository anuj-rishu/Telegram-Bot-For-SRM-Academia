const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
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
  } catch (error) {}

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
    if (process.env.NODE_ENV === "production") {
      logger.error(
        `Session deletion failed for user ${userId}: ${sessionError.message}`
      );
    }
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      "❌ There was a problem logging you out. Please try again."
    );
  }
}

module.exports = {
  handleLogout,
};