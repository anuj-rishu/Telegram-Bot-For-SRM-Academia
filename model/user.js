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
  },
  {
    timestamps: true,
    bufferCommands: false,
    minimize: false,
  }
);

UserSchema.virtual("notifiedSeatsSet").get(function () {

  if (
    !this._notifiedSeatsSet ||
    this._notifiedSeatsSetSource !== this.notifiedSeats
  ) {
    this._notifiedSeatsSet = new Set(this.notifiedSeats || []);
    this._notifiedSeatsSetSource = this.notifiedSeats;
  }
  return this._notifiedSeatsSet;
});

UserSchema.index({ lastMarksUpdate: 1, lastAttendanceUpdate: 1 });

module.exports = mongoose.model("User", UserSchema);
