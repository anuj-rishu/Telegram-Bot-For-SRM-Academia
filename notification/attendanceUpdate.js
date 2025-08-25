const config = require("../config/config");
const Redis = require("ioredis");
const amqp = require("amqplib");
const User = require("../model/user");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const AttendanceHistory = require("../model/attendanceHistory");
const crypto = require("crypto");
const logger = require("../utils/logger");

class AttendanceNotificationService {
  constructor(bot) {
    this.bot = bot;
    this.processingUsers = new Set();

    this.redis = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.initializeRabbitMQ();

    setTimeout(() => this.migrateNotificationData(), 5000);

    setInterval(() => this.checkAttendanceUpdates(), 60 * 1000);
    setInterval(() => this.cleanupOldNotifications(), 6 * 60 * 60 * 1000);
  }

  async initializeRabbitMQ() {
    try {
      const connection = await amqp.connect(config.RABBITMQ_URL);

      connection.on("error", (err) => {
        logger.error(`RabbitMQ connection error: ${err.message}`);
        setTimeout(() => this.initializeRabbitMQ(), 5000);
      });

      this.channel = await connection.createChannel();

      await this.channel.assertQueue("attendance_updates", {
        durable: true,
        messageTtl: 3600000,
      });

      this.channel.prefetch(10);

      this.channel.consume("attendance_updates", async (msg) => {
        if (msg !== null) {
          try {
            const { telegramId, updates } = JSON.parse(msg.content.toString());
            await this.sendAttendanceUpdateNotification(telegramId, updates);
            this.channel.ack(msg);
          } catch (error) {
            logger.error(`Error processing notification: ${error.message}`);
            if (error.code !== "ETIMEDOUT" && error.code !== "ECONNREFUSED") {
              this.channel.nack(msg, false, true);
            } else {
              this.channel.nack(msg, false, false);
            }
          }
        }
      });
    } catch (error) {
      logger.error(`Failed to initialize RabbitMQ: ${error.message}`);
      setTimeout(() => this.initializeRabbitMQ(), 5000);
    }
  }

  async migrateNotificationData() {
    try {
      const users = await User.find({
        notifiedAttendanceUpdates: { $exists: true, $ne: [] },
      });

      for (const user of users) {
        if (
          user.notifiedAttendanceUpdates &&
          Array.isArray(user.notifiedAttendanceUpdates)
        ) {
          const pipeline = this.redis.pipeline();

          user.notifiedAttendanceUpdates.forEach((update) => {
            if (update && update.id && update.timestamp) {
              pipeline.set(
                `notification:${update.id}`,
                update.timestamp,
                "EX",
                86400
              );
            }
          });

          await pipeline.exec();
        }

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
    } catch (error) {
      logger.error(`Migration error: ${error.message}`);
    }
  }

  async isAlreadyNotified(updateId) {
    return Boolean(await this.redis.exists(`notification:${updateId}`));
  }

  async markAsNotified(updateId, timestamp = Date.now()) {
    await this.redis.set(`notification:${updateId}`, timestamp, "EX", 86400);
  }

  async checkAttendanceUpdates() {
    try {
      const users = await User.find({
        token: { $exists: true },
      }).lean();

      const BATCH_SIZE = 30;

      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (user) => {
            const lockKey = `attendance_lock:${user.telegramId}`;
            const lock = await this.redis.set(lockKey, "1", "NX", "EX", 60);

            if (!lock) return;

            try {
              await this.checkUserAttendance(user);
            } finally {
              await this.redis.del(lockKey);
            }
          })
        );

        if (i + BATCH_SIZE < users.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      logger.error(`Error checking attendance updates: ${error.message}`);
    }
  }

  async checkUserAttendance(user) {
    try {
      const session = sessionManager.getSession(user.telegramId);
      if (!session) return;

      let oldAttendanceData = user.attendance;
      const cachedData = await this.redis.get(`attendance:${user.telegramId}`);

      if (cachedData) {
        oldAttendanceData = JSON.parse(cachedData);
      }

      const response = await apiService.makeAuthenticatedRequest(
        "/attendance",
        session
      );

      const newAttendanceData = response.data;
      if (!newAttendanceData?.attendance) return;

      await this.redis.set(
        `attendance:${user.telegramId}`,
        JSON.stringify(newAttendanceData),
        "EX",
        600
      );

      const newHash = this.generateAttendanceHash(newAttendanceData.attendance);
      if (user.attendanceHash === newHash) return;

      const updatedCourses = this.compareAttendance(
        oldAttendanceData,
        newAttendanceData
      );

      if (updatedCourses.length > 0) {
        const hasRealChanges = this.hasSignificantChanges(updatedCourses);

        if (hasRealChanges) {
          const newUpdates = await this.filterAlreadyNotifiedUpdates(
            user.telegramId,
            updatedCourses
          );

          if (newUpdates.length > 0) {
            this.channel.sendToQueue(
              "attendance_updates",
              Buffer.from(
                JSON.stringify({
                  telegramId: user.telegramId,
                  updates: newUpdates,
                })
              ),
              { persistent: true }
            );

            await this.markUpdatesAsNotified(user.telegramId, newUpdates);
            await this.saveNotifiedUpdatesToDB(user.telegramId, newUpdates);
          }
        }

        for (const update of updatedCourses) {
          const wasPresent = this.determineAttendanceStatus(update);
          await this.saveAttendanceHistory(
            user.telegramId,
            update.new,
            wasPresent,
            new Date()
          );
        }

        await User.findByIdAndUpdate(user._id, {
          attendance: newAttendanceData,
          attendanceHash: newHash,
          lastAttendanceUpdate: new Date(),
        });
      }
    } catch (error) {
      logger.error(
        `Error checking attendance for user ${user.telegramId}: ${error.message}`
      );
    }
  }

