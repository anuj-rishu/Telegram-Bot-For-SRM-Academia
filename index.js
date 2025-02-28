require('dotenv').config();
const bot = require('./bot');

// Start the bot
bot.launch()
  .then(() => console.log('Bot started successfully!'))
  .catch(err => console.error('Error starting bot:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));