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

// Initialize bot with token
const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// Create scene manager
const stage = new Scenes.Stage([loginScene]);

// Register middleware
bot.use(session());
bot.use(stage.middleware());

// Start command
bot.start((ctx) => {
  ctx.reply(
    "Welcome to the SRM Scraper bot! 🎓\n\n" +
      "This bot helps you access your SRM data.\n\n" +
      "Available commands:\n" +
      "/login - Login to your SRM account\n" +
      "/attendance - Check your attendance\n" +
      "/marks - Check your marks\n" +
      "/timetable - Get your timetable\n" +
      "/dayorder - Get today's classes\n" +
      "/user - Get user information\n" +
      "/courses - List enrolled courses\n" +
      "/calendar - Get academic calendar\n" +
      "/logout - Log out from your account\n\n" +
      "To get started, use /login"
  );
});

// Login command
bot.command("login", (ctx) => ctx.scene.enter("login"));
new NotificationService(bot);

// Logout command
bot.command("logout", requireLogin, authController.handleLogout);

// Debug command
bot.command("debug", requireLogin, authController.handleDebug);

// Attendance command
bot.command("attendance", requireLogin, attendanceController.handleAttendance);

// Courses command
bot.command("courses", requireLogin, coursesController.handleCourses);

// User info command
bot.command("user", requireLogin, userController.handleUserInfo);

// Timetable commands
bot.command("timetable", requireLogin, timetableController.handleTimetable);
bot.command(
  "TodaysClass",
  requireLogin,
  timetableController.handleTodayTimetable
);

// Calendar command
bot.command("calendar", requireLogin, calendarController.handleCalendar);

bot.command("marks", requireLogin, marksController.handleMarks);

// Help command
bot.help((ctx) => {
  ctx.reply(
    "SRM Scraper Bot Commands:\n\n" +
      "/login - Login to your SRM account\n" +
      "/attendance - Check your attendance\n" +
      "/marks - Check your marks\n" +
      "/timetable - Get your weekly timetable\n" +
      "/dayorder - Check today's day order and classes\n" +
      "/user - Get user information\n" +
      "/courses - List enrolled courses\n" +
      "/calendar - Get academic calendar\n" +
      "/debug - Show authentication info\n" +
      "/logout - Log out from your account\n" +
      "/help - Show this help message"
  );
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply("An error occurred. Please try again later.");
});

module.exports = bot;
