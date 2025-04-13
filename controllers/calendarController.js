const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

/**
 * Handle calendar command
 * @param {Object} ctx - Telegraf context
 */
async function handleCalendar(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  try {
    await ctx.reply("Fetching academic calendar...");

    const response = await apiService.makeAuthenticatedRequest(
      "/calendar",
      session
    );

    if (!response || !response.data) {
      return ctx.reply(
        "Unable to fetch calendar data. Please try again later."
      );
    }

    const calendar = response.data;
    let message = "📅 *Academic Calendar*\n\n";

    if (calendar?.calendar?.length > 0) {
      for (const month of calendar.calendar) {
        message += `*${month.month}*\n`;

        if (month.days?.length > 0) {
          for (const day of month.days) {
            message += `${day.date}: ${day.event}\n`;
          }
        } else {
          message += "No events\n";
        }

        message += "\n";
      }
    } else {
      message = "No calendar data available.";
    }

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    ctx.reply(
      `Error fetching calendar: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

module.exports = {
  handleCalendar,
};
