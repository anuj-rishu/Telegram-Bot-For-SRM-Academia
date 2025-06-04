const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const { createLoader } = require("../utils/loader");

async function handleUserInfo(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    await ctx.reply("You need to login first. Use /login command.");
    return;
  }

  const loaderPromise = createLoader(ctx, "Fetching your profile...");
  const apiPromise = apiService.makeAuthenticatedRequest("/user", session);

  const [loader] = await Promise.all([loaderPromise]);

  try {
    const response = await apiPromise;
    loader.stop();

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

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      message,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    loader.stop();
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `⚠️ Error fetching user information: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

module.exports = {
  handleUserInfo,
};
