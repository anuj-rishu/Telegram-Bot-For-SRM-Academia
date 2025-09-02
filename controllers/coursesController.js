const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const { createLoader } = require("../utils/loader");
const { requireAuth } = require("../utils/authUtils");

const coursesCache = new Map();

async function handleCourses(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }

  const loaderPromise = createLoader(ctx, "Fetching your courses...");
  const apiPromise = apiService.makeAuthenticatedRequest("/courses", session);

  const [loader, response] = await Promise.all([loaderPromise, apiPromise]);

  try {
    loader.stop();

    if (!response || !response.data || !response.data.courses?.length) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.messageId,
        undefined,
        "❌ *No courses data available.*",
        { parse_mode: "Markdown" }
      );
    }

    const coursesData = response.data.courses;
    
    coursesCache.set(userId, {
      data: coursesData,
      timestamp: Date.now(),
      messageId: loader.messageId
    });

    await showCoursesOverview(ctx, coursesData, loader.messageId);
  } catch (error) {
    loader.stop();
    logger.error("Courses fetch error:", error.message || error);
    ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error fetching courses: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

async function showCoursesOverview(ctx, coursesData, messageId) {
  const theoryCourses = coursesData.filter(course => course.type === "Theory");
  const practicalCourses = coursesData.filter(course => course.type === "Practical");
  
  let totalCredits = 0;
  coursesData.forEach(course => {
    totalCredits += parseInt(course.credit) || 0;
  });

  let message = "📚 *COURSES DASHBOARD*\n\n";
  message += `📊 *Total Courses:* ${coursesData.length}\n`;
  message += `📖 *Theory Courses:* ${theoryCourses.length}\n`;
  message += `🧪 *Practical Courses:* ${practicalCourses.length}\n`;
  message += `🎓 *Total Credits:* ${totalCredits}\n\n`;
  message += `Select a view below for more details:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "📋 All Courses", callback_data: "courses_all" },
        { text: "📖 Theory", callback_data: "courses_theory" }
      ],
      [
        { text: "🧪 Practical", callback_data: "courses_practical" },
        { text: "👨‍🏫 By Faculty", callback_data: "courses_faculty" }
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

async function handleCoursesCallback(ctx) {
  const userId = ctx.from.id;
  const callbackData = ctx.callbackQuery.data;
  
  await ctx.answerCbQuery();
  
  const cachedData = coursesCache.get(userId);
  if (!cachedData) {
    return ctx.reply("Your session has expired. Please fetch course data again.");
  }
  
  const { data: coursesData, messageId } = cachedData;
  
  switch(callbackData) {
    case "courses_all":
      await showAllCoursesView(ctx, coursesData, messageId);
      break;
    case "courses_theory":
      await showTheoryCoursesView(ctx, coursesData, messageId);
      break;
    case "courses_practical":
      await showPracticalCoursesView(ctx, coursesData, messageId);
      break;
    case "courses_faculty":
      await showFacultyView(ctx, coursesData, messageId);
      break;
    case "courses_overview":
      await showCoursesOverview(ctx, coursesData, messageId);
      break;
  }
}

async function showAllCoursesView(ctx, coursesData, messageId) {
  const sortedCourses = [...coursesData].sort((a, b) =>
    a.type === b.type ? 0 : a.type === "Theory" ? -1 : 1
  );

  let message = "📋 *ALL COURSES*\n\n";

  for (const course of sortedCourses) {
    const typeEmoji = course.type === "Theory" ? "📖" : "🧪";
    message += `${typeEmoji} *${course.title}*\n`;
    message += `╰┈➤ *Code:* ${course.code}\n`;
    message += `╰┈➤ *Credits:* ${course.credit}\n`;
    message += `╰┈➤ *Type:* ${course.type}\n`;
    message += `╰┈➤ *Faculty:* ${course.faculty}\n`;
    message += `╰┈➤ *Slot:* ${course.slot} | *Room:* ${course.room || "N/A"}\n\n`;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "courses_overview" }]
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

async function showTheoryCoursesView(ctx, coursesData, messageId) {
  const theoryCourses = coursesData.filter(course => course.type === "Theory");
  
  let message = "📖 *THEORY COURSES*\n\n";
  
  if (theoryCourses.length === 0) {
    message += "No theory courses found.";
  } else {
    let totalCredits = 0;
    for (const course of theoryCourses) {
      message += `📖 *${course.title}*\n`;
      message += `╰┈➤ *Code:* ${course.code}\n`;
      message += `╰┈➤ *Credits:* ${course.credit}\n`;
      message += `╰┈➤ *Faculty:* ${course.faculty}\n`;
      message += `╰┈➤ *Slot:* ${course.slot} | *Room:* ${course.room || "N/A"}\n\n`;
      totalCredits += parseInt(course.credit) || 0;
    }
    message += `🎓 *Total Theory Credits: ${totalCredits}*`;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "courses_overview" }]
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

async function showPracticalCoursesView(ctx, coursesData, messageId) {
  const practicalCourses = coursesData.filter(course => course.type === "Practical");
  
  let message = "🧪 *PRACTICAL COURSES*\n\n";
  
  if (practicalCourses.length === 0) {
    message += "No practical courses found.";
  } else {
    let totalCredits = 0;
    for (const course of practicalCourses) {
      message += `🧪 *${course.title}*\n`;
      message += `╰┈➤ *Code:* ${course.code}\n`;
      message += `╰┈➤ *Credits:* ${course.credit}\n`;
      message += `╰┈➤ *Faculty:* ${course.faculty}\n`;
      message += `╰┈➤ *Slot:* ${course.slot} | *Room:* ${course.room || "N/A"}\n\n`;
      totalCredits += parseInt(course.credit) || 0;
    }
    message += `🎓 *Total Practical Credits: ${totalCredits}*`;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "courses_overview" }]
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

async function showFacultyView(ctx, coursesData, messageId) {
  const coursesByFaculty = {};
  
  coursesData.forEach(course => {
    const faculty = course.faculty || "Unknown";
    if (!coursesByFaculty[faculty]) {
      coursesByFaculty[faculty] = [];
    }
    coursesByFaculty[faculty].push(course);
  });
  
  let message = "👨‍🏫 *COURSES BY FACULTY*\n\n";
  
  for (const faculty in coursesByFaculty) {
    message += `*${faculty}*\n`;
    coursesByFaculty[faculty].forEach(course => {
      const typeEmoji = course.type === "Theory" ? "📖" : "🧪";
      message += `╰┈➤ ${typeEmoji} ${course.title} (${course.code})\n`;
    });
    message += "\n";
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "courses_overview" }]
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

module.exports = {
  handleCourses,
  handleCoursesCallback
};