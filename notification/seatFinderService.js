const axios = require('axios');
const User = require('../model/user');
const winston = require('winston');
const mongoose = require('mongoose');
const config = require('../config/config');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
  ),
  transports: [new winston.transports.Console()],
});

class SeatFinderService {
  constructor(bot) {
    this.bot = bot;
    this.apiUrl = config.SEAT_FINDER_API_URL;
    this.startDate = new Date('2025-05-16');
    this.endDate = new Date('2025-06-10');
    this.checkInterval = 5 * 60 * 1000;
    this.batchSize = 10;
    this.batchDelay = 5000;
    this.apiDelay = 500;
    this.isProcessing = false;
    this.initService();
  }

  async initService() {
    if (mongoose.connection.readyState !== 1) {
      mongoose.connection.once('connected', () => {
        this.startSeatCheck();
      });
    } else {
      this.startSeatCheck();
    }
  }

  async startSeatCheck() {
    this.checkSeatsForAllUsers();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkSeatsForAllUsers() {
    if (this.isProcessing) {
      logger.info('Seat check already in progress, skipping this run');
      return;
    }

    this.isProcessing = true;
    logger.info('Starting seat check process');

    try {
      if (mongoose.connection.readyState !== 1) {
        logger.info('Database not connected, will retry later');
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      const users = await User.find({
        regNumber: { $exists: true, $ne: null }
      });

      if (users.length === 0) {
        logger.info('No users with registration numbers found');
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      logger.info(`Checking seats for ${users.length} users`);
      const datesToCheck = this.getDateRange();
      let index = 0;
      const total = users.length;

      const processBatch = async () => {
        const userBatch = users.slice(index, index + this.batchSize);
        const batchNumber = Math.floor(index / this.batchSize) + 1;
        const userNames = userBatch.map(u => `${u.name || 'Unknown'} (${u.regNumber})`).join(', ');
        
        logger.info(`Processing batch ${batchNumber} of ${Math.ceil(total / this.batchSize)} with users: ${userNames}`);
        
        for (const user of userBatch) {
          for (const dateStr of datesToCheck) {
            await this.checkSeatForUserOnDate(user, dateStr);
            await this.sleep(this.apiDelay);
          }
        }
        
        index += this.batchSize;
        
        if (index < total) {
          logger.info(`Completed batch ${batchNumber}, waiting before processing next batch`);
          setTimeout(processBatch, this.batchDelay);
        } else {
          logger.info('All batches completed successfully');
          this.isProcessing = false;
          setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        }
      };
      
      processBatch();
    } catch (error) {
      logger.info('Error occurred during seat check process');
      this.isProcessing = false;
      setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
    }
  }

  getDateRange() {
    const dates = [];
    const now = new Date();
    let currentDate = new Date(Math.max(now, this.startDate));

    while (currentDate <= this.endDate) {
      const day = currentDate.getDate().toString().padStart(2, '0');
      const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const year = currentDate.getFullYear();
      dates.push(`${day}/${month}/${year}`);

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }

  async checkSeatForUserOnDate(user, dateStr) {
    if (!user.regNumber) return;

    try {
      const response = await axios.post(this.apiUrl, {
        date: dateStr,
        registerNumber: user.regNumber
      });

      if (response.data && response.data.success && response.data.seatDetails) {
        const seatDetails = response.data.seatDetails;
        const seatId = [
          user.regNumber.trim().toLowerCase(),
          dateStr.trim(),
          (seatDetails.venue || '').trim().toLowerCase(),
          (seatDetails.roomInfo || '').trim().toLowerCase()
        ].join(':');

        if (user.notifiedSeats && user.notifiedSeats.includes(seatId)) {
          return;
        }

        const userName = user.name || 'Unknown';
        logger.info(`Seat found for user [${userName}] with reg# ${user.regNumber} on ${dateStr} at ${seatDetails.venue} room ${seatDetails.roomInfo}`);
        await this.sendSeatNotification(user.telegramId, seatDetails);

        await User.updateOne(
          { _id: user._id },
          { $addToSet: { notifiedSeats: seatId } }
        );
        
        logger.info(`User [${userName}] (${user.regNumber}) notified about seat allocation at ${seatDetails.venue}`);
      }
    } catch (error) {
      // Error handling without logging
    }
  }

  async sendSeatNotification(telegramId, seatDetails) {
    try {
      const message = [
        `🎓 *Exam Seat Allocation Found!* 🎓`,
        `\nYour exam seat has been allocated:`,
        `\n🏫 *Venue:* ${seatDetails.venue.toUpperCase()}`,
        `⏰ *Session:* ${seatDetails.session === 'FN' ? 'Morning' : 'Afternoon'}`,
        `🪑 *Seat Number:* ${seatDetails.seatNo}`,
        `📝 *Register Number:* ${seatDetails.registerNumber}`,
        `\n📍 *Location:* ${seatDetails.roomInfo}`
      ].join('\n');

      const result = await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

      logger.info(`Notification sent successfully to user ${seatDetails.registerNumber} (Telegram ID: ${telegramId})`);
      return result;
    } catch (error) {
      // Error handling without logging
    }
  }
}

module.exports = SeatFinderService;