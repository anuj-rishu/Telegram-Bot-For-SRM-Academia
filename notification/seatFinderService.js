const axios = require("axios");
const User = require("../model/user");
const winston = require("winston");
const mongoose = require("mongoose");
const config = require("../config/config");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
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
    this.startDate = new Date("2025-05-16");
    this.endDate = new Date("2025-02-10");
    this.checkInterval = 5 * 60 * 1000;
    this.batchSize = 10;
    this.batchDelay = 5000;
    this.apiDelay = 500;
    this.isProcessing = false;
    this.lastCheckedDate = null;
    this.checkedUserIds = new Set();
    this.initService();
  }

  async initService() {
    if (mongoose.connection.readyState !== 1) {
      mongoose.connection.once("connected", () => {
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isNewDay() {
    const today = new Date().toDateString();
    if (this.lastCheckedDate !== today) {
      this.lastCheckedDate = today;
      this.checkedUserIds.clear();
      return true;
    }
    return false;
  }

  isSunday() {
    return new Date().getDay() === 0;
  }

  async checkSeatsForAllUsers() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      if (mongoose.connection.readyState !== 1) {
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      if (this.isSunday()) {
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      const isNewDay = this.isNewDay();

      const query = {
        regNumber: { $exists: true, $ne: null },
      };

      if (!isNewDay && this.checkedUserIds.size > 0) {
        const checkedIdsArray = Array.from(this.checkedUserIds);
        query._id = { $nin: checkedIdsArray };
      }

      const users = await User.find(query).sort({ _id: -1 });

      if (users.length === 0) {
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      const datesToCheck = this.getDateRange();

      let index = 0;
      const total = users.length;

      const processBatch = async () => {
        const userBatch = users.slice(index, index + this.batchSize);

        for (const user of userBatch) {
          this.checkedUserIds.add(user._id.toString());

          for (const dateStr of datesToCheck) {
            try {
              await this.checkSeatForUserOnDate(user, dateStr);
            } catch (error) {
              logger.error(`Error checking seat for user ${user.regNumber} on ${dateStr}: ${error.message}`);
            }
            await this.sleep(this.apiDelay);
          }
        }

        index += this.batchSize;

        if (index < total) {
          setTimeout(processBatch, this.batchDelay);
        } else {
          this.isProcessing = false;
          setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        }
      };

      processBatch();
    } catch (error) {
      logger.error(`Critical error in checkSeatsForAllUsers: ${error.message}`);
      logger.error(`Stack trace: ${error.stack}`);
      this.isProcessing = false;
      setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
    }
  }

  getDateRange() {
    const dates = [];
    const now = new Date();

    if (now > this.endDate) {
      return dates;
    }

    let today = new Date(Math.max(now, this.startDate));

    let tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (tomorrow <= this.endDate) {
      const day = tomorrow.getDate().toString().padStart(2, "0");
      const month = (tomorrow.getMonth() + 1).toString().padStart(2, "0");
      const year = tomorrow.getFullYear();
      dates.push(`${day}/${month}/${year}`);
    }

    return dates;
  }

  async checkSeatForUserOnDate(user, dateStr) {
    if (!user.regNumber) return { seatFound: false };
    const result = {
      seatFound: false,
      notificationSent: false,
      alreadyNotified: false,
    };

    try {
      const response = await axios.post(this.apiUrl, {
        date: dateStr,
        registerNumber: user.regNumber,
      });

      if (response.data && response.data.success && response.data.seatDetails) {
        const seatDetails = response.data.seatDetails;
        result.seatFound = true;

        const seatId = [
          user.regNumber.trim().toLowerCase(),
          dateStr.trim(),
          (seatDetails.venue || "").trim().toLowerCase(),
          (seatDetails.roomInfo || "").trim().toLowerCase(),
        ].join(":");

        if (user.notifiedSeats && user.notifiedSeats.includes(seatId)) {
          result.alreadyNotified = true;
          return result;
        }

        await this.sendSeatNotification(user.telegramId, seatDetails);

        await User.updateOne(
          { _id: user._id },
          { $addToSet: { notifiedSeats: seatId } }
        );

        result.notificationSent = true;
      }
    } catch (error) {
      logger.error(`API error for user ${user.regNumber} on ${dateStr}: ${error.message}`);
    }

    return result;
  }

   async sendSeatNotification(telegramId, seatDetails) {
    try {
      const message = [
        `🎓 *Exam Seat Allocation Found!* 🎓`,
        `\nYour exam seat has been allocated:`,
        `\n🏫 *Venue:* ${seatDetails.venue.toUpperCase()}`,
        `⏰ *Session:* ${
          seatDetails.session === "FN" ? "Morning" : "Afternoon"
        }`,
        `🪑 *Seat Number:* ${seatDetails.seatNo}`,
        `📝 *Register Number:* ${seatDetails.registerNumber}`,
        `\n📍 *Location:* ${seatDetails.roomInfo}`,
      ].join("\n");
  
      const result = await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
  
      // Add success log
      logger.info(`✅ SUCCESS: Notification sent to user ${seatDetails.registerNumber} (Telegram ID: ${telegramId})`);
  
      return result;
    } catch (error) {
      logger.error(`Failed to send Telegram notification to ${telegramId}: ${error.message}`);
    }
  }
 }
module.exports = SeatFinderService;