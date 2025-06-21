require("dotenv").config();
const bot = require("./bot");
const connectDB = require("./config/db");
const sessionManager = require("./utils/sessionManager");
const logger = require("./utils/logger");

const express = require("express");
const app = express();
const PORT = process.env.PORT || 9000;

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(PORT, () => {
  logger.info(`HTTP server listening on port ${PORT}`);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

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
    logger.info(`Memory usage: ${memoryUsed.toFixed(2)} MB`);
  }
}, 60000);

async function startBot() {
  try {
    await connectDB();
    global.botInstance = bot;
    await sessionManager.initializeSessions();
    logger.info("Sessions initialized");
    sessionManager.startPeriodicValidation(240); // 4 hours

    bot.launch().catch((err) => {
      logger.error(`Bot launch error: ${err.message}`);
      process.exit(1);
    });

    logger.info("Bot launched successfully");

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (err) {
    logger.error(`Failed to start bot: ${err.message}`);
    process.exit(1);
  }
}

startBot();
