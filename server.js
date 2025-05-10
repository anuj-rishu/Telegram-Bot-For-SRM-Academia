require("dd-trace").init({
  env: process.env.NODE_ENV || "production",
  service: "tele-bot",
  logInjection: true,
});

require("dotenv").config();
const bot = require("./bot");
const connectDB = require("./config/db");
const sessionManager = require("./utils/sessionManager");
const winston = require("winston");

// Create a logger instance
const logger = winston.createLogger({
  level: "error",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console({
      silent: false,
    }),
  ],
});

// Log unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

// Try to enable garbage collection (if available)
try {
  if (global.gc) {
    setInterval(() => {
      global.gc();
    }, 30000);
  }
} catch (e) {}

let memoryUsageLog = 0;
setInterval(() => {
  const memoryUsed = process.memoryUsage().heapUsed / 1024 / 1024;

  if (Math.abs(memoryUsed - memoryUsageLog) > 20) {
    memoryUsageLog = memoryUsed;
  }
}, 60000);

// Start the bot
async function startBot() {
  try {
    await connectDB();
    global.botInstance = bot;
    await sessionManager.initializeSessions();
    sessionManager.startPeriodicValidation(240); // 4 hours
    await bot.launch();

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (err) {
    logger.error(`Failed to start bot: ${err.message}`);
    process.exit(1);
  }
}

startBot();
