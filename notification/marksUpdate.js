const config = require("../config/config");
const Redis = require("ioredis");
const amqp = require("amqplib");
const User = require("../model/user");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const crypto = require("crypto");
const logger = require("../utils/logger");

class MarksNotificationService {
  constructor(bot) {
    this.bot = bot;

    this.redis = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.initializeRabbitMQ();

    setTimeout(() => this.migrateNotificationData(), 5000);

    this.batchSize = 30;
    this.batchDelay = 100;

    setTimeout(() => this.checkMarksUpdates(), 10000);
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

      await this.channel.assertQueue("marks_updates", {
        durable: true,
        messageTtl: 3600000,
      });

      this.channel.prefetch(10);

      this.channel.consume("marks_updates", async (msg) => {
        if (msg !== null) {
          try {
            const { telegramId, updates } = JSON.parse(msg.content.toString());
            await this.sendMarksUpdateNotification(telegramId, updates);
            this.channel.ack(msg);
          } catch (error) {
            logger.error(
              `Error processing marks notification: ${error.message}`
            );
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
        notifiedMarksUpdates: { $exists: true, $ne: [] },
      });

      for (const user of users) {
        if (
          user.notifiedMarksUpdates &&
          Array.isArray(user.notifiedMarksUpdates)
        ) {
          const pipeline = this.redis.pipeline();

          user.notifiedMarksUpdates.forEach((update) => {
            if (update && update.id && update.timestamp) {
              pipeline.set(
                `marks_notification:${update.id}`,
                update.timestamp,
                "EX",
                86400
              );
            }
          });

          await pipeline.exec();
        }

        if (
          user.notifiedMarksUpdates.length > 0 &&
          (typeof user.notifiedMarksUpdates[0] === "string" ||
            !user.notifiedMarksUpdates[0].id)
        ) {
          await User.findByIdAndUpdate(user._id, {
            notifiedMarksUpdates: [],
          });
        }
      }
    } catch (error) {
      logger.error(`Migration error: ${error.message}`);
    }
  }

  async isAlreadyNotified(updateId) {
    return Boolean(await this.redis.exists(`marks_notification:${updateId}`));
  }

  async markAsNotified(updateId, timestamp = Date.now()) {
    await this.redis.set(
      `marks_notification:${updateId}`,
      timestamp,
      "EX",
      86400
    );
  }

  async checkMarksUpdates() {
    try {
      const users = await User.find({
        token: { $exists: true },
        marks: { $exists: true },
      }).lean();

      for (let i = 0; i < users.length; i += this.batchSize) {
        const batch = users.slice(i, i + this.batchSize);

        await Promise.all(
          batch.map(async (user) => {
            const lockKey = `marks_lock:${user.telegramId}`;
            const lock = await this.redis.set(lockKey, "1", "NX", "EX", 60);

            if (!lock) return;

            try {
              await this.processUserMarks(user);
            } finally {
              await this.redis.del(lockKey);
            }
          })
        );

        if (i + this.batchSize < users.length) {
          await new Promise((resolve) => setTimeout(resolve, this.batchDelay));
        }
      }

      // Schedule next check
      setTimeout(
        () => this.checkMarksUpdates(),
        Math.max(
          0,
          60000 - this.batchDelay * Math.ceil(users.length / this.batchSize)
        )
      );
    } catch (error) {
      logger.error(`Error checking marks updates: ${error.message}`);
      setTimeout(() => this.checkMarksUpdates(), 60000);
    }
  }

  generateMarksHash(marksData) {
    if (!marksData || !marksData.marks) return null;

    const marksString = JSON.stringify(marksData);
    return crypto.createHash("md5").update(marksString).digest("hex");
  }

  async processUserMarks(user) {
    try {
      const session = sessionManager.getSession(user.telegramId);
      if (!session) return;

      // Check cached marks data
      let oldMarksData = user.marks;
      const cachedData = await this.redis.get(`marks:${user.telegramId}`);

      if (cachedData) {
        oldMarksData = JSON.parse(cachedData);
      }

      const response = await apiService.makeAuthenticatedRequest(
        "/marks",
        session
      );
      const newMarksData = response.data;

      if (!newMarksData?.marks) return;

      // Cache new marks data
      await this.redis.set(
        `marks:${user.telegramId}`,
        JSON.stringify(newMarksData),
        "EX",
        600
      );

      const newMarksHash = this.generateMarksHash(newMarksData);

      if (newMarksHash === user.marksHash) return;

      const updatedCourses = this.compareMarks(oldMarksData, newMarksData);

      if (updatedCourses.length > 0) {
        const newUpdates = await this.filterAlreadyNotifiedUpdates(
          user.telegramId,
          updatedCourses
        );

        if (newUpdates.length > 0) {
          this.channel.sendToQueue(
            "marks_updates",
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

        await User.findByIdAndUpdate(user._id, {
          marks: newMarksData,
          marksHash: newMarksHash,
          lastMarksUpdate: new Date(),
        });
      }
    } catch (error) {
      logger.error(
        `Error processing marks for user ${user.telegramId}: ${error.message}`
      );
    }
  }

  async filterAlreadyNotifiedUpdates(telegramId, updates) {
    const filteredUpdates = [];

    for (const update of updates) {
      const updateId = this.generateUpdateIdentifier(telegramId, update);
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
      const updateId = this.generateUpdateIdentifier(telegramId, update);
      pipeline.set(`marks_notification:${updateId}`, now, "EX", 86400);
    });

    await pipeline.exec();
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

  async saveNotifiedUpdatesToDB(telegramId, newUpdates) {
    try {
      const user = await User.findOne({ telegramId });
      if (!user) return;

      let notifiedUpdates = [];

      if (Array.isArray(user.notifiedMarksUpdates)) {
        notifiedUpdates = user.notifiedMarksUpdates.filter(
          (update) =>
            update &&
            typeof update === "object" &&
            update.id &&
            typeof update.id === "string" &&
            update.timestamp
        );
      }

      const now = Date.now();

      newUpdates.forEach((update) => {
        const updateId = this.generateUpdateIdentifier(telegramId, update);
        notifiedUpdates.push({
          id: updateId,
          timestamp: now,
          courseName: update.courseName,
          type: update.type,
          testName: update.testName || null,
        });
      });

      const MAX_STORED_UPDATES = 100;
      const updatesToStore = notifiedUpdates.slice(-MAX_STORED_UPDATES);

      await User.findByIdAndUpdate(user._id, {
        $set: { notifiedMarksUpdates: updatesToStore },
      });
    } catch (error) {
      logger.error(`Error saving notified updates to DB: ${error.message}`);
    }
  }

  compareMarks(oldMarks, newMarks) {
    const updatedCourses = [];

    if (!oldMarks?.marks || !newMarks?.marks) return updatedCourses;

    for (const newCourse of newMarks.marks) {
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
        continue;
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
        for (const newTest of newCourse.testPerformance) {
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
        }
      }
    }

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

    for (const update of updatedCourses) {
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
    }

    try {
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: "Markdown",
        disable_notification: false,
      });
    } catch (error) {
      logger.error(
        `Error sending marks notification to ${telegramId}: ${error.message}`
      );
      throw error;
    }
  }

  async cleanupOldNotifications() {
    try {
      const users = await User.find({
        notifiedMarksUpdates: { $exists: true, $ne: [] },
      });

      const ONE_DAY = 24 * 60 * 60 * 1000;
      const now = Date.now();

      for (const user of users) {
        if (!user.notifiedMarksUpdates) continue;

        const updatedNotifications = user.notifiedMarksUpdates.filter(
          (update) => now - update.timestamp <= ONE_DAY
        );

        if (updatedNotifications.length !== user.notifiedMarksUpdates.length) {
          await User.findByIdAndUpdate(user._id, {
            notifiedMarksUpdates: updatedNotifications,
          });
        }
      }
    } catch (error) {
      logger.error(`Error cleaning up old notifications: ${error.message}`);
    }
  }
}

module.exports = MarksNotificationService;
