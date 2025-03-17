const User = require("../model/user");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

class AttendanceNotificationService {
  constructor(bot) {
    this.bot = bot;
    this.notifiedUpdates = new Map();
    console.log("✅ Attendance notification service initialized");

    this.loadNotifiedUpdatesFromDB();

    setTimeout(() => this.checkAttendanceUpdates(), 10000);
    setInterval(() => this.checkAttendanceUpdates(), 60 * 1000);

    setInterval(() => this.cleanupOldNotifications(), 6 * 60 * 60 * 1000);
  }

  async loadNotifiedUpdatesFromDB() {
    try {
      console.log("Loading notified updates from database...");
      const users = await User.find({
        notifiedAttendanceUpdates: { $exists: true },
      });

      for (const user of users) {
        if (
          user.notifiedAttendanceUpdates &&
          Array.isArray(user.notifiedAttendanceUpdates)
        ) {
          user.notifiedAttendanceUpdates.forEach((update) => {
            if (update && update.id && update.timestamp) {
              this.notifiedUpdates.set(update.id, update.timestamp);
            }
          });
        }
      }

      console.log(
        `Loaded ${this.notifiedUpdates.size} previously notified updates`
      );
    } catch (error) {
      console.error("Error loading notified updates from database:", error);
    }
  }

