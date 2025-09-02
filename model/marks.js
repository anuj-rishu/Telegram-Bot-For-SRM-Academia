const mongoose = require("mongoose");

const MarksSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      ref: "User",
    },
    marks: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    marksHash: {
      type: String,
      default: null,
    },
    notifiedMarksUpdates: {
      type: [
        {
          id: String,
          timestamp: Number,
          courseName: String,
          type: String,
          testName: String,
        },
      ],
      default: [],
    },
    lastMarksUpdate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    bufferCommands: false,
  }
);

MarksSchema.index({ telegramId: 1 }, { unique: true });
MarksSchema.index({ lastMarksUpdate: 1 });

module.exports = mongoose.model("Marks", MarksSchema);