  async filterAlreadyNotifiedUpdates(telegramId, updates) {
    const filteredUpdates = [];

    for (const update of updates) {
      const updateId = this.generateUpdateIdentifier(
        telegramId,
        update.new,
        update.type
      );

      const isNotified = await this.isAlreadyNotified(updateId);
      if (!isNotified) {
        filteredUpdates.push(update);
      }
    }

    return filteredUpdates;
  }

  async markUpdatesAsNotified(telegramId, updates) {
    const pipeline = this.redis.pipeline();
    const now = Date.now();

    updates.forEach((update) => {
      const updateId = this.generateUpdateIdentifier(
        telegramId,
        update.new,
        update.type
      );
      pipeline.set(`notification:${updateId}`, now, "EX", 86400);
    });

    await pipeline.exec();
  }

  determineAttendanceStatus(update) {
    if (!update.old) {
      return parseInt(update.new.hoursAbsent) === 0;
    }

    const oldHoursConducted = parseInt(update.old.hoursConducted);
    const newHoursConducted = parseInt(update.new.hoursConducted);
    const oldHoursAbsent = parseInt(update.old.hoursAbsent);
    const newHoursAbsent = parseInt(update.new.hoursAbsent);

    if (newHoursConducted > oldHoursConducted) {
      return newHoursAbsent === oldHoursAbsent;
    }

    return (
      newHoursConducted - newHoursAbsent > oldHoursConducted - oldHoursAbsent
    );
  }

  generateAttendanceHash(attendance) {
    try {
      const hashData = attendance.map((course) => ({
        courseTitle: course.courseTitle,
        category: course.category,
        hoursConducted: course.hoursConducted,
        hoursAbsent: course.hoursAbsent,
        attendancePercentage: course.attendancePercentage,
      }));

      return crypto
        .createHash("md5")
        .update(JSON.stringify(hashData))
        .digest("hex");
    } catch (error) {
      return null;
    }
  }

  async saveAttendanceHistory(
    telegramId,
    course,
    wasPresent,
    date = new Date()
  ) {
    try {
      const hoursConducted = parseInt(course.hoursConducted);
      const hoursAbsent = parseInt(course.hoursAbsent);
      const hoursPresent = hoursConducted - hoursAbsent;

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
    } catch (error) {
      logger.error(`Error saving attendance history: ${error.message}`);
    }
  }

  async saveNotifiedUpdatesToDB(telegramId, newUpdates) {
    try {
      const user = await User.findOne({ telegramId });
      if (!user) return;

      // Check if notifiedAttendanceUpdates is an array
      let notifiedUpdates = [];

      // Ensure we're working with an array of objects with the correct structure
      if (Array.isArray(user.notifiedAttendanceUpdates)) {
        // Filter out any string values or invalid objects
        notifiedUpdates = user.notifiedAttendanceUpdates.filter(
          (update) =>
            update &&
            typeof update === "object" &&
            update.id &&
            typeof update.id === "string" &&
            update.timestamp
        );
      }

      const now = Date.now();

      // Add new updates
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

      // Use $set to ensure proper type handling
      await User.findByIdAndUpdate(user._id, {
        $set: { notifiedAttendanceUpdates: updatesToStore },
      });
    } catch (error) {
      logger.error(`Error saving notified updates to DB: ${error.message}`);
    }
  }

  generateUpdateIdentifier(telegramId, course, type) {
    const courseDetails = `${course.courseTitle}-${course.category}-${course.hoursConducted}-${course.hoursAbsent}`;
    return `${telegramId}:${courseDetails}:${type}`;
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

          const wasPresent = this.determineAttendanceStatus(update);
          message += wasPresent
            ? `✅ You were present in the latest class\n`
            : `❌ You were absent in the latest class\n`;

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
    } catch (error) {
      logger.error(
        `Error sending notification to ${telegramId}: ${error.message}`
      );
      throw error;
    }
  }

  async cleanupOldNotifications() {
    try {
      const users = await User.find({
        notifiedAttendanceUpdates: { $exists: true, $ne: [] },
      });

      const ONE_DAY = 24 * 60 * 60 * 1000;
      const now = Date.now();

      for (const user of users) {
        if (!user.notifiedAttendanceUpdates) continue;

        const updatedNotifications = user.notifiedAttendanceUpdates.filter(
          (update) => now - update.timestamp <= ONE_DAY
        );

        if (
          updatedNotifications.length !== user.notifiedAttendanceUpdates.length
        ) {
          await User.findByIdAndUpdate(user._id, {
            notifiedAttendanceUpdates: updatedNotifications,
          });
        }
      }
    } catch (error) {
      logger.error(`Error cleaning up old notifications: ${error.message}`);
    }
  }
}

module.exports = AttendanceNotificationService;
