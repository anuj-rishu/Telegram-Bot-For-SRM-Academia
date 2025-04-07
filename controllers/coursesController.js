const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

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

  try {
    await ctx.reply("Fetching your courses...");

    const loadingInterval = setInterval(() => {
      ctx.telegram.sendChatAction(ctx.chat.id, "typing");
    }, 3000);
    
    const response = await apiService.makeAuthenticatedRequest(
      "/courses",
      session
    );

    clearInterval(loadingInterval);

    const coursesData = response.data;
    let message = "📚 *YOUR COURSES*\n";
    message += "━━━━━━━━━━━━━━━━━━\n\n";

    if (coursesData && coursesData.courses && coursesData.courses.length > 0) {
      // Sort courses by type (Theory first, then Practical)
      const sortedCourses = [...coursesData.courses].sort((a, b) => {
        if (a.type === b.type) return 0;
        return a.type === "Theory" ? -1 : 1;
      });
      
      sortedCourses.forEach((course) => {
        const typeEmoji = course.type === "Theory" ? "📖" : "🧪";
        
        message += `${typeEmoji} *${course.title}*\n`;
        message += `╰┈➤ *Code:* ${course.code}\n`;
        message += `╰┈➤ *Credits:* ${course.credit}\n`;
        message += `╰┈➤ *Type:* ${course.type}\n`;
        message += `╰┈➤ *Faculty:* ${course.faculty}\n`;
        message += `╰┈➤ *Slot:* ${course.slot} | *Room:* ${course.room || "N/A"}\n`;
        message += `\n`;
      });

      const totalCredits = coursesData.courses.reduce((sum, course) => {
        const credit = parseInt(course.credit) || 0;
        return sum + credit;
      }, 0);

      message += `🎓 *Total Credits: ${totalCredits}*`;
    } else {
      message = "📚 *YOUR COURSES*\n\n❌ No courses data available.";
    }

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error("Courses error:", error.response?.data || error.message);
    ctx.reply(
      `Error fetching courses: ${error.response?.data?.error || error.message}`
    );
  }
}

module.exports = {
  handleCourses,
};