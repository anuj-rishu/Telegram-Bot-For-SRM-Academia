const User = require("../model/user");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

class MarksNotificationService {
  constructor(bot) {
    this.bot = bot;
    this.checkMarksUpdates();

    setInterval(() => this.checkMarksUpdates(), 60 * 1000);
  }

  async checkMarksUpdates() {
    try {
      const users = await User.find({
        token: { $exists: true },
        marks: { $exists: true },
      });

      for (const user of users) {
        const session = sessionManager.getSession(user.telegramId);
        if (!session) continue;

        const response = await apiService.makeAuthenticatedRequest(
          "/marks",
          session
        );
        const newMarksData = response.data;

        if (!newMarksData?.marks) continue;

        const updatedCourses = this.compareMarks(user.marks, newMarksData);

        if (updatedCourses.length > 0) {
          console.log(`Marks updated for user ${user.telegramId}`);
          await this.sendMarksUpdateNotification(
            user.telegramId,
            updatedCourses
          );

          await User.findByIdAndUpdate(user._id, {
            marks: newMarksData,
            lastMarksUpdate: new Date(),
          });
        }
      }
    } catch (error) {
      console.error("Error in marks update check:", error);
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
    } catch (error) {
      console.error("Failed to send marks notification:", error);
    }
  }
}

module.exports = MarksNotificationService;
