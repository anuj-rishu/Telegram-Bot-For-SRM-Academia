const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

/**
 * Handle timetable command
 * @param {Object} ctx - Telegraf context
 */
async function handleTimetable(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  try {
    ctx.reply("📊 Fetching your timetable...");

    
    const calendarResponse = await apiService.makeAuthenticatedRequest(
      "/calendar",
      session
    );
    const dayOrder = calendarResponse.data.today.dayOrder;

    const response = await apiService.makeAuthenticatedRequest(
      "/timetable",
      session
    );
    const timetableData = response.data;

    let message = "� *Complete Timetable*\n\n";

    if (timetableData.regNumber) {
      // message += `👤 *Registration Number:* ${timetableData.regNumber}\n`;
      // message += `🎓 *Batch:* ${timetableData.batch}\n\n`;
      // message += `━━━━━━━━━━━━━━━━━━\n\n`;
    }

    if (timetableData && timetableData.schedule && timetableData.schedule.length > 0) {
      timetableData.schedule.forEach((daySchedule) => {
        message += `📌 *Day ${daySchedule.day}*\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;

        let hasClasses = false;

        daySchedule.table.forEach((slot) => {
          if (slot) {
            hasClasses = true;
            message += `⏰ *${slot.startTime} - ${slot.endTime}*\n`;
            message += `📚 ${slot.name}\n`;
            message += `🏛 Room: ${slot.roomNo}\n`;
            message += `📝 Type: ${slot.courseType}\n`;
            message += `\n`;
          }
        });

        if (!hasClasses) {
          message += `😴 No classes scheduled\n\n`;
        }
      });
    } else {
      message += "❌ No timetable data available.";
    }

    ctx.replyWithMarkdown(message);

    if (timetableData && timetableData.schedule && timetableData.schedule.length > 3) {
      if (dayOrder !== "-") {
        setTimeout(() => {
          ctx.reply(
            "🔍 Want to see just today's classes? Use /todaysclass command!"
          );
        }, 1000);
      }
    }
  } catch (error) {
    console.error("Timetable error:", error.response?.data || error.message);
    ctx.reply(
      `❌ Error fetching timetable: ${
        error.response?.data?.error || error.message
      }`
    );
  }
}

/**
 * Handle today's timetable command
 * @param {Object} ctx - Telegraf context
 */
async function handleTodayTimetable(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  try {
    // ctx.reply("🔄 Fetching today's classes...");

  
    const calendarResponse = await apiService.makeAuthenticatedRequest(
      "/calendar",
      session
    );
    const dayOrder = calendarResponse.data.today.dayOrder;

    if (dayOrder === "-") {
      return ctx.replyWithMarkdown("📚 *Today's Classes*\n\n🎉 No classes today (Holiday/Weekend)");
    }

    const response = await apiService.makeAuthenticatedRequest(
      "/timetable",
      session
    );
    const timetableData = response.data;

    let message = `📚 *Today's Classes*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 Day Order: ${dayOrder}\n\n`;

    if (timetableData && timetableData.schedule) {
      const todaySchedule = timetableData.schedule.find(
        (day) => day.day === parseInt(dayOrder)
      );

      if (todaySchedule) {
        let hasClasses = false;

        todaySchedule.table.forEach((slot) => {
          if (slot) {
            hasClasses = true;
            message += `⏰ *${slot.startTime} - ${slot.endTime}*\n`;
            message += `📚 ${slot.name}\n`;
         
            message += `🏛 Room: ${slot.roomNo}\n`;
            message += `\n`;
          }
        });

        if (!hasClasses) {
          message += `🎉 No classes scheduled for today!\n`;
        }
      } else {
        message += `❌ No timetable found for today.\n`;
      }
    } else {
      message += "❌ No timetable data available.";
    }

    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error(
      "Today's timetable error:",
      error.response?.data || error.message
    );
    ctx.reply(
      `❌ Error fetching today's timetable: ${
        error.response?.data?.error || error.message
      }`
    );
  }
}

module.exports = {
  handleTimetable,
  handleTodayTimetable,
};