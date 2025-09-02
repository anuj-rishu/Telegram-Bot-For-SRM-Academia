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
    userInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    bufferCommands: false,
  }
);

module.exports = mongoose.model("User", UserSchema);
