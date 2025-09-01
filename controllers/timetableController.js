const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const { createLoader } = require("../utils/loader");
const { requireAuth } = require("../utils/authUtils");
const axios = require("axios");
const { API_BASE_URL } = require("../config/config");

const timetableCache = new Map();
const attendanceCache = new Map();
const CACHE_TIME = 5 * 60 * 1000;

function findAttendanceForSlot(slot, attendance) {
  return attendance?.find(
    (c) =>
      (c.courseTitle === slot.name || c.courseTitle === slot.courseTitle) &&
      (c.category === slot.courseType || c.category === slot.category)
  );
}

function formatClassSlot(slot) {
  return (
    `⏰ *${slot.startTime} - ${slot.endTime}*\n` +
    `📚 *${slot.name || slot.courseTitle}* _(${
      slot.courseType || slot.category
    })_\n` +
    `🏛️ Room: *${slot.roomNo || "N/A"}*\n`
  );
}

function formatClassSlotWithAttendance(slot, attendance) {
  const course = findAttendanceForSlot(slot, attendance);
  if (!course) return formatClassSlot(slot);

  const percent = +course.attendancePercentage || 0;
  const total = +course.hoursConducted || 0;
  const absent = +course.hoursAbsent || 0;
  const present = total - absent;
  const emoji =
    percent >= 90 ? "🟢" : percent >= 75 ? "🟡" : percent >= 60 ? "🟠" : "🔴";

  let msg =
    formatClassSlot(slot) +
    `\n${emoji} *Attendance: ${percent}%*\n` +
    `╰┈➤ ✅ Present: *${present}/${total}*\n` +
    `╰┈➤ ❌ Absent: *${absent}*\n`;

  msg +=
    percent >= 75
      ? `╰┈➤ 🎯 *Can skip:* _${Math.max(
          0,
          present > 0 ? Math.floor(present / 0.75 - total) : 0
        )} more class(es)_\n`
      : `╰┈➤ 📌 *Need to attend:* _${Math.max(
          1,
          total > 0 ? Math.ceil((0.75 * total - present) / 0.25) : 1
        )} more class(es)_\n`;

  return msg;
}

async function fetchAttendanceData(session) {
  const key = session.token;
  const now = Date.now();
  const cached = attendanceCache.get(key);

  if (cached && now - cached.timestamp < CACHE_TIME) return cached.data;

  try {
    const response = await apiService.makeAuthenticatedRequest(
      "/attendance",
      session
    );
    const data = response.data?.attendance || [];
    attendanceCache.set(key, { data, timestamp: now });
    return data;
  } catch (error) {
    logger.error("Timetable attendance fetch error:", error.message || error);
    return [];
  }
}

