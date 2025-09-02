const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const { createLoader } = require("../utils/loader");
const { requireAuth } = require("../utils/authUtils");

const marksCache = new Map();

async function handleMarks(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }

  const loaderPromise = createLoader(ctx, "Fetching your marks data...");
  const apiPromise = apiService.makeAuthenticatedRequest("/marks", session);

  const [loader, response] = await Promise.all([loaderPromise, apiPromise]);

  try {
    loader.stop();

    if (!response?.data?.marks?.length) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.messageId,
        undefined,
        "🎓 *YOUR ACADEMIC MARKS*\n\n❌ No marks data available.",
        { parse_mode: "Markdown" }
      );
    }

    const marksData = response.data;
    
    marksCache.set(userId, {
      data: marksData,
      timestamp: Date.now(),
      messageId: loader.messageId
    });

    await showMarksOverview(ctx, marksData, loader.messageId);
  } catch (error) {
    loader.stop();
    logger.error("Marks fetch error:", error.message || error);
    ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error fetching marks data: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

async function showMarksOverview(ctx, marksData, messageId) {
  const coursesWithMarks = marksData.marks.filter(
    (course) => course.overall && parseFloat(course.overall.total) > 0
  );
  
  let totalScored = 0;
  let totalPossible = 0;
  let coursesCount = marksData.marks.length;
  let completedTestsCount = 0;
  
  for (const course of coursesWithMarks) {
    totalScored += parseFloat(course.overall.scored);
    totalPossible += parseFloat(course.overall.total);
    
    if (course.testPerformance) {
      completedTestsCount += course.testPerformance.length;
    }
  }
  
  const overallPercentage = totalPossible > 0 ? ((totalScored / totalPossible) * 100).toFixed(2) : 0;
  const performanceEmoji = getPerformanceEmoji(overallPercentage);

  let message = "🎓 *ACADEMIC MARKS DASHBOARD*\n\n";
  message += `${performanceEmoji} *Overall: ${overallPercentage}%*\n`;
  message += `🏆 *Total Score:* ${totalScored}/${totalPossible}\n`;
  message += `📚 *Enrolled Courses:* ${coursesCount}\n`;
  message += `📝 *Completed Tests:* ${completedTestsCount}\n\n`;
  message += `Select a view below for more details:`;

  const courseTypes = new Set(marksData.marks.map(course => course.courseType || "Other"));
  
  let keyboard = {
    inline_keyboard: [
      [
        { text: "📊 Summary", callback_data: "marks_summary" },
        { text: "📋 All Courses", callback_data: "marks_all" }
      ]
    ]
  };
  
  let row = [];
  courseTypes.forEach(type => {
    if (row.length === 2) {
      keyboard.inline_keyboard.push(row);
      row = [];
    }
    row.push({ text: `📚 ${type} Courses`, callback_data: `marks_type_${type}` });
  });
  
  if (row.length > 0) {
    keyboard.inline_keyboard.push(row);
  }

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

async function handleMarksCallback(ctx) {
  const userId = ctx.from.id;
  const callbackData = ctx.callbackQuery.data;
  
  try {
    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error answering callback query:", error.message);
  }
  
  const cachedData = marksCache.get(userId);
  if (!cachedData) {
    return ctx.reply("Your session has expired. Please fetch marks data again.");
  }
  
  const { data: marksData, messageId } = cachedData;
  
  try {
    if (callbackData === "marks_summary") {
      await showMarksSummary(ctx, marksData, messageId);
    } else if (callbackData === "marks_all") {
      await showAllCourses(ctx, marksData, messageId);
    } else if (callbackData === "marks_overview") {
      await showMarksOverview(ctx, marksData, messageId);
    } else if (callbackData.startsWith("marks_type_")) {
      const courseType = callbackData.replace("marks_type_", "");
      await showCoursesByType(ctx, marksData, messageId, courseType);
    }
  } catch (error) {
    logger.error("Marks callback handling error:", error.message);
    
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        "❌ An error occurred. Please try again.",
        { 
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Back to Overview", callback_data: "marks_overview" }]
            ]
          }
        }
      );
    } catch (e) {
      ctx.reply("❌ An error occurred while processing your request. Please try again.");
    }
  }
}

