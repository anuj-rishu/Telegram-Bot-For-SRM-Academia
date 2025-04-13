const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

/**
 * Handle marks command
 * @param {Object} ctx - Telegraf context
 */
async function handleMarks(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  try {
    await ctx.reply("Fetching your marks data...");

    const loadingInterval = setInterval(() => {
      ctx.telegram.sendChatAction(ctx.chat.id, "typing");
    }, 3000);

    const response = await apiService.makeAuthenticatedRequest(
      "/marks",
      session
    );

    clearInterval(loadingInterval);

    if (!response || !response.data) {
      return ctx.reply("Unable to fetch marks data. Please try again later.");
    }

    const marksData = response.data;
    let message = "🎓 *YOUR ACADEMIC MARKS*\n";

    if (marksData?.marks?.length > 0) {
      const coursesWithMarks = marksData.marks.filter(
        (course) => course.overall && parseFloat(course.overall.total) > 0
      );

      if (coursesWithMarks.length > 0) {
        let totalScored = 0;
        let totalPossible = 0;

        for (const course of coursesWithMarks) {
          totalScored += parseFloat(course.overall.scored);
          totalPossible += parseFloat(course.overall.total);
        }

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

      for (const course of marksData.marks) {
        const type = course.courseType || "Other";
        if (!coursesByType[type]) {
          coursesByType[type] = [];
        }
        coursesByType[type].push(course);
      }

      for (const type in coursesByType) {
        message += `📚*${type.toUpperCase()} COURSES*\n\n`;

        for (const course of coursesByType[type]) {
          message += `📚 *${course.courseName}*\n`;

          if (
            course.overall &&
            (parseFloat(course.overall.scored) > 0 ||
              parseFloat(course.overall.total) > 0)
          ) {
            const overallTotal = parseFloat(course.overall.total);
            const overallScored = parseFloat(course.overall.scored);

            const coursePercentage =
              overallTotal > 0
                ? ((overallScored / overallTotal) * 100).toFixed(1)
                : 0;

            let courseEmoji = "❌";
            if (coursePercentage >= 90) courseEmoji = "✅";
            else if (coursePercentage >= 75) courseEmoji = "✳️";
            else if (coursePercentage >= 60) courseEmoji = "⚠️";

            message += `${courseEmoji} *Overall:* ${course.overall.scored}/${course.overall.total} (${coursePercentage}%)\n`;
          }

          if (course.testPerformance?.length > 0) {
            message += `✏️ *Tests:*\n`;

            for (const test of course.testPerformance) {
              const testTotal = parseFloat(test.marks.total);
              const testScored = parseFloat(test.marks.scored);

              const testPercentage =
                testTotal > 0 ? ((testScored / testTotal) * 100).toFixed(1) : 0;

              let testEmoji = "❔";
              if (testPercentage >= 90) testEmoji = "✅";
              else if (testPercentage >= 75) testEmoji = "✳️";
              else if (testPercentage >= 60) testEmoji = "⚠️";
              else testEmoji = "❌";

              message += `╰┈➤ ${testEmoji} ${test.test}: ${test.marks.scored}/${test.marks.total}\n`;
            }
          } else if (
            !course.overall ||
            (parseFloat(course.overall.scored) === 0 &&
              parseFloat(course.overall.total) === 0)
          ) {
            message += `❔ No marks available yet\n`;
          }

          message += `\n`;
        }
      }
    } else {
      message = "🎓 *YOUR ACADEMIC MARKS*\n\n❌ No marks data available.";
    }

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    ctx.reply(
      `Error fetching marks data: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

module.exports = {
  handleMarks,
};
