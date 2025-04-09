require("dotenv").config();
const bot = require("./bot");
const connectDB = require("./config/db");
const sessionManager = require("./utils/sessionManager");

process.on("unhandledRejection", (reason, promise) => {
  console.error("🔴 Unhandled Rejection:", reason);
});

async function startBot() {
  try {
    await connectDB();

    await sessionManager.initializeSessions();

    // Start the bot
    await bot.launch();
    console.log("✅ Bot started successfully!");
  } catch (err) {
    console.error("❌ Error starting bot:", err);
    process.exit(1);
  }
}

// Start the bot
startBot();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
