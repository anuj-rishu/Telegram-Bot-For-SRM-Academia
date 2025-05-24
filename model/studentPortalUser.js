const mongoose = require("mongoose");

const studentPortalUserSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },

  hallTicketNotified: {
    type: Boolean,
    default: false,
  },
  hallTicketSentDate: {
    type: Date,
    default: null,
  },
});

module.exports = mongoose.model("StudentPortalUser", studentPortalUserSchema);
