const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

async function createLoaderAnimation(ctx, initialText) {
  const loadingFrames = ["⏳", "⌛️", "⏳", "⌛️"];
  const loadingMsg = await ctx.reply(`${loadingFrames[0]} ${initialText}`);

  let frameIndex = 0;
  const intervalId = setInterval(() => {
    frameIndex = (frameIndex + 1) % loadingFrames.length;
    ctx.telegram
      .editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        undefined,
        `${loadingFrames[frameIndex]} ${initialText}`
      )
      .catch(() => {
        clearInterval(intervalId);
      });
  }, 800);

  return {
    messageId: loadingMsg.message_id,
    stop: () => clearInterval(intervalId),
  };
}

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

  const loader = await createLoaderAnimation(ctx, "Fetching your profile...");

  try {
    const response = await apiService.makeAuthenticatedRequest(
      "/user",
      session
    );

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

    ctx.telegram.editMessageText(
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
