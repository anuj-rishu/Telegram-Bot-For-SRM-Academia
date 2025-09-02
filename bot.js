const { Telegraf, Scenes, session } = require("telegraf");
const config = require("./config/config");
const logger = require("./utils/logger");

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

const { requireLogin } = require("./middlewares/ authMiddleware");


//controllers
const authController = require("./controllers/authController");
const attendanceController = require("./controllers/attendanceController");
const marksController = require("./controllers/marksController");
const coursesController = require("./controllers/coursesController");
const userController = require("./controllers/userController");
const timetableController = require("./controllers/timetableController");
const lostItemController = require("./controllers/lostItemController");
const taskController = require("./controllers/taskController");
const documentController = require("./controllers/documentController");
const timetablePdfController = require("./controllers/timetablePdfController");
const attendancePdfController = require("./controllers/attendancePdfController");
const calendarController = require("./controllers/calendarController");

//services
const NotificationService = require("./notification/timetable");
const MarksNotificationService = require("./notification/marksUpdate");
const AttendanceNotificationService = require("./notification/attendanceUpdate");
const scheduleAttendancePdf = require("./notification/attendancePdfScheduler");

//scenes
const loginScene = require("./scenes/loginScene");
const lostItemScene = require("./scenes/lostItemScene");
const taskScene = require("./scenes/taskScene");
const uploadDocumentScene = require("./scenes/uploadDocumentScene");

const CustomMessageService = require("./services/customMessageService");

global.botInstance = bot;

const originalSendMessage = bot.telegram.sendMessage.bind(bot.telegram);
bot.telegram.sendMessage = async (chatId, text, options = {}) => {
  try {
    return await originalSendMessage(chatId, text, options);
  } catch (error) {
    logger.error(`Failed to send message to chat ${chatId}: ${error.message}`);
  }
};

const stage = new Scenes.Stage([
  loginScene,
  taskScene,
  lostItemScene,
  uploadDocumentScene,
]);

bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
  ctx.replyWithMarkdown(
    "Welcome to the SRM Academia Bot! 🎓\n\n" +
      "Easily access your SRM academic data with this bot.\n\n" +
      "Use the commands from ☱ MENU to navigate.\n" +
      "To get started, type /login.\n\n" +
      "*Powered by SRM INSIDER COMMUNITY (SIC)*\n\n" +
      "🧑‍💻 Developed by Anuj Rishu Tiwari\n" +
      "[GitHub](https://github.com/anuj-rishu)\n" +
      "[LinkedIn](https://linkedin.com/in/anuj-rishu)\n"
  );
});

new MarksNotificationService(bot);
new AttendanceNotificationService(bot);
taskController.initTaskService(bot);
new NotificationService(bot);
scheduleAttendancePdf(bot);

bot.command(
  "timetablepdf",
  requireLogin,
  timetablePdfController.handleTimetablePdf
);
bot.command(
  "attendancepdf",
  requireLogin,
  attendancePdfController.handleAttendancePdf
);

bot.command("login", (ctx) => ctx.scene.enter("login"));
bot.command("logout", requireLogin, authController.handleLogout);

const messageService = new CustomMessageService(bot);
bot.messageService = messageService;

bot.command("attendance", requireLogin, attendanceController.handleAttendance);
bot.action(
  /^attendance_.*$/,
  requireLogin,
  attendanceController.handleAttendanceCallback
);
bot.command("courses", requireLogin, coursesController.handleCourses);
bot.action(
  /^courses_.*$/,
  requireLogin,
  coursesController.handleCoursesCallback
);

bot.command("timetable", requireLogin, timetableController.handleTimetable);
bot.action(
  /^timetable_.*$/,
  requireLogin,
  timetableController.handleTimetableCallback
);
bot.command("marks", requireLogin, marksController.handleMarks);
bot.action(/^marks_.*$/, requireLogin, marksController.handleMarksCallback);
bot.command("user", requireLogin, userController.handleUserInfo);
bot.command("todaysclass", timetableController.handleTodaysClass);
bot.command("tomorrowclass", timetableController.handleTomorrowClass);
bot.command("dayafterclass", timetableController.handleDayAfterClass);
bot.command("calendar", requireLogin, calendarController.handleCalendar);
bot.action(/^cal_.*$/, requireLogin, calendarController.handleCalendarCallback);

bot.command(
  "reportlost",
  requireLogin,
  lostItemController.handleReportLostItem
);
bot.command("finditem", async (ctx) => {
  try {
    await ctx.reply(
      "🔍 *Find Lost Items*\n\n" +
        "Click the link below to search through all reported lost items:\n\n" +
        "🌐 [SRM Lost & Found Portal](https://srm-lost-found.vercel.app)",
      {
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }
    );
  } catch (error) {
    logger.error("Error in finditem command:", error);
    await ctx.reply("Sorry, something went wrong. Please try again later.");
  }
});

bot.command("addtask", requireLogin, (ctx) => ctx.scene.enter("task"));
bot.command("tasks", requireLogin, taskController.handleTasksList);
bot.command("complete", requireLogin, taskController.handleCompleteTask);
bot.command(
  "deletetasks",
  requireLogin,
  taskController.handleDeleteMultipleTasks
);
bot.action(
  /complete_task:.*|delete_multiple|selection:.*|confirm_multiple_selection|cancel_multiple_selection|confirm_delete_selected/,
  requireLogin,
  taskController.handleTaskCallbacks
);

bot.command("uploaddoc", requireLogin, documentController.handleUploadDocument);
bot.command("mydocs", requireLogin, documentController.handleGetDocuments);
bot.action(/^send_doc:(.+)$/, requireLogin, (ctx) => {
  const documentId = ctx.match[1];
  return documentController.handleSendDocument(ctx, documentId);
});

bot.help((ctx) => {
  ctx.reply(
    "SRM ACADEMIA BOT Commands:\n\n" +
      "/login - Login to your SRM account\n" +
      "/attendance - Check your attendance\n" +
      "/attendancepdf - Get your attendance report in detail\n" +
      "/marks - Check your marks\n" +
      "/timetable - Get your timetable\n" +
      "/calender - Get simplified calendar\n" +
      "/timetablepdf - Get timetable in PDF\n" +
      "/todaysclass - Get Todays Class\n" +
      "/tomorrowclass - Get Tomorrows Class\n" +
      "/dayafterclass  - Get Day After Tomorrows Class\n" +
      "/user - Get user information\n" +
      "/courses - List enrolled courses\n" +
      "/uploaddoc - To upload documents\n" +
      "/mydocs - Get uploaded docs \n" +
      "/reportlost - Report Lost Item\n" +
      "/finditem - Find Lost Item\n" +
      "/addtask - Create a new task with reminder\n" +
      "/tasks - View your tasks\n" +
      "/complete - Mark a task as complete\n" +
      "/deletetasks - Delete multiple tasks\n" +
      "/logout - Log out from your account\n" +
      "/help - Show this help message"
  );
});

bot.catch((err, ctx) => {
  logger.error(`Bot error: ${err.message}`);
  ctx.reply("An error occurred. Please try again later.");
});

module.exports = bot;