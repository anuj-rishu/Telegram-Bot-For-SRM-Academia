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
const NotificationService = require("./notification/timetable");
const MarksNotificationService = require("./notification/marksUpdate");
const AttendanceNotificationService = require("./notification/attendanceUpdate");

//task notifiaction
const taskScene = require("./scenes/taskScene");
const taskController = require("./controllers/taskController");
const TaskNotificationService = require("./notification/taskNotification");

const CustomMessageService = require("./services/customMessageService");

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

const stage = new Scenes.Stage([loginScene, taskScene]);

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
      "[LinkedIn](https://linkedin.com/in/anuj-rishu)"
  );
});

// Login command
bot.command("login", (ctx) => ctx.scene.enter("login"));

// Notification services
new NotificationService(bot);
new MarksNotificationService(bot);
new AttendanceNotificationService(bot);
new TaskNotificationService(bot);

// Logout command
bot.command("logout", requireLogin, authController.handleLogout);

//custom message
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

// Calendar command
bot.command("calendar", requireLogin, calendarController.handleCalendar);

bot.command("marks", requireLogin, marksController.handleMarks);

//task messages
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

// Help command
bot.help((ctx) => {
  ctx.reply(
    "SRM ACADEMIA BOT Commands:\n\n" +
      "/login - Login to your SRM account\n" +
      "/attendance - Check your attendance\n" +
      "/marks - Check your marks\n" +
      "/timetable - Get your weekly timetable\n" +
      "/todaysclass - Get Todays Class\n" +
      "/dayorder - Check today's day order and classes\n" +
      "/user - Get user information\n" +
      "/courses - List enrolled courses\n" +
      "/addtask - Create a new task with reminder\n" +
      "/tasks - View your tasks\n" +
      "/complete - Mark a task as complete\n" +
      "/deletetasks - Delete multiple tasks\n" +
      "/logout - Log out from your account\n" +
      "/help - Show this help message"
  );
});

bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply("An error occurred. Please try again later.");
});

module.exports = bot;
