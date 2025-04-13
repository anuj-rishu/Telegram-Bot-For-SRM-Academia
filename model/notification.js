const mongoose = require("mongoose");

const NotificationTrackingSchema = new mongoose.Schema(
  {
    notificationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

module.exports = mongoose.model(
  "NotificationTracking",
  NotificationTrackingSchema
);
