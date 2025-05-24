require("dotenv").config();
const bot = require("./bot");
const connectDB = require("./config/db");
const sessionManager = require("./utils/sessionManager");
const logger = require("./utils/logger");
const https = require('https');

// Configure memory limits based on your Heroku student tier
const MEMORY_LIMIT_MB = 450;
const RESTART_THRESHOLD_MB = 490;
const herokuAppName = process.env.HEROKU_APP_NAME || null;
const herokuApiKey = process.env.HEROKU_API_KEY || null;

process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection: ${reason}`);
  if (global.gc) global.gc(); // Force GC on errors
});

// More aggressive garbage collection
try {
  if (global.gc) {
    setInterval(() => {
      global.gc();
    }, 15000); // Run GC every 15 seconds
  }
} catch (e) {
  logger.error(`Error setting up garbage collection: ${e.message}`);
}

// Function to restart the Heroku dyno when memory exceeds threshold
function restartDyno() {
  if (!herokuAppName || !herokuApiKey) {
    logger.error('Cannot restart dyno: missing HEROKU_APP_NAME or HEROKU_API_KEY');
    return;
  }

  logger.error('Memory threshold exceeded! Triggering Heroku dyno restart...');
  
  const options = {
    hostname: 'api.heroku.com',
    path: `/apps/${herokuAppName}/dynos/worker.1/actions/restart`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.heroku+json; version=3',
      'Authorization': `Bearer ${herokuApiKey}`
    }
  };
  
  const req = https.request(options, (res) => {
    logger.error(`Restart request sent, status: ${res.statusCode}`);
  });
  
  req.on('error', (e) => {
    logger.error(`Failed to restart dyno: ${e.message}`);
  });
  
  req.end();
}

// Monitor memory usage and auto-restart if needed
let memoryUsageLog = 0;
setInterval(() => {
  const memoryUsed = process.memoryUsage().heapUsed / 1024 / 1024;

  // Force garbage collection when memory usage gets high
  if (memoryUsed > MEMORY_LIMIT_MB * 0.8 && global.gc) {
    global.gc();
    logger.error(`Forced garbage collection at ${memoryUsed.toFixed(2)} MB`);
  }
  
  // Log significant changes
  if (Math.abs(memoryUsed - memoryUsageLog) > 30) {
    memoryUsageLog = memoryUsed;
    logger.error(`Memory usage change: ${memoryUsed.toFixed(2)} MB`);
  }
  
  // Restart if memory exceeds threshold
  if (memoryUsed > RESTART_THRESHOLD_MB) {
    restartDyno();
  }
}, 30000);

async function startBot() {
  try {
    await connectDB();
    global.botInstance = bot;
    
    // Use smaller cache sizes
    await sessionManager.initializeSessions();
    sessionManager.startPeriodicValidation(120); // More frequent validation (2h)
    
    await bot.launch();

    process.once("SIGINT", () => {
      bot.stop("SIGINT");
    });

    process.once("SIGTERM", () => {
      bot.stop("SIGTERM");
    });
    
    // Periodic forced GC to prevent memory buildup
    setInterval(() => {
      if (global.gc) {
        global.gc();
        logger.error('Periodic forced garbage collection executed');
      }
    }, 900000); // Every 15 minutes
    
  } catch (err) {
    logger.error(`Failed to start bot: ${err.message}`);
    process.exit(1);
  }
}

startBot();