async function handleTimetable(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }

  const loaderPromise = createLoader(ctx, "Fetching your timetable data...");
  const apiPromise = apiService.makeAuthenticatedRequest("/timetable", session);

  const [loader, response] = await Promise.all([loaderPromise, apiPromise]);

  try {
    loader.stop();

    if (!response?.data?.schedule?.length) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.messageId,
        undefined,
        "❌ *No timetable data available.*",
        { parse_mode: "Markdown" }
      );
    }

    const timetableData = response.data;
    
    timetableCache.set(userId, {
      data: timetableData,
      timestamp: Date.now(),
      messageId: loader.messageId
    });

    await showTimetableOverview(ctx, timetableData, loader.messageId);
  } catch (error) {
    loader.stop();
    logger.error("Timetable fetch error:", error.message || error);
    ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error fetching timetable: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

async function showTimetableOverview(ctx, timetableData, messageId) {
 
  let totalClasses = 0;
  let daysWithClasses = 0;
  
  timetableData.schedule.forEach(day => {
    if (day.table && day.table.length) {
      totalClasses += day.table.length;
      daysWithClasses++;
    }
  });

  let message = "📅 *TIMETABLE DASHBOARD*\n\n";
  message += `📊 *Total Days:* ${timetableData.schedule.length}\n`;
  message += `📚 *Total Classes:* ${totalClasses}\n`;
  message += `⏰ *Avg. Classes per Day:* ${daysWithClasses ? (totalClasses / daysWithClasses).toFixed(1) : 0}\n\n`;
  message += `Select a view below for more details:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "📋 Complete Timetable", callback_data: "timetable_complete" },
        { text: "📝 With Attendance", callback_data: "timetable_with_attendance" }
      ],
      [
        { text: "📆 Today's Classes", callback_data: "timetable_today" },
        { text: "📆 Tomorrow", callback_data: "timetable_tomorrow" }
      ],
      [
        { text: "📆 Day After", callback_data: "timetable_dayafter" },
        { text: "📑 Get PDF", callback_data: "timetable_pdf" }
      ]
    ]
  };

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    message,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

async function handleTimetableCallback(ctx) {
  const userId = ctx.from.id;
  const callbackData = ctx.callbackQuery.data;
  

  try {
    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error answering callback query:", error.message);
  
  }
  
  const session = sessionManager.getSession(userId);
  if (!session) {
    return ctx.reply("🔒 Please login first using /login.");
  }
  
  const cachedData = timetableCache.get(userId);
  if (!cachedData && callbackData !== "timetable_pdf") {
    return ctx.reply("Your session has expired. Please fetch timetable data again.");
  }

  try {
    if (callbackData === "timetable_pdf") {
      await handleTimetablePdf(ctx);
      return;
    }
    
    const { data: timetableData, messageId } = cachedData;
    
    switch(callbackData) {
      case "timetable_complete":
        await showCompleteTimetable(ctx, timetableData, messageId);
        break;
      case "timetable_with_attendance":
        await showTimetableWithAttendance(ctx, timetableData, messageId, session);
        break;
      case "timetable_today":
        await showTodaysClasses(ctx, messageId, session);
        break;
      case "timetable_tomorrow":
        await showTomorrowClasses(ctx, messageId, session);
        break;
      case "timetable_dayafter":
        await showDayAfterClasses(ctx, messageId, session);
        break;
      case "timetable_overview":
        await showTimetableOverview(ctx, timetableData, messageId);
        break;
    }
  } catch (error) {
    logger.error("Timetable callback handling error:", error.message);
    
 
    if (cachedData?.messageId) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          cachedData.messageId,
          undefined,
          "❌ An error occurred. Please try again.",
          { 
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "Try Again", callback_data: "timetable_overview" }]
              ]
            }
          }
        );
      } catch (e) {
       
        ctx.reply("❌ An error occurred while processing your request. Please try again.");
      }
    }
  }
}

async function showCompleteTimetable(ctx, timetableData, messageId) {
  let message = "📋 *COMPLETE TIMETABLE*\n\n";
  
  if (timetableData.schedule?.length) {
    for (const day of timetableData.schedule) {
      message += `\n📌 *Day ${day.day}*\n`;
      if (day.table?.length) {
        for (const slot of day.table) {
          message += formatClassSlot(slot) + "\n";
        }
      } else {
        message += `😴 No classes scheduled\n`;
      }
    }
  } else {
    message += "❌ No timetable data available.";
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
    ]
  };

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    message,
    { 
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
}

async function showTimetableWithAttendance(ctx, timetableData, messageId, session) {
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    "⏳ Loading attendance data...",
    { parse_mode: "Markdown" }
  );

  try {
    const attendance = await fetchAttendanceData(session);
    let message = "📋 *TIMETABLE WITH ATTENDANCE*\n\n";
    
    if (timetableData.schedule?.length) {
      for (const day of timetableData.schedule) {
        message += `\n📌 *Day ${day.day}*\n`;
        if (day.table?.length) {
          for (const slot of day.table) {
            message += formatClassSlotWithAttendance(slot, attendance) + "\n";
          }
        } else {
          message += `😴 No classes scheduled\n`;
        }
      }
    } else {
      message += "❌ No timetable data available.";
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
      ]
    };

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      message,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Timetable with attendance error:", error.message || error);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      "❌ Error loading timetable with attendance.",
      { 
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
          ]
        }
      }
    );
  }
}

async function showTodaysClasses(ctx, messageId, session) {
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    "⏳ Loading today's classes...",
    { parse_mode: "Markdown" }
  );
  
  try {
    const response = await apiService.makeAuthenticatedRequest("/today-classes", session);
    const data = response.data;
    
    let message = `📅 *TODAY'S CLASSES*\n\n`;
    message += `🗓️ *${data.day}, ${data.date}*\n`;
    message += `📌 *Day Order:* ${data.dayOrder}\n`;
    if (data.event) message += `🎯 *Event:* ${data.event}\n`;
    message += `\n`;
    
    if (data.classes && data.classes.length) {
      data.classes.forEach(c => {
        message += `⏰ *${c.startTime} - ${c.endTime}*\n`;
        message += `📚 *${c.name}* _(${c.courseType})_\n`;
        message += `🏛️ Room: *${c.roomNo || "N/A"}*\n\n`;
      });
    } else {
      message += "😴 No classes scheduled for today.";
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
      ]
    };

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      message,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Today's classes error:", error.message || error);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      "❌ Error loading today's classes.",
      { 
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
          ]
        }
      }
    );
  }
}

