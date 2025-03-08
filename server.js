require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const connectDB = require('./config/db');
const sessionManager = require('./utils/sessionManager');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

app.use(bot.webhookCallback('/webhook'));

async function startBot() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Initialize sessions from database
    await sessionManager.initializeSessions()
    
    // Start the bot
    await bot.launch();
    console.log('✅ Bot started successfully!');
  } catch (err) {
    console.error('❌ Error starting bot:', err);
    process.exit(1);
  }
}

// Start the bot
startBot();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Export the bot as a handler for Vercel
module.exports = app;