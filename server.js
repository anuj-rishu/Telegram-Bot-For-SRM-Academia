require("dotenv").config();
const cluster = require("cluster");
const os = require("os");
const bot = require("./bot");
const connectDB = require("./config/db");
const sessionManager = require("./utils/sessionManager");
const winston = require("winston");

const numCPUs = os.cpus().length;

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

if (cluster.isMaster) {
  async function startBot() {
    try {
      await connectDB();
      await sessionManager.initializeSessions();
      await bot.launch();

      process.once("SIGINT", () => bot.stop("SIGINT"));
      process.once("SIGTERM", () => bot.stop("SIGTERM"));

      if (process.env.NODE_ENV !== "production") {
        console.log("Bot started in master process");
      }
    } catch (err) {
      process.exit(1);
    }
  }

  startBot();

  for (let i = 0; i < numCPUs - 1; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    if (worker.process.pid !== process.pid) {
      cluster.fork();
    }
  });

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `Master process running with ${numCPUs - 1} workers for background tasks`
    );
  }
} else {
  async function startWorker() {
    try {
      await connectDB();

      if (process.env.NODE_ENV !== "production") {
        console.log(`Worker ${process.pid} started for background processing`);
      }
    } catch (err) {
      process.exit(1);
    }
  }

  startWorker();
}