async function showTomorrowClasses(ctx, messageId, session) {
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    "⏳ Loading tomorrow's classes...",
    { parse_mode: "Markdown" }
  );
  
  try {
    const response = await apiService.makeAuthenticatedRequest("/tomorrow-classes", session);
    const data = response.data;
    
    let message = `📅 *TOMORROW'S CLASSES*\n\n`;
    message += `🗓️ *${data.day}, ${data.date}*\n`;
    message += `📌 *Day Order:* ${data.dayOrder}\n`;
    if (data.event) message += `🎯 *Event:* ${data.event}\n`;
    message += `\n`;
    
    if (data.classes && data.classes.length) {
      data.classes.forEach(c => {
        message += `⏰ *${c.startTime} - ${c.endTime}*\n`;
        message += `📚 *${c.name}* _(${c.courseType})_\n`;
        message += `🏛️ Room: *${c.roomNo || "N/A"}*\n\n`;
      });
    } else {
      message += "😴 No classes scheduled for tomorrow.";
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
      ]
    };

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      message,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Tomorrow's classes error:", error.message || error);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      "❌ Error loading tomorrow's classes.",
      { 
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
          ]
        }
      }
    );
  }
}

async function showDayAfterClasses(ctx, messageId, session) {
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    "⏳ Loading day after tomorrow's classes...",
    { parse_mode: "Markdown" }
  );
  
  try {
    const response = await apiService.makeAuthenticatedRequest("/day-after-tomorrow-classes", session);
    const data = response.data;
    
    let message = `📅 *DAY AFTER TOMORROW'S CLASSES*\n\n`;
    message += `🗓️ *${data.day}, ${data.date}*\n`;
    message += `📌 *Day Order:* ${data.dayOrder}\n`;
    if (data.event) message += `🎯 *Event:* ${data.event}\n`;
    message += `\n`;
    
    if (data.classes && data.classes.length) {
      data.classes.forEach(c => {
        message += `⏰ *${c.startTime} - ${c.endTime}*\n`;
        message += `📚 *${c.name}* _(${c.courseType})_\n`;
        message += `🏛️ Room: *${c.roomNo || "N/A"}*\n\n`;
      });
    } else {
      message += "😴 No classes scheduled for day after tomorrow.";
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
      ]
    };

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      message,
      { 
        parse_mode: "Markdown",
        reply_markup: keyboard
      }
    );
  } catch (error) {
    logger.error("Day after tomorrow's classes error:", error.message || error);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      "❌ Error loading day after tomorrow's classes.",
      { 
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
          ]
        }
      }
    );
  }
}

