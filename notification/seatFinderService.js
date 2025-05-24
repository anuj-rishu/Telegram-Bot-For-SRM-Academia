const axios = require("axios");
const User = require("../model/user");
// const logger = require("../utils/logger"); // Removed for production
const mongoose = require("mongoose");
const config = require("../config/config");

class SeatFinderService {
  constructor(bot) {
    this.bot = bot;
    this.apiUrl = config.SEAT_FINDER_API_URL;
    this.startDate = new Date("2025-05-16");
    this.endDate = new Date("2025-06-10");
    this.checkInterval = 5 * 60 * 1000;
    this.batchSize = 10;
    this.batchDelay = 5000;
    this.apiDelay = 500;
    this.isProcessing = false;
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

  async checkSeatsForAllUsers() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    // logger.info("Starting seat check process");

    try {
      if (mongoose.connection.readyState !== 1) {
        // logger.error("Database not connected, will retry later");
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      const users = await User.find({
        regNumber: { $exists: true, $ne: null },
      });

      if (users.length === 0) {
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      const datesToCheck = this.getDateRange();

      if (datesToCheck.length === 0) {
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      let index = 0;
      const total = users.length;

      const processBatch = async () => {
        const userBatch = users.slice(index, index + this.batchSize);
        // const batchNumber = Math.floor(index / this.batchSize) + 1;
        // const totalBatches = Math.ceil(total / this.batchSize);

        // let seatsFound = 0;
        // let notificationsSent = 0;

        for (const user of userBatch) {
          for (const dateStr of datesToCheck) {
            try {
              const result = await this.checkSeatForUserOnDate(user, dateStr);
              // if (result.seatFound && result.notificationSent) {
              //   seatsFound++;
              //   notificationsSent++;
              // }
            } catch (error) {
              // logger.error(
              //   `Error checking seat for ${user.regNumber} on ${dateStr}: ${error.message}`
              // );
            }
            await this.sleep(this.apiDelay);
          }
        }

        // if (seatsFound > 0) {
        //   logger.info(
        //     `Batch ${batchNumber}: ${seatsFound} seats found, ${notificationsSent} notifications sent`
        //   );
        // }

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
      // logger.error(`Error during seat check process: ${error.message}`);
      this.isProcessing = false;
      setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
    }
  }

  getDateRange() {
    const dates = [];
    const now = new Date();

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (tomorrow > this.endDate) {
      // logger.info("Tomorrow is beyond the exam period end date");
      return dates;
    }

    const day = tomorrow.getDate().toString().padStart(2, "0");
    const month = (tomorrow.getMonth() + 1).toString().padStart(2, "0");
    const year = tomorrow.getFullYear();
    dates.push(`${day}/${month}/${year}`);

    // logger.info(`Checking seats only for tomorrow: ${day}/${month}/${year}`);
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

        // const userName = user.name || "Unknown";
        // logger.info(
        //   `🔔 NEW SEAT found for user [${userName}] (${user.regNumber}) on ${dateStr}`
        // );
        await this.sendSeatNotification(user.telegramId, seatDetails);

        await User.updateOne(
          { _id: user._id },
          { $addToSet: { notifiedSeats: seatId } }
        );

        result.notificationSent = true;
      }
    } catch (error) {
      // logger.error(
      //   `API error for ${user.regNumber} on ${dateStr}: ${error.message}`
      // );
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

      return result;
    } catch (error) {
      // logger.error(
      //   `Failed to send notification to Telegram ID ${telegramId}: ${error.message}`
      // );
    }
  }
}

module.exports = SeatFinderService;