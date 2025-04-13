const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

/**
 * Handle timetable command
 * @param {Object} ctx - Telegraf context
 */
async function handleTimetable(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  try {
    await ctx.reply("📊 Fetching your timetable...");

    const loadingInterval = setInterval(() => {
      ctx.telegram.sendChatAction(ctx.chat.id, "typing");
    }, 3000);

    const [calendarResponse, response] = await Promise.all([
      apiService.makeAuthenticatedRequest("/calendar", session),
      apiService.makeAuthenticatedRequest("/timetable", session),
    ]);

    clearInterval(loadingInterval);

    const dayOrder = calendarResponse.data.today.dayOrder;
    const timetableData = response.data;

    let message = "📋 *Complete Timetable*\n\n";

    if (
      timetableData &&
      timetableData.schedule &&
      timetableData.schedule.length > 0
    ) {
      for (let i = 0; i < timetableData.schedule.length; i++) {
        const daySchedule = timetableData.schedule[i];
        message += `📌 *Day ${daySchedule.day}*\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;

        let hasClasses = false;

        for (let j = 0; j < daySchedule.table.length; j++) {
          const slot = daySchedule.table[j];
          if (slot) {
            hasClasses = true;
            message += `⏰ *${slot.startTime} - ${slot.endTime}*\n`;
            message += `📚 ${slot.name} (${slot.courseType})\n`;
            message += `🏛 Room: ${slot.roomNo}\n\n`;
          }
        }

        if (!hasClasses) {
          message += `😴 No classes scheduled\n\n`;
        }
      }
    } else {
      message += "❌ No timetable data available.";
    }

    await ctx.replyWithMarkdown(message);

    if (timetableData?.schedule?.length > 3 && dayOrder !== "-") {
      setTimeout(() => {
        ctx.reply(
          "🔍 Want to see just today's classes? Use /todaysclass command!"
        );
      }, 1000);
    }
  } catch (error) {
    ctx.reply(
      `❌ Error fetching timetable: ${
        error.response?.data?.error || error.message || "Unknown error"
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

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  try {
    await ctx.reply("🔄 Fetching today's classes...");

    const loadingInterval = setInterval(() => {
      ctx.telegram.sendChatAction(ctx.chat.id, "typing");
    }, 3000);

    const calendarResponse = await apiService.makeAuthenticatedRequest(
      "/calendar",
      session
    );
    const dayOrder = calendarResponse.data.today.dayOrder;

    if (dayOrder === "-") {
      clearInterval(loadingInterval);
      return ctx.replyWithMarkdown(
        "📚 *Today's Classes*\n\n🎉 No classes today (Holiday/Weekend)"
      );
    }

    const response = await apiService.makeAuthenticatedRequest(
      "/timetable",
      session
    );
    clearInterval(loadingInterval);

    const timetableData = response.data;
    const dayOrderInt = parseInt(dayOrder);

    let message = `📚 *Today's Classes*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 Day Order: ${dayOrder}\n\n`;

    if (timetableData?.schedule) {
      const todaySchedule = timetableData.schedule.find(
        (day) => day.day === dayOrderInt
      );

      if (todaySchedule) {
        let hasClasses = false;

        for (const slot of todaySchedule.table) {
          if (slot) {
            hasClasses = true;
            message += `⏰ *${slot.startTime} - ${slot.endTime}*\n`;
            message += `📚 ${slot.name} (${slot.courseType})\n`;
            message += `🏛 Room: ${slot.roomNo}\n\n`;
          }
        }

        if (!hasClasses) {
          message += `🎉 No classes scheduled for today!\n`;
        }
      } else {
        message += `❌ No timetable found for today.\n`;
      }
    } else {
      message += "❌ No timetable data available.";
    }

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    ctx.reply(
      `❌ Error fetching today's timetable: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

/**
 * Handle tomorrow's timetable command
 * @param {Object} ctx - Telegraf context
 */
async function handleTomorrowTimetable(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  try {
    await ctx.reply("🔄 Fetching tomorrow's classes...");

    const loadingInterval = setInterval(() => {
      ctx.telegram.sendChatAction(ctx.chat.id, "typing");
    }, 3000);

    const calendarResponse = await apiService.makeAuthenticatedRequest(
      "/calendar",
      session
    );
    const dayOrder = calendarResponse.data.tomorrow?.dayOrder;

    if (!dayOrder || dayOrder === "-") {
      clearInterval(loadingInterval);
      return ctx.replyWithMarkdown(
        "📚 *Tomorrow's Classes*\n\n🎉 No classes tomorrow (Holiday/Weekend)"
      );
    }

    const response = await apiService.makeAuthenticatedRequest(
      "/timetable",
      session
    );
    clearInterval(loadingInterval);

    const timetableData = response.data;
    const dayOrderInt = parseInt(dayOrder);

    let message = `📚 *Tomorrow's Classes*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 Day Order: ${dayOrder}\n\n`;

    if (timetableData?.schedule) {
      const tomorrowSchedule = timetableData.schedule.find(
        (day) => day.day === dayOrderInt
      );

      if (tomorrowSchedule) {
        let hasClasses = false;

        for (const slot of tomorrowSchedule.table) {
          if (slot) {
            hasClasses = true;
            message += `⏰ *${slot.startTime} - ${slot.endTime}*\n`;
            message += `📚 ${slot.name} (${slot.courseType})\n`;
            message += `🏛 Room: ${slot.roomNo}\n\n`;
          }
        }

        if (!hasClasses) {
          message += `🎉 No classes scheduled for tomorrow!\n`;
        }
      } else {
        message += `❌ No timetable found for tomorrow.\n`;
      }
    } else {
      message += "❌ No timetable data available.";
    }

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    ctx.reply(
      `❌ Error fetching tomorrow's timetable: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

/**
 * Handle day after tomorrow's timetable command
 * @param {Object} ctx - Telegraf context
 */
async function handleDayAfterTomorrowTimetable(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  try {
    await ctx.reply("🔄 Fetching classes for day after tomorrow...");

    const loadingInterval = setInterval(() => {
      ctx.telegram.sendChatAction(ctx.chat.id, "typing");
    }, 3000);

    // Fetch calendar data
    const calendarResponse = await apiService.makeAuthenticatedRequest(
      "/calendar",
      session
    );
    const dayOrder = calendarResponse.data.dayAfterTomorrow?.dayOrder;

    if (!dayOrder || dayOrder === "-") {
      clearInterval(loadingInterval);
      return ctx.replyWithMarkdown(
        "📚 *Day After Tomorrow's Classes*\n\n🎉 No classes on day after tomorrow (Holiday/Weekend)"
      );
    }

    const response = await apiService.makeAuthenticatedRequest(
      "/timetable",
      session
    );
    clearInterval(loadingInterval);

    const timetableData = response.data;
    const dayOrderInt = parseInt(dayOrder);

    let message = `📚 *Day After Tomorrow's Classes*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 Day Order: ${dayOrder}\n\n`;

    if (timetableData?.schedule) {
      const dayAfterTomorrowSchedule = timetableData.schedule.find(
        (day) => day.day === dayOrderInt
      );

      if (dayAfterTomorrowSchedule) {
        let hasClasses = false;

        for (const slot of dayAfterTomorrowSchedule.table) {
          if (slot) {
            hasClasses = true;
            message += `⏰ *${slot.startTime} - ${slot.endTime}*\n`;
            message += `📚 ${slot.name} (${slot.courseType})\n`;
            message += `🏛 Room: ${slot.roomNo}\n\n`;
          }
        }

        if (!hasClasses) {
          message += `🎉 No classes scheduled for day after tomorrow!\n`;
        }
      } else {
        message += `❌ No timetable found for day after tomorrow.\n`;
      }
    } else {
      message += "❌ No timetable data available.";
    }

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    ctx.reply(
      `❌ Error fetching day after tomorrow's timetable: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

module.exports = {
  handleTimetable,
  handleTodayTimetable,
  handleTomorrowTimetable,
  handleDayAfterTomorrowTimetable,
};
