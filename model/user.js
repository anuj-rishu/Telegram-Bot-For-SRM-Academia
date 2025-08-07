const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
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
    attendanceHash: {
      type: String,
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
  },
  {
    timestamps: true,
    bufferCommands: false,
  }
);

UserSchema.index({ lastMarksUpdate: 1, lastAttendanceUpdate: 1 });

module.exports = mongoose.model("User", UserSchema);