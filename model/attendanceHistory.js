const mongoose = require("mongoose");

const attendanceHistorySchema = new mongoose.Schema({
  telegramId: { type: String, required: true },
  courseTitle: { type: String, required: true },
  category: { type: String },
  date: { type: Date, required: true },
  hoursConducted: { type: Number, required: true },
  hoursAbsent: { type: Number, required: true },
  hoursPresent: { type: Number, required: true },
  wasPresent: { type: Boolean, required: true },
  attendancePercentage: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AttendanceHistory", attendanceHistorySchema);
