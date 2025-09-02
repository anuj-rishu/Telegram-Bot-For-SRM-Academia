const mongoose = require("mongoose");

const InactiveUserSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
    },
    token: String,
    regNumber: String,
    name: String,
    email: String,
    department: String,
    school: String,
    program: String,
    semester: String,
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    marks: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    attendance: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    userInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    notifiedMarksUpdates: {
      type: [String],
      default: [],
    },
    lastMarksUpdate: {
      type: Date,
      default: null,
    },
    notifiedAttendanceUpdates: {
      type: [
        {
          id: String,
          timestamp: Number,
          courseTitle: String,
          category: String,
          type: String,
        },
      ],
      default: [],
    },
    lastAttendanceUpdate: {
      type: Date,
      default: null,
    },
    notifiedSeats: {
      type: [String],
      default: [],
    },
    seatHashes: {
      type: Map,
      of: String,
      default: {},
    },
    deactivatedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      enum: ["token_expired", "session_deleted", "no_token"],
      default: "no_token",
    },
  },
  {
    timestamps: true,
    bufferCommands: false,
  }
);

InactiveUserSchema.index({ lastMarksUpdate: 1, lastAttendanceUpdate: 1 });
InactiveUserSchema.index({ deactivatedAt: 1 });

module.exports = mongoose.model("InactiveUser", InactiveUserSchema);
