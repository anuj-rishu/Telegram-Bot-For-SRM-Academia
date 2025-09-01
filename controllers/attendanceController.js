const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const { createLoader } = require("../utils/loader");
const { requireAuth } = require("../utils/authUtils");

const attendanceCache = new Map();

async function handleAttendance(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }

  const loaderPromise = createLoader(ctx, "Fetching your attendance data...");
  const apiPromise = apiService.makeAuthenticatedRequest(
    "/attendance",
    session
  );

  const [loader, response] = await Promise.all([loaderPromise, apiPromise]);

  try {
    loader.stop();

    if (!response?.data?.attendance?.length) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.messageId,
        undefined,
        "❌ *No attendance data available.*",
        { parse_mode: "Markdown" }
      );
    }

    const attendanceArr = response.data.attendance;

    attendanceCache.set(userId, {
      data: attendanceArr,
      timestamp: Date.now(),
      messageId: loader.messageId,
    });

    await showOverviewScreen(ctx, attendanceArr, loader.messageId);
  } catch (error) {
    loader.stop();
    logger.error("Attendance error:", error.response?.data || error.message);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error fetching attendance data: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

async function showOverviewScreen(ctx, attendanceArr, messageId) {
  let totalClasses = 0,
    totalAbsent = 0;
  attendanceArr.forEach((course) => {
    totalClasses += +course.hoursConducted || 0;
    totalAbsent += +course.hoursAbsent || 0;
  });

  const overallPercentage =
    totalClasses > 0
      ? (((totalClasses - totalAbsent) / totalClasses) * 100).toFixed(2)
      : 0;

  const overallEmoji = getAttendanceEmoji(overallPercentage);

  const criticalCourses = attendanceArr.filter(
    (c) => (+c.attendancePercentage || 0) < 75
  ).length;

  let message = `📊 *ATTENDANCE DASHBOARD*\n\n`;
  message += `${overallEmoji} *Overall: ${overallPercentage}%*\n`;
  message += `📚 *Total Classes: ${totalClasses}*\n`;
  message += `⚠️ *Courses Needing Attention: ${criticalCourses}*\n`;
  message += `\nSelect a view below for more details:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "📋 All Courses", callback_data: "attendance_all" },
        { text: "⭐ Best Attendance", callback_data: "attendance_best" },
      ],
      [
        { text: "⚠️ Critical Courses", callback_data: "attendance_critical" },
        { text: "📊 Analysis", callback_data: "attendance_analysis" },
      ],
    ],
  };

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    message,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    }
  );
}

async function handleAttendanceCallback(ctx) {
  const userId = ctx.from.id;
  const callbackData = ctx.callbackQuery.data;

  await ctx.answerCbQuery();

  const cachedData = attendanceCache.get(userId);
  if (!cachedData) {
    return ctx.reply(
      "Your session has expired. Please fetch attendance data again."
    );
  }

  const { data: attendanceArr, messageId } = cachedData;

  switch (callbackData) {
    case "attendance_all":
      await showAllCoursesView(ctx, attendanceArr, messageId);
      break;
    case "attendance_best":
      await showBestAttendanceView(ctx, attendanceArr, messageId);
      break;
    case "attendance_critical":
      await showCriticalCoursesView(ctx, attendanceArr, messageId);
      break;
    case "attendance_analysis":
      await showAttendanceAnalysisView(ctx, attendanceArr, messageId);
      break;
    case "attendance_overview":
      await showOverviewScreen(ctx, attendanceArr, messageId);
      break;
  }
}

async function showAllCoursesView(ctx, attendanceArr, messageId) {
  let message = `📋 *ALL COURSES ATTENDANCE*\n\n`;

  for (const course of attendanceArr) {
    const hoursConducted = +course.hoursConducted || 0;
    const hoursAbsent = +course.hoursAbsent || 0;
    const hoursPresent = hoursConducted - hoursAbsent;
    const attendancePercentage = +course.attendancePercentage || 0;
    const category = course.category || "Unknown";
    const courseTitle = course.courseTitle || "Unknown Course";
    const categoryEmoji = category === "Theory" ? "📖" : "🧪";
    const courseEmoji = getAttendanceEmoji(attendancePercentage);

    message += `${categoryEmoji} *${courseTitle}* (${category})\n`;
    message += `${courseEmoji} *${attendancePercentage}%* | Present: ${hoursPresent}/${hoursConducted}\n`;

    if (attendancePercentage >= 75) {
      const skippable = Math.max(
        0,
        Math.floor(hoursPresent / 0.75 - hoursConducted)
      );
      message += `🎯 Can skip: ${skippable} classes\n\n`;
    } else {
      const classesNeeded = Math.max(
        1,
        Math.ceil((0.75 * hoursConducted - hoursPresent) / 0.25)
      );
      message += `📌 Need to attend: ${classesNeeded} more classes\n\n`;
    }
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "attendance_overview" }],
    ],
  };

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    message,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    }
  );
}

async function showBestAttendanceView(ctx, attendanceArr, messageId) {
  const sortedCourses = [...attendanceArr].sort(
    (a, b) => (+b.attendancePercentage || 0) - (+a.attendancePercentage || 0)
  );

  let message = `⭐ *BEST ATTENDANCE COURSES*\n\n`;

  sortedCourses.forEach((course, index) => {
    const attendancePercentage = +course.attendancePercentage || 0;
    const courseTitle = course.courseTitle || "Unknown Course";
    const emoji = getAttendanceEmoji(attendancePercentage);
    message += `${
      index + 1
    }. ${emoji} *${courseTitle}*: ${attendancePercentage}%\n`;
  });

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "attendance_overview" }],
    ],
  };

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    message,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    }
  );
}

async function showCriticalCoursesView(ctx, attendanceArr, messageId) {
  const criticalCourses = attendanceArr
    .filter((course) => (+course.attendancePercentage || 0) < 75)
    .sort(
      (a, b) => (+a.attendancePercentage || 0) - (+b.attendancePercentage || 0)
    );

  let message = `⚠️ *CRITICAL COURSES (BELOW 75%)*\n\n`;

  if (criticalCourses.length === 0) {
    message += "� Great job! You don't have any courses below 75%!";
  } else {
    criticalCourses.forEach((course) => {
      const hoursConducted = +course.hoursConducted || 0;
      const hoursAbsent = +course.hoursAbsent || 0;
      const hoursPresent = hoursConducted - hoursAbsent;
      const attendancePercentage = +course.attendancePercentage || 0;
      const courseTitle = course.courseTitle || "Unknown Course";
      const emoji = getAttendanceEmoji(attendancePercentage);
      const classesNeeded = Math.max(
        1,
        Math.ceil((0.75 * hoursConducted - hoursPresent) / 0.25)
      );

      message += `${emoji} *${courseTitle}: ${attendancePercentage}%*\n`;
      message += `📌 *Need to attend: ${classesNeeded} more classes*\n`;
      message += `Present: ${hoursPresent}/${hoursConducted}\n\n`;
    });
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "attendance_overview" }],
    ],
  };

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    message,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    }
  );
}

async function showAttendanceAnalysisView(ctx, attendanceArr, messageId) {
  let totalClasses = 0,
    totalAbsent = 0;
  const theoryClasses = { conducted: 0, present: 0 };
  const practicalClasses = { conducted: 0, present: 0 };

  attendanceArr.forEach((course) => {
    const conducted = +course.hoursConducted || 0;
    const absent = +course.hoursAbsent || 0;
    const present = conducted - absent;

    totalClasses += conducted;
    totalAbsent += absent;

    if (course.category === "Theory") {
      theoryClasses.conducted += conducted;
      theoryClasses.present += present;
    } else if (course.category === "Practical") {
      practicalClasses.conducted += conducted;
      practicalClasses.present += present;
    }
  });

  const totalPresent = totalClasses - totalAbsent;
  const overallPercentage =
    totalClasses > 0
      ? (((totalClasses - totalAbsent) / totalClasses) * 100).toFixed(2)
      : 0;

  const theoryPercentage =
    theoryClasses.conducted > 0
      ? ((theoryClasses.present / theoryClasses.conducted) * 100).toFixed(2)
      : 0;

  const practicalPercentage =
    practicalClasses.conducted > 0
      ? ((practicalClasses.present / practicalClasses.conducted) * 100).toFixed(
          2
        )
      : 0;

  const excellent = attendanceArr.filter(
    (c) => (+c.attendancePercentage || 0) >= 90
  ).length;
  const good = attendanceArr.filter(
    (c) =>
      (+c.attendancePercentage || 0) >= 75 &&
      (+c.attendancePercentage || 0) < 90
  ).length;
  const warning = attendanceArr.filter(
    (c) =>
      (+c.attendancePercentage || 0) >= 60 &&
      (+c.attendancePercentage || 0) < 75
  ).length;
  const critical = attendanceArr.filter(
    (c) => (+c.attendancePercentage || 0) < 60
  ).length;

  let message = `📊 *ATTENDANCE ANALYSIS*\n\n`;
  message += `*Overall Stats:*\n`;
  message += `${getAttendanceEmoji(
    overallPercentage
  )} Overall: ${overallPercentage}%\n`;
  message += `📚 Total Classes: ${totalClasses}\n`;
  message += `✅ Classes Attended: ${totalPresent}\n`;
  message += `❌ Classes Missed: ${totalAbsent}\n\n`;

  message += `*Breakdown by Type:*\n`;
  message += `📖 Theory: ${theoryPercentage}%\n`;
  message += `🧪 Practical: ${practicalPercentage}%\n\n`;

  message += `*Course Distribution:*\n`;
  message += `✅ Excellent (≥90%): ${excellent}\n`;
  message += `✳️ Good (≥75%): ${good}\n`;
  message += `⚠️ Warning (≥60%): ${warning}\n`;
  message += `❌ Critical (<60%): ${critical}\n`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "attendance_overview" }],
    ],
  };

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    messageId,
    undefined,
    message,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    }
  );
}

function getAttendanceEmoji(percentage) {
  return percentage >= 90
    ? "✅"
    : percentage >= 75
    ? "✳️"
    : percentage >= 60
    ? "⚠️"
    : "❌";
}

module.exports = {
  handleAttendance,
  handleAttendanceCallback,
};
