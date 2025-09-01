const axios = require("axios");
const objectHash = require("object-hash");
const User = require("../model/user");
const Seat = require("../model/seat");
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

    try {
      if (mongoose.connection.readyState !== 1) {
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      const users = await User.find({
        regNumber: { $exists: true, $ne: null },
      }).lean();

      if (users.length === 0) {
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      for (const user of users) {
        let seatRecord = await Seat.findOne({ telegramId: user.telegramId });
        if (!seatRecord) {
          seatRecord = new Seat({
            telegramId: user.telegramId,
            regNumber: user.regNumber,
            notifiedSeats: [],
            seatHashes: {}
          });
          await seatRecord.save();
        } else if (seatRecord.regNumber !== user.regNumber) {
          seatRecord.regNumber = user.regNumber;
          await seatRecord.save();
        }
      }

      const seatRecords = await Seat.find({
        regNumber: { $exists: true, $ne: null }
      });

      const datesToCheck = this.getDateRange();

      if (datesToCheck.length === 0) {
        this.isProcessing = false;
        setTimeout(() => this.checkSeatsForAllUsers(), this.checkInterval);
        return;
      }

      let index = 0;
      const total = seatRecords.length;

      const processBatch = async () => {
        const seatBatch = seatRecords.slice(index, index + this.batchSize);

        for (const seat of seatBatch) {
          for (const dateStr of datesToCheck) {
            try {
              await this.checkSeatForUserOnDate(seat, dateStr);
            } catch (error) {}
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
      return dates;
    }

    const day = tomorrow.getDate().toString().padStart(2, "0");
    const month = (tomorrow.getMonth() + 1).toString().padStart(2, "0");
    const year = tomorrow.getFullYear();
    dates.push(`${day}/${month}/${year}`);

    return dates;
  }

  async checkSeatForUserOnDate(seat, dateStr) {
    if (!seat.regNumber) return { seatFound: false };
    const result = {
      seatFound: false,
      notificationSent: false,
      alreadyNotified: false,
    };

    try {
      const response = await axios.post(this.apiUrl, {
        date: dateStr,
        registerNumber: seat.regNumber,
      });

      if (response.data && response.data.success && response.data.seatDetails) {
        const seatDetails = response.data.seatDetails;
        result.seatFound = true;

        const seatHash = objectHash(seatDetails);

        const lastHash = seat.seatHashes?.get?.(dateStr);

        if (lastHash === seatHash) {
          result.alreadyNotified = true;
          return result;
        }

        await this.sendSeatNotification(seat.telegramId, seatDetails);

        const seatId = [
          seat.regNumber.trim().toLowerCase(),
          dateStr.trim(),
          (seatDetails.venue || "").trim().toLowerCase(),
          (seatDetails.roomInfo || "").trim().toLowerCase(),
        ].join(":");

        await Seat.updateOne(
          { _id: seat._id },
          {
            $addToSet: { notifiedSeats: seatId },
            $set: { 
              [`seatHashes.${dateStr}`]: seatHash,
              lastSeatUpdate: new Date() 
            },
          }
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

      const result = await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });

      return result;
    } catch (error) {}
  }
}

module.exports = SeatFinderService;