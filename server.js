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
      silent: true
    })
  ]
});


process.on("unhandledRejection", (reason, promise) => {
 
});

async function startBot() {
  try {

    await connectDB();

    await sessionManager.initializeSessions();


    await bot.launch();
  } catch (err) {

    process.exit(1);
  }
}


startBot();


process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));