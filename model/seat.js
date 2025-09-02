const mongoose = require("mongoose");

const SeatSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      ref: "User"
    },
    regNumber: String,
    notifiedSeats: {
      type: [String],
      default: [],
    },
    seatHashes: {
      type: Map,
      of: String,
      default: {},
    },
    lastSeatUpdate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    bufferCommands: false,
  }
);

SeatSchema.index({ telegramId: 1 }, { unique: true });
SeatSchema.index({ regNumber: 1 });

module.exports = mongoose.model("Seat", SeatSchema);