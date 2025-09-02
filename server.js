require("dotenv").config();
const bot = require("./bot");
const connectDB = require("./config/db");
const sessionManager = require("./utils/sessionManager");
const logger = require("./utils/logger");
const memoryMonitor = require("./utils/memoryMonitor");
const express = require("express");
const config = require("./config/config");
const path = require("path");
const indexRoutes = require("./routes/index");
const webhookRoutes = require("./routes/webhook");
const monitoringRoutes = require("./routes/monitoring");

const app = express();
const PORT = config.PORT;
const WEBHOOK_PATH = `/webhook`;
const WEBHOOK_URL = `${config.WEBHOOK_URL}${WEBHOOK_PATH}`;

app.use(express.json());
app.use(express.static(path.join(__dirname, "TelebotWebsite")));

app.use("/", indexRoutes);
app.use(WEBHOOK_PATH, webhookRoutes);
app.use("/monitoring", monitoringRoutes);

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

memoryMonitor.startMonitoring(60000, 20);

async function startBot() {
  try {
    await connectDB();
    global.botInstance = bot;
    await sessionManager.initializeSessions();
    sessionManager.startPeriodicValidation(240);

    await bot.telegram.setWebhook(WEBHOOK_URL, {
      drop_pending_updates: true,
    });
    logger.info('Webhook: Connected');

    app.listen(PORT, () => {
      logger.info('Bot: Running');
    });

    process.once("SIGINT", () => {
      memoryMonitor.stop();
      bot.telegram.deleteWebhook();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      memoryMonitor.stop();
      bot.telegram.deleteWebhook();
      process.exit(0);
    });
  } catch (err) {
    logger.error(`Failed to start bot: ${err.message}`);
    process.exit(1);
  }
}

startBot();