async function handleTimetablePdf(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);
  
  if (!requireAuth(ctx, session)) {
    return;
  }

  const csrfToken = session.csrfToken || "";
  
  let cachedData = timetableCache.get(userId);
  let messageId;
  
  if (cachedData) {
    messageId = cachedData.messageId;
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      "⏳ Generating your timetable PDF...",
      { parse_mode: "Markdown" }
    );
  } else {
    const loader = await createLoader(ctx, "Generating your timetable PDF...");
    messageId = loader.messageId;
  }

  try {
    const response = await axios.get(`${API_BASE_URL}/timetable-pdf`, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "X-CSRF-Token": csrfToken,
      },
    });

    const filename = `Timetable.pdf`;
    await ctx.replyWithDocument({
      source: Buffer.from(response.data),
      filename,
    });
    
    if (cachedData) {
   
      await showTimetableOverview(ctx, cachedData.data, messageId);
    } else {
  
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        "✅ Timetable PDF generated successfully!",
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    logger.error("PDF fetch/send error:", error.message || error);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      `❌ Error generating PDF: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`,
      { 
        parse_mode: "Markdown",
        reply_markup: cachedData ? {
          inline_keyboard: [
            [{ text: "◀️ Back to Overview", callback_data: "timetable_overview" }]
          ]
        } : undefined
      }
    );
  }
}


async function handleTodaysClass(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }
  
  const loader = await createLoader(ctx, "Fetching today's classes...");
  
  try {
    const response = await apiService.makeAuthenticatedRequest("/today-classes", session);
    const data = response.data;
    
    let message = `📅 *TODAY'S CLASSES*\n\n`;
    message += `🗓️ *${data.day}, ${data.date}*\n`;
    message += `📌 *Day Order:* ${data.dayOrder}\n`;
    if (data.event) message += `🎯 *Event:* ${data.event}\n`;
    message += `\n`;
    
    if (data.classes && data.classes.length) {
      data.classes.forEach(c => {
        message += `⏰ *${c.startTime} - ${c.endTime}*\n`;
        message += `📚 *${c.name}* _(${c.courseType})_\n`;
        message += `🏛️ Room: *${c.roomNo || "N/A"}*\n\n`;
      });
    } else {
      message += "😴 No classes scheduled for today.";
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
    logger.error("Today's classes error:", error.message || error);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error: ${error.message || "Unknown error"}`
    );
  }
}

async function handleTomorrowClass(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }
  
  const loader = await createLoader(ctx, "Fetching tomorrow's classes...");
  
  try {
    const response = await apiService.makeAuthenticatedRequest("/tomorrow-classes", session);
    const data = response.data;
    
    let message = `📅 *TOMORROW'S CLASSES*\n\n`;
    message += `🗓️ *${data.day}, ${data.date}*\n`;
    message += `📌 *Day Order:* ${data.dayOrder}\n`;
    if (data.event) message += `🎯 *Event:* ${data.event}\n`;
    message += `\n`;
    
    if (data.classes && data.classes.length) {
      data.classes.forEach(c => {
        message += `⏰ *${c.startTime} - ${c.endTime}*\n`;
        message += `📚 *${c.name}* _(${c.courseType})_\n`;
        message += `🏛️ Room: *${c.roomNo || "N/A"}*\n\n`;
      });
    } else {
      message += "😴 No classes scheduled for tomorrow.";
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
    logger.error("Tomorrow's classes error:", error.message || error);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error: ${error.message || "Unknown error"}`
    );
  }
}

async function handleDayAfterClass(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }
  
  const loader = await createLoader(ctx, "Fetching day after tomorrow's classes...");
  
  try {
    const response = await apiService.makeAuthenticatedRequest("/day-after-tomorrow-classes", session);
    const data = response.data;
    
    let message = `📅 *DAY AFTER TOMORROW'S CLASSES*\n\n`;
    message += `🗓️ *${data.day}, ${data.date}*\n`;
    message += `📌 *Day Order:* ${data.dayOrder}\n`;
    if (data.event) message += `🎯 *Event:* ${data.event}\n`;
    message += `\n`;
    
    if (data.classes && data.classes.length) {
      data.classes.forEach(c => {
        message += `⏰ *${c.startTime} - ${c.endTime}*\n`;
        message += `📚 *${c.name}* _(${c.courseType})_\n`;
        message += `🏛️ Room: *${c.roomNo || "N/A"}*\n\n`;
      });
    } else {
      message += "😴 No classes scheduled for day after tomorrow.";
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
    logger.error("Day after tomorrow's classes error:", error.message || error);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error: ${error.message || "Unknown error"}`
    );
  }
}

module.exports = {
  handleTimetable,
  handleTimetableCallback,
  handleTodaysClass,
  handleTomorrowClass,
  handleDayAfterClass,
  handleTimetablePdf
};