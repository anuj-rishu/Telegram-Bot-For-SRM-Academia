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
    let message = "🎓 *YOUR ACADEMIC MARKS*\n";

    if (marksData && marksData.marks && marksData.marks.length > 0) {
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

        let performanceEmoji = "❌";
        if (overallPercentage >= 90) performanceEmoji = "✅";
        else if (overallPercentage >= 75) performanceEmoji = "✳️";
        else if (overallPercentage >= 60) performanceEmoji = "⚠️";

        message += `\n${performanceEmoji} *Overall: ${overallPercentage}%*\n`;
        message += `🏆 *Total: ${totalScored}/${totalPossible}*\n`;
        message += `━━━━━━━━━━━━━\n\n`;
      }

      const coursesByType = {};

      marksData.marks.forEach((course) => {
        const type = course.courseType || "Other";
        if (!coursesByType[type]) {
          coursesByType[type] = [];
        }
        coursesByType[type].push(course);
      });

      for (const type in coursesByType) {
        message += `📚*${type.toUpperCase()} COURSES*\n\n`;

        coursesByType[type].forEach((course) => {
          message += `📚 *${course.courseName}*\n`;

          if (
            course.overall &&
            (parseFloat(course.overall.scored) > 0 ||
              parseFloat(course.overall.total) > 0)
          ) {
            const coursePercentage =
              parseFloat(course.overall.total) > 0
                ? (
                    (parseFloat(course.overall.scored) /
                      parseFloat(course.overall.total)) *
                    100
                  ).toFixed(1)
                : 0;

            let courseEmoji = "❌";
            if (coursePercentage >= 90) courseEmoji = "✅";
            else if (coursePercentage >= 75) courseEmoji = "✳️";
            else if (coursePercentage >= 60) courseEmoji = "⚠️";

            message += `${courseEmoji} *Overall:* ${course.overall.scored}/${course.overall.total} (${coursePercentage}%)\n`;
          }

          if (course.testPerformance && course.testPerformance.length > 0) {
            message += `✏️ *Tests:*\n`;
            course.testPerformance.forEach((test) => {
              const testPercentage =
                parseFloat(test.marks.total) > 0
                  ? (
                      (parseFloat(test.marks.scored) /
                        parseFloat(test.marks.total)) *
                      100
                    ).toFixed(1)
                  : 0;

              let testEmoji = "❔";
              if (testPercentage >= 90) testEmoji = "✅";
              else if (testPercentage >= 75) testEmoji = "✳️";
              else if (testPercentage >= 60) testEmoji = "⚠️";
              else testEmoji = "❌";

              message += `  ${testEmoji} ${test.test}: ${test.marks.scored}/${test.marks.total}\n`;
            });
          } else if (
            !course.overall ||
            (parseFloat(course.overall.scored) === 0 &&
              parseFloat(course.overall.total) === 0)
          ) {
            message += `❔ No marks available yet\n`;
          }

          message += `\n`;
        });

        message += `━━━━━━━━━━━━━\n\n`;
      }
    } else {
      message = "🎓 *YOUR ACADEMIC MARKS*\n\n❌ No marks data available.";
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