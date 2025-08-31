const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(
      ({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`
    )
  ),
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

process.on("uncaughtException", (err) =>
  logger.error(`Uncaught Exception: ${err.stack || err}`)
);
process.on("unhandledRejection", (reason) =>
  logger.error(`Unhandled Rejection: ${reason}`)
);

module.exports = logger;
