const pino = require("pino");

const logger = pino({
  level: "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
});

process.on("uncaughtException", (err) =>
  logger.error(`Uncaught Exception: ${err.stack || err}`)
);
process.on("unhandledRejection", (reason) =>
  logger.error(`Unhandled Rejection: ${reason}`)
);

module.exports = logger;