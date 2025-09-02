const logger = require("./logger");
const os = require("os");

let pidusage;
try {
  pidusage = require("pidusage");
} catch (e) {
  pidusage = null;
}

class MemoryMonitor {
  constructor() {
    this.memoryUsageLog = 0;
    this.monitorInterval = null;
  }

  async startMonitoring(intervalMs = 60000, thresholdMB = 20) {
    this.monitorInterval = setInterval(async () => {
      try {
        const memoryUsed = process.memoryUsage().heapUsed / 1024 / 1024;
        
        if (Math.abs(memoryUsed - this.memoryUsageLog) > thresholdMB) {
          this.memoryUsageLog = memoryUsed;
        }
      } catch (error) {
        logger.error(`Memory monitoring error: ${error.message}`);
      }
    }, intervalMs);
  }

  async getServerMemoryUsage() {
    try {
      const processMemory = process.memoryUsage();
      
      return {
        heapUsed: {
          value_MB: (processMemory.heapUsed / 1024 / 1024).toFixed(2),
          description: "Active memory used by JavaScript objects and variables"
        },
        heapTotal: {
          value_MB: (processMemory.heapTotal / 1024 / 1024).toFixed(2),
          description: "Total heap memory allocated by V8 engine"
        },
        rss: {
          value_MB: (processMemory.rss / 1024 / 1024).toFixed(2),
          description: "Total physical RAM used by server process (most important metric)"
        },
        external: {
          value_MB: (processMemory.external / 1024 / 1024).toFixed(2),
          description: "Memory used by C++ objects and native modules"
        },
        arrayBuffers: {
          value_MB: (processMemory.arrayBuffers / 1024 / 1024).toFixed(2),
          description: "Memory used by ArrayBuffer objects for binary data"
        }
      };
    } catch (error) {
      logger.error(`Failed to get server memory usage: ${error.message}`);
      return { error: error.message };
    }
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
}

module.exports = new MemoryMonitor();