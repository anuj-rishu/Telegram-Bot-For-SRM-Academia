require("dotenv").config();
const bot = require("./bot");
const connectDB = require("./config/db");
const sessionManager = require("./utils/sessionManager");
const winston = require("winston");

const logger = winston.createLogger({
  level: "error",
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console({
      silent: true,
    }),
  ],
});

process.on("unhandledRejection", (reason, promise) => {});

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

async function startBot() {
  try {
    await connectDB();
    await sessionManager.initializeSessions();
    await bot.launch();

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (err) {
    process.exit(1);
  }
}

startBot();
