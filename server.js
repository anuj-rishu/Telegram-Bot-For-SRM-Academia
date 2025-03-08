require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bot = require('./bot');
const connectDB = require('./config/db');
const sessionManager = require('./utils/sessionManager');

const app = express();
app.use(bodyParser.json());

async function startBot() {
  try {
    // Connect to MongoDB
    await connectDB(process.env.MONGODB_URI);
    
    // Initialize sessions from database
    await sessionManager.initializeSessions();
    
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

// Handle incoming webhook requests
app.post('/webhook', (req, res) => {
  try {
    bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Error handling webhook request:', err);
    console.error(err.stack); // Log the stack trace for debugging
    res.status(500).send('Internal Server Error');
  }
});

// Export the bot as a handler for Vercel
module.exports = app;