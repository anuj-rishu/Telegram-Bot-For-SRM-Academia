const User = require("../model/user");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

class MarksNotificationService {
  constructor(bot) {
    this.bot = bot;
    this.notifiedUpdates = new Map();
    console.log("✅ Marks notification service initialized");
    
    this.loadNotifiedUpdatesFromDB();
    
    setTimeout(() => this.checkMarksUpdates(), 10000);
    setInterval(() => this.checkMarksUpdates(), 60 * 1000);
    
    setInterval(() => this.cleanupOldNotifications(), 6 * 60 * 60 * 1000);
  }

  async loadNotifiedUpdatesFromDB() {
    try {
      console.log("Loading notified marks updates from database...");
      const users = await User.find({
        notifiedMarksUpdates: { $exists: true },
      });

      for (const user of users) {
        if (
          user.notifiedMarksUpdates &&
          Array.isArray(user.notifiedMarksUpdates)
        ) {
          user.notifiedMarksUpdates.forEach((update) => {
            if (update && update.id && update.timestamp) {
              this.notifiedUpdates.set(update.id, update.timestamp);
            }
          });
        }
      }

      console.log(
        `Loaded ${this.notifiedUpdates.size} previously notified marks updates`
      );
    } catch (error) {
      console.error("Error loading notified marks updates from database:", error);
    }
  }

  async checkMarksUpdates() {
    try {
      console.log("🔄 Checking for marks updates...");
      const users = await User.find({
        token: { $exists: true },
        marks: { $exists: true },
      });

      console.log(`Found ${users.length} users with marks data`);

      for (const user of users) {
        console.log(`Processing marks for user ${user.telegramId}`);
        const session = sessionManager.getSession(user.telegramId);
        if (!session) {
          console.log(`No active session found for user ${user.telegramId}`);
          continue;
        }

        const response = await apiService.makeAuthenticatedRequest(
          "/marks",
          session
        );
        const newMarksData = response.data;

        if (!newMarksData?.marks) {
          console.log(
            `No marks data in API response for user ${user.telegramId}`
          );
          continue;
        }

        console.log(`Comparing marks data for user ${user.telegramId}`);
        const updatedCourses = this.compareMarks(user.marks, newMarksData);
        console.log(
          `Found ${updatedCourses.length} updated courses for user ${user.telegramId}`
        );

        if (updatedCourses.length > 0) {
          const newUpdates = this.filterAlreadyNotifiedUpdates(
            user.telegramId,
            updatedCourses
          );

          if (newUpdates.length > 0) {
            console.log(
              `Sending marks notification to user ${user.telegramId} for ${newUpdates.length} new changes`
            );
            await this.sendMarksUpdateNotification(
              user.telegramId,
              newUpdates
            );

            this.markUpdatesAsNotified(user.telegramId, newUpdates);

            await this.saveNotifiedUpdatesToDB(user.telegramId, newUpdates);
          } else {
            console.log(
              `All updates for user ${user.telegramId} already notified, skipping notification`
            );
          }

          await User.findByIdAndUpdate(user._id, {
            marks: newMarksData,
            lastMarksUpdate: new Date(),
          });
          console.log(
            `Updated marks data in database for user ${user.telegramId}`
          );
        }
      }
    } catch (error) {
      console.error("Error in marks update check:", error);
    }
  }

  generateUpdateIdentifier(telegramId, update) {
    let detailsString;
    if (update.type === "test") {
      detailsString = `${update.courseName}-${update.testName}-${update.new.scored}-${update.new.total}`;
    } else {
      detailsString = `${update.courseName}-${update.type}-${update.new.scored}-${update.new.total}`;
    }
    return `${telegramId}:${detailsString}`;
  }

  filterAlreadyNotifiedUpdates(telegramId, updates) {
    return updates.filter((update) => {
      const updateId = this.generateUpdateIdentifier(telegramId, update);
      return !this.notifiedUpdates.has(updateId);
    });
  }

  markUpdatesAsNotified(telegramId, updates) {
    updates.forEach((update) => {
      const updateId = this.generateUpdateIdentifier(telegramId, update);
      this.notifiedUpdates.set(updateId, Date.now());
    });
  }

