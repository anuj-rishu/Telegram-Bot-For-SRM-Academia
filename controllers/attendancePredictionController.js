const sessionManager = require("../utils/sessionManager");
const GroqAttendanceService = require("../services/GroqAttendanceService");

let groqAttendanceService = null;

/**
 * Initialize Groq Attendance Service with bot instance
 * @param {Object} bot - Telegraf bot instance
 */
function initGroqService(bot) {
  groqAttendanceService = new GroqAttendanceService(bot);
}

/**
 * Handle attendance prediction query
 * @param {Object} ctx - Telegraf context
 * @param {String} question - User's attendance question
 */
async function handleAttendancePrediction(ctx, question) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  try {
    await ctx.reply("🔍 Analyzing your attendance data...");

    const loadingMessage = await ctx.reply("⏳ This might take a moment...");
    const loadingInterval = setInterval(() => {
      ctx.telegram.sendChatAction(ctx.chat.id, "typing");
    }, 3000);

    const response = await groqAttendanceService.processAttendanceQuestion(
      userId,
      question,
      session
    );

    clearInterval(loadingInterval);
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);

    await ctx.replyWithMarkdown(response);
  } catch (error) {
    ctx.reply(
      `❌ Error analyzing attendance: ${error.message || "Unknown error"}`
    );
  }
}

module.exports = {
  handleAttendancePrediction,
  initGroqService,
};
