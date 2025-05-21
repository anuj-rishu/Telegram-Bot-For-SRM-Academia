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
      logger.info("Seat check already in progress, skipping this run");
      return;
    }

    this.isProcessing = true;
    logger.info("Starting seat check process");

    try {
      if (mongoose.connection.readyState !== 1) {
        logger.info("Database not connected, will retry later");
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      const users = await User.find({
        regNumber: { $exists: true, $ne: null },
      });

      if (users.length === 0) {
        logger.info("No users with registration numbers found");
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      logger.info(`Checking seats for ${users.length} users`);
      const datesToCheck = this.getDateRange();
      logger.info(`Checking dates: ${datesToCheck.join(", ")}`);

      let index = 0;
      const total = users.length;

      const processBatch = async () => {
        const userBatch = users.slice(index, index + this.batchSize);
        const batchNumber = Math.floor(index / this.batchSize) + 1;
        const totalBatches = Math.ceil(total / this.batchSize);

        logger.info(
          `Processing batch ${batchNumber} of ${totalBatches} with ${userBatch.length} users`
        );

        let seatsFound = 0;
        let notificationsSkipped = 0;
        let notificationsSent = 0;

        await Promise.allSettled(
          userBatch.map(async (user) => {
            const userName = user.name || "Unknown";

            const notifiedSet =
              user.notifiedSeatsSet || new Set(user.notifiedSeats || []);
            logger.info(
              `Checking seats for user: ${userName} (${user.regNumber})`
            );
            for (const dateStr of datesToCheck) {
              try {
                const result = await this.checkSeatForUserOnDate(
                  user,
                  dateStr,
                  notifiedSet
                );
                if (result.seatFound) {
                  seatsFound++;
                  if (result.notificationSent) {
                    notificationsSent++;
                  } else if (result.alreadyNotified) {
                    notificationsSkipped++;
                  }
                }
              } catch (error) {
                logger.info(
                  `Error checking seat for ${userName} on ${dateStr}`
                );
              }
              await this.sleep(this.apiDelay);
            }
          })
        );

        logger.info(
          `Batch ${batchNumber} results: ${seatsFound} seats found, ${notificationsSent} notifications sent, ${notificationsSkipped} skipped (already notified)`
        );

        index += this.batchSize;

        if (index < total) {
          logger.info(
            `Completed batch ${batchNumber}/${totalBatches}, waiting before processing next batch`
          );
          setTimeout(processBatch, this.batchDelay);
        } else {
          logger.info("All batches completed successfully");
          this.isProcessing = false;
          setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        }
      };

      processBatch();
    } catch (error) {
      logger.info("Error occurred during seat check process");
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
      logger.info(`Checking only next day: ${day}/${month}/${year}`);
    }

    return dates;
  }

  async checkSeatForUserOnDate(user, dateStr, notifiedSet) {
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

        if (notifiedSet && notifiedSet.has(seatId)) {
          result.alreadyNotified = true;
          return result;
        }

        await this.sendSeatNotification(user.telegramId, seatDetails);

        // Use $addToSet to avoid duplicates
        await User.updateOne(
          { _id: user._id },
          { $addToSet: { notifiedSeats: seatId } }
        );

        result.notificationSent = true;
      }
    } catch (error) {}

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

      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    } catch (error) {}
  }
}

module.exports = SeatFinderService;
