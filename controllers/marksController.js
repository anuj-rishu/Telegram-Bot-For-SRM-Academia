const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

/**
 * Handle marks command
 * @param {Object} ctx - Telegraf context
 */
async function handleMarks(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  try {
    ctx.reply("Fetching your marks data...");

    const response = await apiService.makeAuthenticatedRequest(
      "/marks",
      session
    );

    const marksData = response.data;
    let message = "📝 *Your Academic Marks*\n\n";

    if (marksData && marksData.regNumber) {
      message += `*Registration Number:* ${marksData.regNumber}\n\n`;
    }

    if (marksData && marksData.marks && marksData.marks.length > 0) {
      const coursesByType = {};

      marksData.marks.forEach((course) => {
        const type = course.courseType || "Other";
        if (!coursesByType[type]) {
          coursesByType[type] = [];
        }
        coursesByType[type].push(course);
      });

      for (const type in coursesByType) {
        message += `*📋 ${type} Courses*\n\n`;

        coursesByType[type].forEach((course) => {
          message += `📘 *${course.courseName}* (${course.courseCode})\n`;

          if (
            course.overall &&
            (parseFloat(course.overall.scored) > 0 ||
              parseFloat(course.overall.total) > 0)
          ) {
            message += `Overall: ${course.overall.scored}/${course.overall.total}\n`;
          }

          if (course.testPerformance && course.testPerformance.length > 0) {
            message += `Tests:\n`;
            course.testPerformance.forEach((test) => {
              message += `- ${test.test}: ${test.marks.scored}/${test.marks.total}\n`;
            });
          } else if (
            parseFloat(course.overall.scored) === 0 &&
            parseFloat(course.overall.total) === 0
          ) {
            message += `No marks available yet\n`;
          }

          message += `\n`;
        });
      }

      const coursesWithMarks = marksData.marks.filter(
        (course) => course.overall && parseFloat(course.overall.total) > 0
      );

      if (coursesWithMarks.length > 0) {
        const totalScored = coursesWithMarks.reduce(
          (sum, course) => sum + parseFloat(course.overall.scored),
          0
        );
        const totalPossible = coursesWithMarks.reduce(
          (sum, course) => sum + parseFloat(course.overall.total),
          0
        );

        const overallPercentage =
          totalPossible > 0
            ? ((totalScored / totalPossible) * 100).toFixed(2)
            : 0;

        message += `*Overall Performance: ${overallPercentage}%*\n`;
        message += `*Total Scored: ${totalScored}/${totalPossible}*`;
      }
    } else {
      message = "📝 *Your Academic Marks*\n\nNo marks data available.";
    }

    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error("Marks error:", error.response?.data || error.message);
    ctx.reply(
      `Error fetching marks data: ${
        error.response?.data?.error || error.message
      }`
    );
  }
}

module.exports = {
  handleMarks,
};
