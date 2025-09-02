const express = require('express');
const router = express.Router();
const memoryMonitor = require('../utils/memoryMonitor');

router.get('/memory', async (req, res) => {
  try {
    const serverMemory = await memoryMonitor.getServerMemoryUsage();
    
    const heapUsed = parseFloat(serverMemory.heapUsed.value_MB);
    const heapTotal = parseFloat(serverMemory.heapTotal.value_MB);
    const rss = parseFloat(serverMemory.rss.value_MB);
    const external = parseFloat(serverMemory.external.value_MB);
    const arrayBuffers = parseFloat(serverMemory.arrayBuffers.value_MB);
    
    const heapUsagePercent = ((heapUsed / heapTotal) * 100).toFixed(2);
    const memoryHealth = rss < 200 ? 'Good' : rss < 500 ? 'Moderate' : 'High';
    
    res.json({
      status: 'success',
      data: {
        server_memory_usage: serverMemory,
        summary: {
          total_ram_usage: rss + " MB",
          heap_usage_percent: heapUsagePercent + "%",
          memory_health: memoryHealth,
          largest_consumer: external > arrayBuffers ? "C++ Objects" : "Array Buffers",
          note: "RSS represents actual physical RAM consumption by the server process"
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;