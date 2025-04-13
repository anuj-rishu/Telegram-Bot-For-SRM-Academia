const mongoose = require("mongoose");


const TaskSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      index: true,
    },
    taskName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    reminderMinutes: {
      type: Number,
      default: 5,
    },
    isCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

TaskSchema.index({ telegramId: 1, isCompleted: 1, dueDate: 1 });

module.exports = mongoose.model("Task", TaskSchema);
