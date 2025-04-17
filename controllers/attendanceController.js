const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "error" : "info",
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
    }),
  ],
});

/**
 * Handle attendance command
 * @param {Object} ctx
 */
async function handleAttendance(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  try {
    // Send immediate feedback
    await ctx.reply("Fetching your attendance data...");
    ctx.telegram.sendChatAction(ctx.chat.id, "typing");

    const response = await apiService.makeAuthenticatedRequest(
      "/attendance",
      session
    );

    if (!response || !response.data) {
      return ctx.reply(
        "Unable to fetch attendance data. Please try again later."
      );
    }

    const attendanceData = response.data;
    let message = "📊 *YOUR ATTENDANCE SUMMARY*\n";

    try {
      if (attendanceData?.attendance?.length > 0) {
        let totalClasses = 0;
        let totalAbsent = 0;

        attendanceData.attendance.forEach((course) => {
          const hoursConducted = parseInt(course.hoursConducted || 0);
          const hoursAbsent = parseInt(course.hoursAbsent || 0);

          totalClasses += isNaN(hoursConducted) ? 0 : hoursConducted;
          totalAbsent += isNaN(hoursAbsent) ? 0 : hoursAbsent;
        });

        const overallPercentage =
          totalClasses > 0
            ? (((totalClasses - totalAbsent) / totalClasses) * 100).toFixed(2)
            : 0;

        let overallEmoji = "❌";
        if (overallPercentage >= 90) overallEmoji = "✅";
        else if (overallPercentage >= 75) overallEmoji = "✳️";
        else if (overallPercentage >= 60) overallEmoji = "⚠️";

        message += `\n${overallEmoji} *Overall: ${overallPercentage}%*\n`;
        message += `📚 *Total Classes: ${totalClasses}*\n`;
        message += `━━━━━━━━━━━━━\n\n`;

        for (const course of attendanceData.attendance) {
          if (!course) continue;

          const hoursConducted = parseInt(course.hoursConducted || 0);
          const hoursAbsent = parseInt(course.hoursAbsent || 0);
          const hoursPresent = hoursConducted - hoursAbsent;
          const attendancePercentage = parseFloat(
            course.attendancePercentage || 0
          );
          const category = course.category || "Unknown";
          const courseTitle = course.courseTitle || "Unknown Course";

          const categoryEmoji = category === "Theory" ? "📖" : "🧪";

          let courseEmoji = "❌";
          if (attendancePercentage >= 90) courseEmoji = "✅";
          else if (attendancePercentage >= 75) courseEmoji = "✳️";
          else if (attendancePercentage >= 60) courseEmoji = "⚠️";

          message += `📚 *${courseTitle}* (${category})\n`;
          message += `${courseEmoji} *Attendance: ${attendancePercentage}%*\n`;
          message += `╰┈➤ Present: ${hoursPresent}/${hoursConducted}\n`;
          message += `╰┈➤ Absent: ${hoursAbsent}\n`;

          if (attendancePercentage >= 75) {
            let skippable = 0;
            if (hoursPresent > 0 && hoursConducted > 0) {
              skippable = Math.floor(hoursPresent / 0.75 - hoursConducted);
            }
            message += `🎯 *Can skip:* ${Math.max(
              0,
              skippable
            )} more classes\n`;
          } else {
            let classesNeeded = 1;
            if (hoursConducted > 0) {
              classesNeeded = Math.ceil(
                (0.75 * hoursConducted - hoursPresent) / 0.25
              );
            }
            message += `📌 *Need to attend:* ${Math.max(
              1,
              classesNeeded
            )} more classes\n`;
          }
          message += `\n`;
        }
      } else {
        message = "❌ *No attendance data available.*";
      }
    } catch (processingError) {
      logger.error("Error processing attendance data:", processingError);
      return ctx.reply(
        "Error processing your attendance data. Please try again later."
      );
    }

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    logger.error("Attendance error:", error.response?.data || error.message);
    ctx.reply(
      `Error fetching attendance data: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

module.exports = {
  handleAttendance,
};