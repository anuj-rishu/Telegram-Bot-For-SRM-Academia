const { Telegraf, Scenes, session } = require("telegraf");
const config = require("./config/config");
const logger = require("./utils/logger");

// Initialization of  bot
const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

//middlewares
const { requireLogin } = require("./middlewares/ authMiddleware");

//controllers
const authController = require("./controllers/authController");
const attendanceController = require("./controllers/attendanceController");
const marksController = require("./controllers/marksController");
const coursesController = require("./controllers/coursesController");
const userController = require("./controllers/userController");
const timetableController = require("./controllers/timetableController");
const {
  handleCalendar,
  handleCalendarCallback,
} = require("./controllers/calendarController");
const lostItemController = require("./controllers/lostItemController");
const taskController = require("./controllers/taskController");
const documentController = require("./controllers/documentController");
const timetablePdfController = require("./controllers/timetablePdfController");
const attendancePdfController = require("./controllers/attendancePdfController");
const calendarController = require('./controllers/calendarController');

//notification service
const NotificationService = require("./notification/timetable");
const MarksNotificationService = require("./notification/marksUpdate");
const AttendanceNotificationService = require("./notification/attendanceUpdate");
const scheduleAttendancePdf = require("./notification/attendancePdfScheduler");

//scenes
const loginScene = require("./scenes/loginScene");
const lostItemScene = require("./scenes/lostItemScene");
const taskScene = require("./scenes/taskScene");
const uploadDocumentScene = require("./scenes/uploadDocumentScene");

//services
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

//scenes initialization
const stage = new Scenes.Stage([
  loginScene,
  taskScene,
  lostItemScene,
  uploadDocumentScene,
]);

// Middleware initialization
bot.use(session());
bot.use(stage.middleware());

//bot starts
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

//  Notification services
new MarksNotificationService(bot);
new AttendanceNotificationService(bot);
taskController.initTaskService(bot);
new NotificationService(bot);
scheduleAttendancePdf(bot);
// new SeatFinderService(bot);


//pdf services
bot.command(
  "timetablepdf",
  requireLogin,
  timetablePdfController.handleTimetablePdf
);
bot.command("attendancepdf", requireLogin, attendancePdfController.handleAttendancePdf);


//Authentication service
bot.command("login", (ctx) => ctx.scene.enter("login"));
bot.command("logout", requireLogin, authController.handleLogout);

// Custom message service
const messageService = new CustomMessageService(bot);
bot.messageService = messageService;

//Academic commands
bot.command("attendance", requireLogin, attendanceController.handleAttendance);
bot.command("courses", requireLogin, coursesController.handleCourses);
bot.command("timetable", requireLogin, timetableController.handleTimetable);
bot.command("marks", requireLogin, marksController.handleMarks);
bot.command("user", requireLogin, userController.handleUserInfo);
bot.command("todaysclass", timetableController.handleTodaysClass);
bot.command("tomorrowclass", timetableController.handleTomorrowClass);
bot.command("dayafterclass", timetableController.handleDayAfterClass);
bot.command("calendar", requireLogin, calendarController.handleCalendar);
bot.action(/^cal_.*$/, requireLogin, calendarController.handleCalendarCallback);
//lost and found command
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

//task command
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

//vault service commands
bot.command("uploaddoc", requireLogin, documentController.handleUploadDocument);
bot.command("mydocs", requireLogin, documentController.handleGetDocuments);
bot.action(/^send_doc:(.+)$/, requireLogin, (ctx) => {
  const documentId = ctx.match[1];
  return documentController.handleSendDocument(ctx, documentId);
});

// Help command
bot.help((ctx) => {
  ctx.reply(
    "SRM ACADEMIA BOT Commands:\n\n" +
      "/login - Login to your SRM account\n" +
      "/attendance - Check your attendance\n" +
      "/attendancepdf - Get your attendance report in detail\n" +
      "/marks - Check your marks\n" +
      "/timetable - Get your timetable\n" +
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
