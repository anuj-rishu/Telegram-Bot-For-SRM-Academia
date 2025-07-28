const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const { createLoader } = require("../utils/loader");

async function handleAttendance(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  const loaderPromise = createLoader(ctx, "Fetching your attendance data...");
  const apiPromise = apiService.makeAuthenticatedRequest("/attendance", session);

  const [loader, response] = await Promise.all([loaderPromise, apiPromise]);

  try {
    loader.stop();

    if (!response?.data?.attendance?.length) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.messageId,
        undefined,
        "❌ *No attendance data available.*",
        { parse_mode: "Markdown" }
      );
    }

    const attendanceArr = response.data.attendance;
    let totalClasses = 0, totalAbsent = 0;

    attendanceArr.forEach((course) => {
      totalClasses += +course.hoursConducted || 0;
      totalAbsent += +course.hoursAbsent || 0;
    });

    const overallPercentage =
      totalClasses > 0
        ? (((totalClasses - totalAbsent) / totalClasses) * 100).toFixed(2)
        : 0;
    const overallEmoji =
      overallPercentage >= 90
        ? "✅"
        : overallPercentage >= 75
        ? "✳️"
        : overallPercentage >= 60
        ? "⚠️"
        : "❌";

    let message = `📊 *YOUR ATTENDANCE SUMMARY*\n\n${overallEmoji} *Overall: ${overallPercentage}%*\n📚 *Total Classes: ${totalClasses}*\n━━━━━━━━━━━━━\n\n`;

    for (const course of attendanceArr) {
      const hoursConducted = +course.hoursConducted || 0;
      const hoursAbsent = +course.hoursAbsent || 0;
      const hoursPresent = hoursConducted - hoursAbsent;
      const attendancePercentage = +course.attendancePercentage || 0;
      const category = course.category || "Unknown";
      const courseTitle = course.courseTitle || "Unknown Course";
      const categoryEmoji = category === "Theory" ? "📖" : "🧪";
      const courseEmoji =
        attendancePercentage >= 90
          ? "✅"
          : attendancePercentage >= 75
          ? "✳️"
          : attendancePercentage >= 60
          ? "⚠️"
          : "❌";

      message += `${categoryEmoji} *${courseTitle}* (${category})\n`;
      message += `${courseEmoji} *Attendance: ${attendancePercentage}%*\n`;
      message += `╰┈➤ Present: ${hoursPresent}/${hoursConducted}\n`;
      message += `╰┈➤ Absent: ${hoursAbsent}\n`;

      if (attendancePercentage >= 75) {
        const skippable =
          hoursPresent > 0 && hoursConducted > 0
            ? Math.floor(hoursPresent / 0.75 - hoursConducted)
            : 0;
        message += `🎯 *Can skip:* ${Math.max(0, skippable)} more classes\n`;
      } else {
        const classesNeeded =
          hoursConducted > 0
            ? Math.ceil((0.75 * hoursConducted - hoursPresent) / 0.25)
            : 1;
        message += `📌 *Need to attend:* ${Math.max(1, classesNeeded)} more classes\n`;
      }
      message += `\n`;
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
      logger.error("Attendance error:", error.response?.data || error.message);
    }
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error fetching attendance data: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

module.exports = {
  handleAttendance,
};