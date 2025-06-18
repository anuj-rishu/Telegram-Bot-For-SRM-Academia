const { Telegraf, Scenes, session } = require("telegraf");
const config = require("./config/config");
const { requireLogin } = require("./middlewares/ authMiddleware");
const loginScene = require("./scenes/loginScene");
const authController = require("./controllers/authController");
const attendanceController = require("./controllers/attendanceController");
const marksController = require("./controllers/marksController");
const coursesController = require("./controllers/coursesController");
const userController = require("./controllers/userController");
const timetableController = require("./controllers/timetableController");
const calendarController = require("./controllers/calendarController");
//notification service
const NotificationService = require("./notification/timetable");
const MarksNotificationService = require("./notification/marksUpdate");
const AttendanceNotificationService = require("./notification/attendanceUpdate");
//found and lost
const lostItemScene = require("./scenes/lostItemScene");
const lostItemController = require("./controllers/lostItemController");
// Task notification
const taskScene = require("./scenes/taskScene");
const taskController = require("./controllers/taskController");
const TaskNotificationService = require("./notification/taskNotification");
//custom message
const CustomMessageService = require("./services/customMessageService");
//attendance prediction
const attendancePredictionScene = require("./scenes/attendancePredictionScene");
const attendancePredictionController = require("./controllers/attendancePredictionController");
//vault service
const uploadDocumentScene = require("./scenes/uploadDocumentScene");
const documentController = require("./controllers/documentController");
//seat finder service
const SeatFinderService = require("./notification/seatFinderService");

//sp service
const loginStudentPortalScene = require("./scenes/loginStudentPortalScene");
const hallTicketController = require("./controllers/hallTicketController");
const studentPortalController = require("./controllers/studentPortalController");
const HallTicketNotificationService = require("./notification/hallTicketNotificationService");
const {
  requireStudentPortalLogin,
} = require("./middlewares/studentPortalAuthMiddleware");

const logger = require("./utils/logger");

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

global.botInstance = bot;

const originalSendMessage = bot.telegram.sendMessage.bind(bot.telegram);
bot.telegram.sendMessage = async (chatId, text, options = {}) => {
  try {
    return await originalSendMessage(chatId, text, options);
  } catch (error) {
    logger.error(`Failed to send message to chat ${chatId}: ${error.message}`);
  }
};

//scenes
const stage = new Scenes.Stage([
  loginScene,
  taskScene,
  attendancePredictionScene,
  lostItemScene,
  uploadDocumentScene,
  loginStudentPortalScene,
]);

// Middleware
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
  ctx.replyWithMarkdown(
    "Welcome to the SRM Academia Bot! 🎓\n\n" +
      "Easily access your SRM academic data with this bot.\n\n" +
      "📌 Features:\n" +
      "✅ Get real-time notifications when your marks or attendance are updated.\n" +
      "✅ Receive a reminder 5 min before your upcoming class.\n" +
      "✅ Get your scheduled classes for the day at 7 AM every morning.\n" +
      "✅ Manage tasks with custom reminders and due dates.\n\n" +
      "Use the commands from ☱ MENU to navigate.\n" +
      "To get started, type /login.\n\n" +
      "🧑‍💻 Developed by Anuj Rishu Tiwari\n" +
      "[GitHub](https://github.com/anuj-rishu)\n" +
      "[LinkedIn](https://linkedin.com/in/anuj-rishu)\n" +
      "[Instagram](https://instagram.com/anuj_rishu)"
  );
});

// Login command
bot.command("login", (ctx) => ctx.scene.enter("login"));
// Login to SP command
bot.command("loginsp", (ctx) => ctx.scene.enter("loginStudentPortal"));

//  Notification services

// new NotificationService(bot);
new MarksNotificationService(bot);
new AttendanceNotificationService(bot);
new TaskNotificationService(bot);

//hall ticket notification

// ***temp stop**
// new HallTicketNotificationService(bot);

//seat allocation

//***temp stop***
// new SeatFinderService(bot);

//attendance prediction
attendancePredictionController.initGroqService(bot);

// Logout command
bot.command("logout", requireLogin, authController.handleLogout);
// logout from sp

bot.command("logoutsp", studentPortalController.handleLogout);

// Custom message service
const messageService = new CustomMessageService(bot);
bot.messageService = messageService;

// Attendance command
bot.command("attendance", requireLogin, attendanceController.handleAttendance);

// Courses command
bot.command("courses", requireLogin, coursesController.handleCourses);

// User info command
bot.command("user", requireLogin, userController.handleUserInfo);

// Timetable commands
bot.command("timetable", requireLogin, timetableController.handleTimetable);
bot.command(
  "todaysclass",
  requireLogin,
  timetableController.handleTodayTimetable
);
bot.command(
  "tomorrowclass",
  requireLogin,
  timetableController.handleTomorrowTimetable
);
bot.command(
  "dayafterclass",
  requireLogin,
  timetableController.handleDayAfterTomorrowTimetable
);

// Calendar command
bot.command("calendar", requireLogin, calendarController.handleCalendar);

// Marks command
bot.command("marks", requireLogin, marksController.handleMarks);

// Task-related commands
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

//prediction
bot.command("checki", requireLogin, (ctx) =>
  ctx.scene.enter("attendance_prediction")
);

// report lost item
bot.command(
  "reportlost",
  requireLogin,
  lostItemController.handleReportLostItem
);

//find lost item
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

//vault service commands
bot.command("uploaddoc", requireLogin, documentController.handleUploadDocument);
bot.command("mydocs", requireLogin, documentController.handleGetDocuments);
bot.action(/^send_doc:(.+)$/, requireLogin, (ctx) => {
  const documentId = ctx.match[1];
  return documentController.handleSendDocument(ctx, documentId);
});

//hall ticket command (sp)

// hallTicketController.initialize(bot);
// **temp stop**
// bot.command(
//   "hallticket",
//   requireStudentPortalLogin,
//   hallTicketController.handleHallTicket
// );

// Help command
bot.help((ctx) => {
  ctx.reply(
    "SRM ACADEMIA BOT Commands:\n\n" +
      "/login - Login to your SRM account\n" +
      "/loginSP - Login to Student Portal\n" +
      "/checki - Chat with AI\n" +
      "/attendance - Check your attendance\n" +
      "/marks - Check your marks\n" +
      "/timetable - Get your weekly timetable\n" +
      "/todaysclass - Get Todays Class\n" +
      "/tomorrowclass - Get Tomorrows Class\n" +
      "/dayafterclass  - Get Day After Tomorrows Class\n" +
      "/user - Get user information\n" +
      "/courses - List enrolled courses\n" +
      "/hallticket - Get your hall ticket\n" +
      "/uploaddoc - To upload documents\n" +
      "/mydocs - Get uploaded docs \n" +
      "/reportlost - Report Lost Item\n" +
      "/finditem - Find Lost Item\n" +
      "/addtask - Create a new task with reminder\n" +
      "/tasks - View your tasks\n" +
      "/complete - Mark a task as complete\n" +
      "/deletetasks - Delete multiple tasks\n" +
      "/logout - Log out from your account\n" +
      "/logoutsp - Logout from Student Portal\n" +
      "/help - Show this help message"
  );
});

bot.catch((err, ctx) => {
  logger.error(`Bot error: ${err.message}`);
  ctx.reply("An error occurred. Please try again later.");
});

module.exports = bot;