async function showMarksSummary(ctx, marksData, messageId) {
  const coursesByType = groupCoursesByType(marksData.marks);
  
  let message = "📊 *MARKS SUMMARY*\n\n";
  
  for (const type in coursesByType) {
    let typeTotal = 0;
    let typeScored = 0;
    let coursesWithMarks = 0;
    
    for (const course of coursesByType[type]) {
      if (course.overall && parseFloat(course.overall.total) > 0) {
        typeScored += parseFloat(course.overall.scored);
        typeTotal += parseFloat(course.overall.total);
        coursesWithMarks++;
      }
    }
    
    const typePercentage = typeTotal > 0 ? ((typeScored / typeTotal) * 100).toFixed(2) : 0;
    const typeEmoji = getPerformanceEmoji(typePercentage);
    
    message += `*${type} Courses* (${coursesByType[type].length})\n`;
    message += `${typeEmoji} Overall: *${typePercentage}%* (${typeScored}/${typeTotal})\n`;
    message += `✅ Courses with marks: ${coursesWithMarks}/${coursesByType[type].length}\n\n`;
  }
  
  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "marks_overview" }]
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

async function showAllCourses(ctx, marksData, messageId) {
  let message = "📋 *ALL COURSES MARKS*\n\n";
  
  const coursesByType = groupCoursesByType(marksData.marks);

  for (const type in coursesByType) {
    message += `📚 *${type.toUpperCase()} COURSES*\n\n`;

    for (const course of coursesByType[type]) {
      message += formatCourseDetails(course);
    }
  }
  
  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "marks_overview" }]
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

async function showCoursesByType(ctx, marksData, messageId, courseType) {
  const filteredCourses = marksData.marks.filter(
    course => (course.courseType || "Other") === courseType
  );
  
  let message = `📚 *${courseType.toUpperCase()} COURSES*\n\n`;
  
  let totalScored = 0;
  let totalPossible = 0;
  
  for (const course of filteredCourses) {
    if (course.overall) {
      totalScored += parseFloat(course.overall.scored || 0);
      totalPossible += parseFloat(course.overall.total || 0);
    }
    message += formatCourseDetails(course);
  }
  
  const typePercentage = totalPossible > 0 ? ((totalScored / totalPossible) * 100).toFixed(2) : 0;
  const typeEmoji = getPerformanceEmoji(typePercentage);
  
  message = `📚 *${courseType.toUpperCase()} COURSES*\n` +
    `${typeEmoji} *Overall: ${typePercentage}%* (${totalScored}/${totalPossible})\n` +
    `📊 *Courses: ${filteredCourses.length}*\n\n` + message;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: "◀️ Back to Overview", callback_data: "marks_overview" }]
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

function groupCoursesByType(courses) {
  const coursesByType = {};

  for (const course of courses) {
    const type = course.courseType || "Other";
    if (!coursesByType[type]) coursesByType[type] = [];
    coursesByType[type].push(course);
  }

  return coursesByType;
}

function formatCourseDetails(course) {
  let courseMessage = `📚 *${course.courseName}*\n`;

  if (
    course.overall &&
    (parseFloat(course.overall.scored) > 0 ||
      parseFloat(course.overall.total) > 0)
  ) {
    const overallTotal = parseFloat(course.overall.total);
    const overallScored = parseFloat(course.overall.scored);
    const coursePercentage =
      overallTotal > 0 ? ((overallScored / overallTotal) * 100).toFixed(1) : 0;

    const courseEmoji = getPerformanceEmoji(coursePercentage);
    courseMessage += `${courseEmoji} *Overall:* ${course.overall.scored}/${course.overall.total} (${coursePercentage}%)\n`;
  }

  if (course.testPerformance?.length > 0) {
    courseMessage += formatTestPerformances(course.testPerformance);
  } else if (
    !course.overall ||
    (parseFloat(course.overall.scored) === 0 &&
      parseFloat(course.overall.total) === 0)
  ) {
    courseMessage += `❔ No marks available yet\n`;
  }

  return courseMessage + `\n`;
}

function formatTestPerformances(testPerformances) {
  let testMessage = `✏️ *Tests:*\n`;

  for (const test of testPerformances) {
    const testTotal = parseFloat(test.marks.total);
    const testScored = parseFloat(test.marks.scored);
    const testPercentage =
      testTotal > 0 ? ((testScored / testTotal) * 100).toFixed(1) : 0;

    const testEmoji = getPerformanceEmoji(testPercentage, true);
    testMessage += `╰┈➤ ${testEmoji} ${test.test}: ${test.marks.scored}/${test.marks.total}\n`;
  }

  return testMessage;
}

function getPerformanceEmoji(percentage, isTest = false) {
  if (isTest && percentage === 0) return "❔";
  if (percentage >= 90) return "✅";
  if (percentage >= 75) return "✳️";
  if (percentage >= 60) return "⚠️";
  return "❌";
}

module.exports = {
  handleMarks,
  handleMarksCallback
};