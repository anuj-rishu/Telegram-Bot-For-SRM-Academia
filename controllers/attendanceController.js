const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

/**
 * Handle attendance command
 * @param {Object} ctx
 */
async function handleAttendance(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  try {
    ctx.reply("Fetching your attendance data...");

    const response = await apiService.makeAuthenticatedRequest(
      "/attendance",
      session
    );

    const attendanceData = response.data;
    let message = "📊 *YOUR ATTENDANCE SUMMARY*\n";

    if (
      attendanceData &&
      attendanceData.attendance &&
      attendanceData.attendance.length > 0
    ) {
      const totalClasses = attendanceData.attendance.reduce(
        (sum, course) => sum + parseInt(course.hoursConducted),
        0
      );
      const totalAbsent = attendanceData.attendance.reduce(
        (sum, course) => sum + parseInt(course.hoursAbsent),
        0
      );
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

      attendanceData.attendance.forEach((course) => {
        const hoursConducted = parseInt(course.hoursConducted);
        const hoursAbsent = parseInt(course.hoursAbsent);
        const hoursPresent = hoursConducted - hoursAbsent;
        const attendancePercentage = parseFloat(course.attendancePercentage);

        let courseEmoji = "❌";
        if (attendancePercentage >= 90) courseEmoji = "✅";
        else if (attendancePercentage >= 75) courseEmoji = "✳️";
        else if (attendancePercentage >= 60) courseEmoji = "⚠️";

        message += `📚*${course.courseTitle}*\n`;
        message += `${courseEmoji} *Attendance: ${attendancePercentage}%*\n`;
        message += `👉 Present: ${hoursPresent}/${hoursConducted}\n`;
        message += `👉 Absent: ${hoursAbsent}\n`;

        if (attendancePercentage >= 75) {
          const skippable = Math.floor(hoursPresent / 0.75 - hoursConducted);
          message += `🎯 *Can skip:* ${Math.max(0, skippable)} more classes\n`;
        } else {
          const classesNeeded = Math.ceil(
            (0.75 * hoursConducted - hoursPresent) / 0.25
          );
          message += `📌 *Need to attend:* ${Math.max(
            1,
            classesNeeded
          )} more classes\n`;
        }
        message += `\n`;
      });
    } else {
      message = "❌ *No attendance data available.*";
    }

    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error("Attendance error:", error.response?.data || error.message);
    ctx.reply(
      `Error fetching attendance data: ${
        error.response?.data?.error || error.message
      }`
    );
  }
}

module.exports = {
  handleAttendance,
};