  async checkAttendanceUpdates() {
    try {
      console.log("🔄 Checking for attendance updates...");
      const users = await User.find({
        token: { $exists: true },
        attendance: { $exists: true },
      });

      console.log(`Found ${users.length} users with attendance data`);

      for (const user of users) {
        console.log(`Processing attendance for user ${user.telegramId}`);
        const session = sessionManager.getSession(user.telegramId);
        if (!session) {
          console.log(`No active session found for user ${user.telegramId}`);
          continue;
        }

        const response = await apiService.makeAuthenticatedRequest(
          "/attendance",
          session
        );
        const newAttendanceData = response.data;

        if (!newAttendanceData?.attendance) {
          console.log(
            `No attendance data in API response for user ${user.telegramId}`
          );
          continue;
        }

        console.log(`Comparing attendance data for user ${user.telegramId}`);
        const updatedCourses = this.compareAttendance(
          user.attendance,
          newAttendanceData
        );
        console.log(
          `Found ${updatedCourses.length} updated courses for user ${user.telegramId}`
        );

        if (updatedCourses.length > 0) {
          const hasRealChanges = this.hasSignificantChanges(updatedCourses);

          if (hasRealChanges) {
            const newUpdates = this.filterAlreadyNotifiedUpdates(
              user.telegramId,
              updatedCourses
            );

            if (newUpdates.length > 0) {
              console.log(
                `Sending attendance notification to user ${user.telegramId} for ${newUpdates.length} new changes`
              );
              await this.sendAttendanceUpdateNotification(
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
          } else {
            console.log(
              `No significant changes for user ${user.telegramId}, skipping notification`
            );
          }

          await User.findByIdAndUpdate(user._id, {
            attendance: newAttendanceData,
            lastAttendanceUpdate: new Date(),
          });
          console.log(
            `Updated attendance data in database for user ${user.telegramId}`
          );
        }
      }
    } catch (error) {
      console.error("Error in attendance update check:", error);
    }
  }

  async saveNotifiedUpdatesToDB(telegramId, newUpdates) {
    try {
      const user = await User.findOne({ telegramId });
      if (!user) return;

      const notifiedUpdates = user.notifiedAttendanceUpdates || [];

      newUpdates.forEach((update) => {
        const updateId = this.generateUpdateIdentifier(
          telegramId,
          update.new,
          update.type
        );
        notifiedUpdates.push({
          id: updateId,
          timestamp: Date.now(),
          courseTitle: update.new.courseTitle,
          category: update.new.category,
          type: update.type,
        });
      });

      const MAX_STORED_UPDATES = 100;
      const updatesToStore = notifiedUpdates.slice(-MAX_STORED_UPDATES);

      await User.findByIdAndUpdate(user._id, {
        notifiedAttendanceUpdates: updatesToStore,
      });

      console.log(
        `Saved ${newUpdates.length} notified updates to database for user ${telegramId}`
      );
    } catch (error) {
      console.error(
        `Error saving notified updates to database for user ${telegramId}:`,
        error
      );
    }
  }

  generateUpdateIdentifier(telegramId, course, type) {
    const courseDetails = `${course.courseTitle}-${course.category}-${course.hoursConducted}-${course.hoursAbsent}`;
    return `${telegramId}:${courseDetails}:${type}`;
  }

  filterAlreadyNotifiedUpdates(telegramId, updates) {
    return updates.filter((update) => {
      const updateId = this.generateUpdateIdentifier(
        telegramId,
        update.new,
        update.type
      );

      return !this.notifiedUpdates.has(updateId);
    });
  }

  markUpdatesAsNotified(telegramId, updates) {
    updates.forEach((update) => {
      const updateId = this.generateUpdateIdentifier(
        telegramId,
        update.new,
        update.type
      );

      this.notifiedUpdates.set(updateId, Date.now());
    });
  }

  compareAttendance(oldData, newData) {
    const updatedCourses = [];

    if (!oldData?.attendance || !newData?.attendance) return updatedCourses;

    newData.attendance.forEach((newCourse) => {
      const oldCourse = oldData.attendance.find(
        (c) => c.courseTitle === newCourse.courseTitle && c.category === newCourse.category
      );

      if (!oldCourse) {
        if (this.hasValidAttendance(newCourse)) {
          updatedCourses.push({
            courseName: newCourse.courseTitle,
            type: "new_course",
            new: newCourse,
            old: null,
          });
        }
        return;
      }

      if (this.attendanceChanged(newCourse, oldCourse)) {
        updatedCourses.push({
          courseName: newCourse.courseTitle,
          type: "update",
          new: newCourse,
          old: oldCourse,
        });
      }
    });

    return updatedCourses;
  }

  hasSignificantChanges(updatedCourses) {
    if (updatedCourses.some((course) => course.type === "new_course")) {
      return true;
    }

    return updatedCourses.some((update) => {
      if (!update.old) return true;

      const oldHoursConducted = parseInt(update.old.hoursConducted);
      const newHoursConducted = parseInt(update.new.hoursConducted);
      const oldHoursAbsent = parseInt(update.old.hoursAbsent);
      const newHoursAbsent = parseInt(update.new.hoursAbsent);

      return (
        newHoursConducted !== oldHoursConducted ||
        newHoursAbsent !== oldHoursAbsent
      );
    });
  }

  hasValidAttendance(course) {
    return course && parseInt(course.hoursConducted) > 0;
  }

  attendanceChanged(newCourse, oldCourse) {
    return (
      parseInt(newCourse.hoursConducted) !==
        parseInt(oldCourse.hoursConducted) ||
      parseInt(newCourse.hoursAbsent) !== parseInt(oldCourse.hoursAbsent)
    );
  }

  calculatePercentage(present, total) {
    return ((present / total) * 100).toFixed(1);
  }

  getAttendanceEmoji(percentage) {
    if (percentage >= 75) return "✅";
    if (percentage >= 65) return "⚠️";
    return "❌";
  }

  async sendAttendanceUpdateNotification(telegramId, updatedCourses) {
    const coursesWithChanges = updatedCourses.filter((update) => {
      if (!update.old) return true;

      const oldHoursConducted = parseInt(update.old.hoursConducted);
      const newHoursConducted = parseInt(update.new.hoursConducted);
      const oldHoursAbsent = parseInt(update.old.hoursAbsent);
      const newHoursAbsent = parseInt(update.new.hoursAbsent);

      return (
        newHoursConducted !== oldHoursConducted ||
        newHoursAbsent !== oldHoursAbsent
      );
    });

    if (coursesWithChanges.length === 0) {
      console.log(
        `No courses with actual changes for user ${telegramId}, skipping notification`
      );
      return;
    }

    let message = "🔔 *Attendance Update Alert!*\n\n";

    coursesWithChanges.forEach((update) => {
      const hoursConducted = parseInt(update.new.hoursConducted);
      const hoursAbsent = parseInt(update.new.hoursAbsent);
      const hoursPresent = hoursConducted - hoursAbsent;
      const newPercentage = parseFloat(update.new.attendancePercentage);
      const emoji = this.getAttendanceEmoji(newPercentage);

      message += `📚 *${update.courseName || update.new.courseTitle}* (${update.new.category})\n`;
      message += `${emoji} Current: ${hoursPresent}/${hoursConducted} (${newPercentage}%)\n`;

      if (update.old) {
        const oldHoursConducted = parseInt(update.old.hoursConducted);
        const oldHoursAbsent = parseInt(update.old.hoursAbsent);
        const oldHoursPresent = oldHoursConducted - oldHoursAbsent;
        const oldPercentage = parseFloat(update.old.attendancePercentage);

        message += `Previous: ${oldHoursPresent}/${oldHoursConducted} (${oldPercentage}%)\n`;

        const newClasses = hoursConducted - oldHoursConducted;
        const newAbsences = hoursAbsent - oldHoursAbsent;
        const attendedNew = newClasses - newAbsences;

        if (newClasses > 0) {
          message += `New classes: ${newClasses}\n`;
          message += `Attended: ${attendedNew}/${newClasses}\n`;
        }
      }

      message += "\n";
    });

    try {
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: "Markdown",
        disable_notification: false,
      });
      console.log(
        `✅ Successfully sent attendance notification to user ${telegramId}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to send attendance notification to user ${telegramId}:`,
        error
      );
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
  }
}

module.exports = AttendanceNotificationService;