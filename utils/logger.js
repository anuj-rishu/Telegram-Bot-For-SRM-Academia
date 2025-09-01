const winston = require('winston');

const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level}: ${message}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports: [
    new winston.transports.Console()
  ],
  exitOnError: false
});

logger.api = function(method, endpoint, status, responseTime) {
  this.info(`API ${method.toUpperCase()} ${endpoint} - Status: ${status} - ${responseTime}ms`);
};

logger.userActivity = function(userId, activity) {
  this.info(`User ${userId}: ${activity}`);
};

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  logger.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at Promise. Reason: ${reason}`);
});

module.exports = logger;