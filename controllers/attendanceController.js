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
    let message = "📊 *Your Attendance Summary*\n\n";

    if (
      attendanceData &&
      attendanceData.attendance &&
      attendanceData.attendance.length > 0
    ) {
      if (attendanceData.regNumber) {
        message += `*Registration Number:* ${attendanceData.regNumber}\n\n`;
      }

      attendanceData.attendance.forEach((course) => {
        message += `📘 *${course.courseTitle}* (${course.courseCode})\n`;
        message += `Category: ${course.category} | Slot: ${course.slot}\n`;
        message += `Faculty: ${course.facultyName}\n`;
        message += `Present: ${
          parseInt(course.hoursConducted) - parseInt(course.hoursAbsent)
        }/${course.hoursConducted}\n`;
        message += `Absent: ${course.hoursAbsent}\n`;
        message += `Attendance: ${course.attendancePercentage}%\n\n`;
      });

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

      message += `*Overall Attendance: ${overallPercentage}%*`;
    } else {
      message = "No attendance data available.";
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
