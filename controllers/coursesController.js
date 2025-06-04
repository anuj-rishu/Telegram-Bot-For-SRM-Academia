const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const { createLoader } = require("../utils/loader");

async function handleCourses(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  const loaderPromise = createLoader(ctx, "Fetching your courses...");
  const apiPromise = apiService.makeAuthenticatedRequest("/courses", session);

  const [loader, response] = await Promise.all([loaderPromise, apiPromise]);

  try {
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
    let message = "📚 *YOUR COURSES*\n━━━━━━━━━━━━━━━━━━\n\n";

    if (coursesData?.courses?.length > 0) {
      const sortedCourses = [...coursesData.courses].sort((a, b) =>
        a.type === b.type ? 0 : a.type === "Theory" ? -1 : 1
      );

      let totalCredits = 0;
      for (const course of sortedCourses) {
        const typeEmoji = course.type === "Theory" ? "📖" : "🧪";
        message += `${typeEmoji} *${course.title}*\n`;
        message += `╰┈➤ *Code:* ${course.code}\n`;
        message += `╰┈➤ *Credits:* ${course.credit}\n`;
        message += `╰┈➤ *Type:* ${course.type}\n`;
        message += `╰┈➤ *Faculty:* ${course.faculty}\n`;
        message += `╰┈➤ *Slot:* ${course.slot} | *Room:* ${course.room || "N/A"}\n\n`;
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
    if (process.env.NODE_ENV === "production") {
      logger.error("Courses fetch error:", error.message || error);
    }
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