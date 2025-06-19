const axios = require("axios");
const config = require("../config/config");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const { createLoader } = require("../utils/loader");

async function handleCGPA(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getStudentPortalSession(userId);

  if (!session || !session.token) {
    return ctx.reply(
      "You need to login to the Student Portal first. Use /loginsp command."
    );
  }

  const loader = await createLoader(ctx, "Fetching your CGPA details...");

  try {
    const response = await axios.get(
      `${config.STUDENT_PORTAL_API_URL}/marks-credits`,
      {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      }
    );

    loader.stop();

    if (!response.data || !response.data.success) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.messageId,
        undefined,
        "❌ Failed to fetch CGPA data. Please try again later.",
        { parse_mode: "Markdown" }
      );
    }

    const cgpaData = response.data.data;
    let message = "🎓 *YOUR CGPA DETAILS*\n━━━━━━━━━━━━━━━━━━\n\n";

    message += `📊 *Overall CGPA: ${cgpaData.overall.cgpa}*\n`;
    message += `✅ *Credits Earned:* ${cgpaData.overall.creditsEarned}/${cgpaData.overall.creditsRegistered}\n\n`;

    message += "🔢 *Semester-wise Performance:*\n";

    const sortedSemesters = [...cgpaData.semesterwise].sort(
      (a, b) => a.semester - b.semester
    );

    for (const semester of sortedSemesters) {
      let semEmoji = "📘";
      if (semester.sgpa >= 9.0) semEmoji = "🏆";
      else if (semester.sgpa >= 8.0) semEmoji = "✨";
      else if (semester.sgpa >= 7.0) semEmoji = "🔹";

      message += `${semEmoji} *Semester ${semester.semester}:* ${semester.sgpa} SGPA\n`;
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
      logger.error("CGPA fetch error:", error.response?.data || error.message);
    }
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error fetching CGPA data: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

module.exports = {
  handleCGPA,
};
