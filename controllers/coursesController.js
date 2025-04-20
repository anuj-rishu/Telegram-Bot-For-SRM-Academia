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
 * Handle courses command
 * @param {Object} ctx - Telegraf context
 */
async function handleCourses(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  const loader = await createLoaderAnimation(ctx, "Fetching your courses...");

  try {
    const response = await apiService.makeAuthenticatedRequest(
      "/courses",
      session
    );

    loader.stop();

    if (!response || !response.data) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.messageId,
        undefined,
        "Unable to fetch courses. Please try again later."
      );
    }

    const coursesData = response.data;
    let message = "📚 *YOUR COURSES*\n";
    message += "━━━━━━━━━━━━━━━━━━\n\n";

    if (coursesData?.courses?.length > 0) {
      const sortedCourses = [...coursesData.courses].sort((a, b) =>
        a.type === b.type ? 0 : a.type === "Theory" ? -1 : 1
      );

      for (const course of sortedCourses) {
        const typeEmoji = course.type === "Theory" ? "📖" : "🧪";

        message += `${typeEmoji} *${course.title}*\n`;
        message += `╰┈➤ *Code:* ${course.code}\n`;
        message += `╰┈➤ *Credits:* ${course.credit}\n`;
        message += `╰┈➤ *Type:* ${course.type}\n`;
        message += `╰┈➤ *Faculty:* ${course.faculty}\n`;
        message += `╰┈➤ *Slot:* ${course.slot} | *Room:* ${
          course.room || "N/A"
        }\n`;
        message += `\n`;
      }

      let totalCredits = 0;
      for (const course of coursesData.courses) {
        totalCredits += parseInt(course.credit) || 0;
      }

      message += `🎓 *Total Credits: ${totalCredits}*`;
    } else {
      message = "📚 *YOUR COURSES*\n\n❌ No courses data available.";
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
      `❌ Error fetching courses: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

module.exports = {
  handleCourses,
};
