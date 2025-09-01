const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      ref: "User",
    },
    attendance: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    attendanceHash: {
      type: String,
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
  },
  {
    timestamps: true,
    bufferCommands: false,
  }
);

AttendanceSchema.index({ telegramId: 1 }, { unique: true });
AttendanceSchema.index({ lastAttendanceUpdate: 1 });

module.exports = mongoose.model("Attendance", AttendanceSchema);
