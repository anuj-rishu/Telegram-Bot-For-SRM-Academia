const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const { requireAuth } = require("../utils/authUtils");

const calendarCache = new Map();

async function handleCalendar(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }

  try {
    const loadingMessage = await ctx.reply("Fetching academic calendar...");

    const response = await apiService.makeAuthenticatedRequest(
      "/calendar",
      session
    );

    if (!response || !response.data) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMessage.message_id,
        null,
        "Unable to fetch calendar data. Please try again later."
      );
    }

    const calendarData = response.data;

    calendarCache.set(userId, calendarData);

    await showCalendarOverview(ctx, calendarData, loadingMessage.message_id);
  } catch (error) {
    logger.error("Calendar fetch error:", error.message || error);
    ctx.reply(
      `Error fetching calendar: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

async function showCalendarOverview(ctx, calendarData, messageId) {
  const { today, tomorrow, dayAfterTomorrow, calendar } = calendarData;

  let message = "📅 *Academic Calendar Overview*\n\n";

  message += `🔹 *Today (${today.date})*\n`;
  message += `${today.day}${today.event ? ` - ${today.event}` : ""}\n`;
  message += `Day Order: ${
    today.dayOrder !== "-" ? today.dayOrder : "Holiday/Weekend"
  }\n\n`;

  message += `🔸 *Tomorrow (${tomorrow.date})*\n`;
  message += `${tomorrow.day}${tomorrow.event ? ` - ${tomorrow.event}` : ""}\n`;
  message += `Day Order: ${
    tomorrow.dayOrder !== "-" ? tomorrow.dayOrder : "Holiday/Weekend"
  }\n\n`;

  message += `🔹 *Day After Tomorrow (${dayAfterTomorrow.date})*\n`;
  message += `${dayAfterTomorrow.day}${
    dayAfterTomorrow.event ? ` - ${dayAfterTomorrow.event}` : ""
  }\n`;
  message += `Day Order: ${
    dayAfterTomorrow.dayOrder !== "-"
      ? dayAfterTomorrow.dayOrder
      : "Holiday/Weekend"
  }\n\n`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "📆 View Full Calendar", callback_data: "cal_full" },
        {
          text: "📍 Current Month",
          callback_data: `cal_month_${calendarData.index}`,
        },
      ],
      [
        { text: "🎯 Upcoming Events", callback_data: "cal_events" },
        { text: "📊 Day Orders", callback_data: "cal_dayorders" },
      ],
      calendar.length > 1
        ? [
            {
              text: "◀️ Previous Month",
              callback_data: `cal_month_${Math.max(0, calendarData.index - 1)}`,
            },
            {
              text: "▶️ Next Month",
              callback_data: `cal_month_${Math.min(
                calendar.length - 1,
                calendarData.index + 1
              )}`,
            },
          ]
        : [],
    ].filter((row) => row.length > 0),
  };

  if (messageId) {
    await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

async function handleCalendarCallback(ctx) {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const calendarData = calendarCache.get(userId);

  if (!calendarData) {
    return ctx.answerCbQuery(
      "Calendar data expired. Please use /calendar command again."
    );
  }

  try {
    if (data === "cal_full") {
      await showFullCalendar(ctx, calendarData);
    } else if (data.startsWith("cal_month_")) {
      const monthIndex = parseInt(data.split("_")[2]);
      await showMonthView(ctx, calendarData, monthIndex);
    } else if (data === "cal_events") {
      await showUpcomingEvents(ctx, calendarData);
    } else if (data === "cal_dayorders") {
      await showDayOrders(ctx, calendarData);
    } else if (data === "cal_back") {
      await showCalendarOverview(ctx, calendarData);
    }

    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Calendar callback error:", error);
    await ctx.answerCbQuery("An error occurred. Please try again.");
  }
}

async function showFullCalendar(ctx, calendarData) {
  let message = "📅 *Full Academic Calendar*\n\n";

  for (const month of calendarData.calendar) {
    message += `*${month.month}*\n`;
    const eventsInMonth = month.days.filter((day) => day.event);

    if (eventsInMonth.length > 0) {
      for (const day of eventsInMonth) {
        message += `${day.date} ${day.day}: ${day.event}\n`;
      }
    } else {
      message += "No special events\n";
    }
    message += "\n";
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "cal_back" }],
    ],
  };

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

async function showMonthView(ctx, calendarData, monthIndex) {
  const month = calendarData.calendar[monthIndex];
  if (!month) return;

  let message = `📅 *${month.month} - Detailed View*\n\n`;

  const weeks = [];
  let currentWeek = [];

  for (const day of month.days) {
    currentWeek.push(day);
    if (day.day === "Sun" || currentWeek.length === 7) {
      weeks.push([...currentWeek]);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  for (const week of weeks) {
    for (const day of week) {
      const dayOrder = day.dayOrder !== "-" ? `[${day.dayOrder}]` : "[H]";
      const hasEvent = day.event ? "🎯" : "";
      message += `${day.date}${dayOrder}${hasEvent} `;
    }
    message += "\n";
  }

  message +=
    "\n*Legend:*\n[1-5] Day Order | [H] Holiday/Weekend | 🎯 Event\n\n";

  const events = month.days.filter((day) => day.event);
  if (events.length > 0) {
    message += "*Events this month:*\n";
    for (const event of events) {
      message += `${event.date} ${event.day}: ${event.event}\n`;
    }
  }

  const keyboard = {
    inline_keyboard: [
      [
        monthIndex > 0
          ? {
              text: "◀️ Previous",
              callback_data: `cal_month_${monthIndex - 1}`,
            }
          : null,
        { text: "📋 Overview", callback_data: "cal_back" },
        monthIndex < calendarData.calendar.length - 1
          ? { text: "Next ▶️", callback_data: `cal_month_${monthIndex + 1}` }
          : null,
      ].filter(Boolean),
    ],
  };

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

async function showUpcomingEvents(ctx, calendarData) {
  let message = "🎯 *Upcoming Events*\n\n";
  let eventCount = 0;

  for (const month of calendarData.calendar) {
    const events = month.days.filter((day) => day.event);
    if (events.length > 0) {
      message += `*${month.month}*\n`;
      for (const event of events) {
        message += `${event.date} ${event.day}: ${event.event}\n`;
        eventCount++;
      }
      message += "\n";
    }
  }

  if (eventCount === 0) {
    message += "No upcoming events found.";
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "cal_back" }],
    ],
  };

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

async function showDayOrders(ctx, calendarData) {
  let message = "📊 *Day Order Information*\n\n";

  const dayOrderCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalWorkingDays = 0;

  for (const month of calendarData.calendar) {
    for (const day of month.days) {
      if (day.dayOrder !== "-") {
        dayOrderCount[day.dayOrder]++;
        totalWorkingDays++;
      }
    }
  }

  message += `*Total Working Days:* ${totalWorkingDays}\n\n`;
  message += "*Day Order Distribution:*\n";
  for (let i = 1; i <= 5; i++) {
    message += `Day ${i}: ${dayOrderCount[i]} days\n`;
  }

  message += "\n*Current Day Order Pattern:*\n";
  message += `Today: ${
    calendarData.today.dayOrder !== "-"
      ? calendarData.today.dayOrder
      : "Holiday/Weekend"
  }\n`;
  message += `Tomorrow: ${
    calendarData.tomorrow.dayOrder !== "-"
      ? calendarData.tomorrow.dayOrder
      : "Holiday/Weekend"
  }\n`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "cal_back" }],
    ],
  };

  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

module.exports = {
  handleCalendar,
  handleCalendarCallback,
};