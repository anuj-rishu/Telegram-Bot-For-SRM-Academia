const pino = require("pino");

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
  level: process.env.LOG_LEVEL || "info",
});

logger.api = function (method, endpoint, status, responseTime) {
  this.info(
    `API ${method.toUpperCase()} ${endpoint} - Status: ${status} - ${responseTime}ms`
  );
};

logger.userActivity = function (userId, activity) {
  this.info(`User ${userId}: ${activity}`);
};

process.on("uncaughtException", (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  logger.error(error.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection at Promise. Reason: ${reason}`);
});

module.exports = logger;
