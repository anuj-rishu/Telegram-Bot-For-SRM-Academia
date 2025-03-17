const mongoose = require("mongoose");

const NotificationTrackingSchema = new mongoose.Schema({
  notificationId: {
    type: String,
    required: true,
    unique: true,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model(
  "NotificationTracking",
  NotificationTrackingSchema
);
