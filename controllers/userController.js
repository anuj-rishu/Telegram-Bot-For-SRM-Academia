const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

/**
 * Handle user info command
 * @param {Object} ctx - Telegraf context
 */
async function handleUserInfo(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  try {
    await ctx.reply("🔄 Fetching your profile...");

    const loadingInterval = setInterval(() => {
      ctx.telegram.sendChatAction(ctx.chat.id, "typing");
    }, 3000);
    s;

    const response = await apiService.makeAuthenticatedRequest(
      "/user",
      session
    );

    clearInterval(loadingInterval);

    const user = response.data;
    let message = "🎓 *STUDENT PROFILE*\n";

    if (user) {
      message += "━━━━━━━━━━━━━\n";
      message += `👤 *Name:* ${user.name || "N/A"}\n`;
      message += `🔢 *Registration No:* ${user.regNumber || "N/A"}\n`;
      message += `📱 *Mobile:* ${user.mobile || "N/A"}\n\n`;

      message += "📚 *Academic Details*\n";
      message += "━━━━━━━━━━━━━\n";
      message += `🏢 *Department:* ${user.department || "N/A"}\n`;
      message += `📋 *Program:* ${user.program || "N/A"}\n`;
      message += `📅 *Year:* ${user.year || "N/A"}\n`;
      message += `🗓 *Semester:* ${user.semester || "N/A"}\n\n`;
    } else {
      message = "⚠️ No user data available.";
    }

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error("❌ User info error:", error.response?.data || error.message);
    ctx.reply(
      `⚠️ Error fetching user information: ${
        error.response?.data?.error || error.message
      }`
    );
  }
}

module.exports = {
  handleUserInfo,
};
