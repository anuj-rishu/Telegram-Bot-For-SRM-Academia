const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
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
      type: Object,
      default: null,
    },
    attendance: {
      type: Object,
      default: null,
    },
    userInfo: {
      type: Object,
      default: null,
    },

    notifiedAttendanceUpdates: {
      type: [String],
      default: [],
    },
    lastAttendanceUpdate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