  async saveNotifiedUpdatesToDB(telegramId, newUpdates) {
    try {
      const user = await User.findOne({ telegramId });
      if (!user) return;

      const notifiedUpdates = user.notifiedMarksUpdates || [];

      newUpdates.forEach((update) => {
        const updateId = this.generateUpdateIdentifier(telegramId, update);
        notifiedUpdates.push({
          id: updateId,
          timestamp: Date.now(),
          courseName: update.courseName,
          type: update.type,
          testName: update.testName || null,
        });
      });

      const MAX_STORED_UPDATES = 100;
      const updatesToStore = notifiedUpdates.slice(-MAX_STORED_UPDATES);

      await User.findByIdAndUpdate(user._id, {
        notifiedMarksUpdates: updatesToStore,
      });

      console.log(
        `Saved ${newUpdates.length} notified marks updates to database for user ${telegramId}`
      );
    } catch (error) {
      console.error(
        `Error saving notified marks updates to database for user ${telegramId}:`,
        error
      );
    }
  }

  compareMarks(oldMarks, newMarks) {
    const updatedCourses = [];

    if (!oldMarks?.marks || !newMarks?.marks) return updatedCourses;

    newMarks.marks.forEach((newCourse) => {
      const oldCourse = oldMarks.marks.find(
        (c) => c.courseName === newCourse.courseName
      );

      if (!oldCourse) {
        if (this.hasValidMarks(newCourse.overall)) {
          updatedCourses.push({
            courseName: newCourse.courseName,
            type: "new_course",
            new: newCourse.overall,
            old: null,
          });
        }
        return;
      }

      if (
        this.hasValidMarks(newCourse.overall) &&
        this.hasValidMarks(oldCourse.overall)
      ) {
        if (this.marksChanged(newCourse.overall, oldCourse.overall)) {
          updatedCourses.push({
            courseName: newCourse.courseName,
            type: "overall",
            new: newCourse.overall,
            old: oldCourse.overall,
          });
        }
      }

      if (newCourse.testPerformance) {
        newCourse.testPerformance.forEach((newTest) => {
          const oldTest = oldCourse.testPerformance?.find(
            (t) => t.test === newTest.test
          );

          if (!oldTest || this.marksChanged(newTest.marks, oldTest.marks)) {
            updatedCourses.push({
              courseName: newCourse.courseName,
              type: "test",
              testName: newTest.test,
              new: newTest.marks,
              old: oldTest?.marks || null,
            });
          }
        });
      }
    });

    return updatedCourses;
  }

  hasValidMarks(marks) {
    return marks && parseFloat(marks.total) > 0;
  }

  marksChanged(newMarks, oldMarks) {
    return (
      newMarks.scored !== oldMarks.scored || newMarks.total !== oldMarks.total
    );
  }

  calculatePercentage(scored, total) {
    return ((parseFloat(scored) / parseFloat(total)) * 100).toFixed(1);
  }

  getPerformanceEmoji(percentage) {
    if (percentage >= 90) return "✅";
    if (percentage >= 75) return "✳️";
    if (percentage >= 60) return "⚠️";
    return "❌";
  }

  async sendMarksUpdateNotification(telegramId, updatedCourses) {
    let message = "🔔 *Marks Update Alert!*\n\n";

    updatedCourses.forEach((update) => {
      message += `📚 *${update.courseName}*\n`;

      if (update.type === "test") {
        const newPercentage = this.calculatePercentage(
          update.new.scored,
          update.new.total
        );
        const emoji = this.getPerformanceEmoji(newPercentage);

        message += `Test: ${update.testName}\n`;
        message += `${emoji} New marks: ${update.new.scored}/${update.new.total} (${newPercentage}%)\n`;

        if (update.old) {
          const oldPercentage = this.calculatePercentage(
            update.old.scored,
            update.old.total
          );
          message += `Previous marks: ${update.old.scored}/${update.old.total} (${oldPercentage}%)\n`;
        }
      } else {
        const newPercentage = this.calculatePercentage(
          update.new.scored,
          update.new.total
        );
        const emoji = this.getPerformanceEmoji(newPercentage);

        message += `${emoji} New overall: ${update.new.scored}/${update.new.total} (${newPercentage}%)\n`;

        if (update.old) {
          const oldPercentage = this.calculatePercentage(
            update.old.scored,
            update.old.total
          );
          message += `Previous overall: ${update.old.scored}/${update.old.total} (${oldPercentage}%)\n`;
        }
      }
      message += `\n`;
    });

    try {
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: "Markdown",
        disable_notification: false,
      });
      console.log(`✅ Successfully sent marks notification to user ${telegramId}`);
    } catch (error) {
      console.error(`❌ Failed to send marks notification:`, error);
    }
  }

  cleanupOldNotifications() {
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const [updateId, timestamp] of this.notifiedUpdates.entries()) {
      if (now - timestamp > ONE_DAY) {
        this.notifiedUpdates.delete(updateId);
      }
    }
    console.log("Cleaned up old marks notifications");
  }
}

module.exports = MarksNotificationService;