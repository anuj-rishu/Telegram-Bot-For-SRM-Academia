const User = require("../model/user");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const AttendanceHistory = require("../model/attendanceHistory");
const crypto = require('crypto');

class AttendanceNotificationService {
  constructor(bot) {
    this.bot = bot;
    this.notifiedUpdates = new Map();
    this.processingUsers = new Set();

    this.loadNotifiedUpdatesFromDB();
    setTimeout(() => this.migrateNotificationData(), 5000);

    setInterval(() => this.checkAttendanceUpdates(), 60 * 1000);
    setInterval(() => this.cleanupOldNotifications(), 6 * 60 * 60 * 1000);
  }

  async loadNotifiedUpdatesFromDB() {
    try {
      const users = await User.find({
        notifiedAttendanceUpdates: { $exists: true, $ne: [] },
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
    } catch (error) {}
  }

  async migrateNotificationData() {
    try {
      const users = await User.find({
        notifiedAttendanceUpdates: { $exists: true },
      });
      for (const user of users) {
        if (
          user.notifiedAttendanceUpdates.length > 0 &&
          (typeof user.notifiedAttendanceUpdates[0] === "string" ||
            !user.notifiedAttendanceUpdates[0].id)
        ) {
          await User.findByIdAndUpdate(user._id, {
            notifiedAttendanceUpdates: [],
          });
        }
      }
    } catch (error) {}
  }

  async checkAttendanceUpdates() {
    try {
      const users = await User.find({
        token: { $exists: true },
      }).lean();

      const BATCH_SIZE = 15;
      
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        
        await Promise.all(
          batch.map(async (user) => {
            if (this.processingUsers.has(user.telegramId)) return;
            this.processingUsers.add(user.telegramId);
            
            try {
              await this.checkUserAttendance(user);
            } finally {
              this.processingUsers.delete(user.telegramId);
            }
          })
        );
        
        if (i + BATCH_SIZE < users.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    } catch (error) {}
  }
  
  async checkUserAttendance(user) {
    try {
      const session = sessionManager.getSession(user.telegramId);
      if (!session) return;
      
      const response = await apiService.makeAuthenticatedRequest(
        "/attendance",
        session
      );
      
      const newAttendanceData = response.data;
      if (!newAttendanceData?.attendance) return;
      
      const newHash = this.generateAttendanceHash(newAttendanceData.attendance);
      
      if (user.attendanceHash === newHash) {
        return;
      }
      
      const updatedCourses = this.compareAttendance(
        user.attendance,
        newAttendanceData
      );
      
      if (updatedCourses.length > 0) {
        const hasRealChanges = this.hasSignificantChanges(updatedCourses);
        
        if (hasRealChanges) {
          const newUpdates = this.filterAlreadyNotifiedUpdates(
            user.telegramId,
            updatedCourses
          );
          
          if (newUpdates.length > 0) {
            await this.sendAttendanceUpdateNotification(
              user.telegramId,
              newUpdates
            );
            this.markUpdatesAsNotified(user.telegramId, newUpdates);
            await this.saveNotifiedUpdatesToDB(user.telegramId, newUpdates);
          }
        }
        
        for (const update of updatedCourses) {
          await this.saveAttendanceHistory(user.telegramId, update.new, new Date());
        }
        
        await User.findByIdAndUpdate(user._id, {
          attendance: newAttendanceData,
          attendanceHash: newHash,
          lastAttendanceUpdate: new Date(),
        });
      }
    } catch (error) {}
  }
  
  generateAttendanceHash(attendance) {
    try {
      const hashData = attendance.map(course => ({
        courseTitle: course.courseTitle,
        category: course.category,
        hoursConducted: course.hoursConducted,
        hoursAbsent: course.hoursAbsent,
        attendancePercentage: course.attendancePercentage
      }));
      
      return crypto
        .createHash('md5')
        .update(JSON.stringify(hashData))
        .digest('hex');
    } catch (error) {
      return null;
    }
  }

  async saveAttendanceHistory(telegramId, course, date = new Date()) {
    try {
      const hoursConducted = parseInt(course.hoursConducted);
      const hoursAbsent = parseInt(course.hoursAbsent);
      const hoursPresent = hoursConducted - hoursAbsent;
      const wasPresent = hoursConducted > 0 && hoursAbsent < hoursConducted;
      await AttendanceHistory.create({
        telegramId,
        courseTitle: course.courseTitle,
        category: course.category,
        date,
        hoursConducted,
        hoursAbsent,
        hoursPresent,
        wasPresent,
        attendancePercentage: parseFloat(course.attendancePercentage),
      });
    } catch (error) {}
  }

  async saveNotifiedUpdatesToDB(telegramId, newUpdates) {
    try {
      const user = await User.findOne({ telegramId });
      if (!user) return;

      const notifiedUpdates = user.notifiedAttendanceUpdates || [];
      const now = Date.now();

      newUpdates.forEach((update) => {
        const updateId = this.generateUpdateIdentifier(
          telegramId,
          update.new,
          update.type
        );
        notifiedUpdates.push({
          id: updateId,
          timestamp: now,
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
    } catch (error) {}
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
      const isAlreadyNotified = this.notifiedUpdates.has(updateId);
      return !isAlreadyNotified;
    });
  }

  markUpdatesAsNotified(telegramId, updates) {
    const now = Date.now();
    updates.forEach((update) => {
      const updateId = this.generateUpdateIdentifier(
        telegramId,
        update.new,
        update.type
      );
      this.notifiedUpdates.set(updateId, now);
    });
  }

  compareAttendance(oldData, newData) {
    const updatedCourses = [];

    if (!oldData?.attendance || !newData?.attendance) return updatedCourses;

    for (const newCourse of newData.attendance) {
      const oldCourse = oldData.attendance.find(
        (c) =>
          c.courseTitle === newCourse.courseTitle &&
          c.category === newCourse.category
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
        continue;
      }

      if (this.attendanceChanged(newCourse, oldCourse)) {
        updatedCourses.push({
          courseName: newCourse.courseTitle,
          type: "update",
          new: newCourse,
          old: oldCourse,
        });
      }
    }

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

    if (coursesWithChanges.length === 0) return;

    let message = "🔔 *Attendance Update Alert!*\n\n";

    for (const update of coursesWithChanges) {
      const hoursConducted = parseInt(update.new.hoursConducted);
      const hoursAbsent = parseInt(update.new.hoursAbsent);
      const hoursPresent = hoursConducted - hoursAbsent;
      const newPercentage = parseFloat(update.new.attendancePercentage);
      const emoji = this.getAttendanceEmoji(newPercentage);

      const courseCode = update.new.courseCode || "";
      const facultyName = update.new.facultyName || "";
      const slot = update.new.slot || "";
      const roomNo = update.new.roomNo || "";

      message += `📚 *${update.courseName || update.new.courseTitle}* (${
        update.new.category
      })\n`;
      if (courseCode) message += `Code: ${courseCode}\n`;
      if (facultyName) message += `Faculty: ${facultyName}\n`;
      if (slot) message += `Slot: ${slot}\n`;
      if (roomNo) message += `Room: ${roomNo}\n`;
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

      const classesRequiredFor75 = update.new.classesRequiredFor75 ?? null;
      const classesCanSkipFor75 = update.new.classesCanSkipFor75 ?? null;

      if (classesCanSkipFor75 && classesCanSkipFor75 > 0) {
        message += `🎯 *Can skip:* ${classesCanSkipFor75} more classes\n`;
      } else if (classesRequiredFor75 && classesRequiredFor75 > 0) {
        message += `📌 *Need to attend:* ${classesRequiredFor75} more classes\n`;
      }

      message += "\n";
    }

    try {
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: "Markdown",
        disable_notification: false,
      });
    } catch (error) {}
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