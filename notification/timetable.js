const schedule = require("node-schedule");
const sessionManager = require("../utils/sessionManager");
const apiService = require("../services/apiService");
const logger = require("../utils/logger");

class NotificationService {
  constructor(bot) {
    this.bot = bot;
    this.sentNotifications = new Map();
    this.processingUsers = new Set();
    this.scheduleNotifications();
    this.scheduleClassReminders();
  }

  isWeekday() {
    const day = new Date().getDay();
    return day !== 0 && day !== 6;
  }

  isWithinOperatingHours() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = hour * 60 + minute;

    const startTime = 7 * 60 + 50;
    const endTime = 17 * 60;

    return currentTime >= startTime && currentTime <= endTime;
  }

  scheduleNotifications() {
    schedule.scheduleJob("01 07 * * 1-5", async () => {
      try {
        const sessions = sessionManager.getAllSessions();
        const userIds = Object.keys(sessions);

        const totalUsers = userIds.length;
        const timeWindowMinutes = 20;
        const batchSize = Math.ceil(totalUsers / timeWindowMinutes);

        logger.info(
          `Scheduling notifications for ${totalUsers} users over ${timeWindowMinutes} minutes`
        );

        for (let minute = 0; minute < timeWindowMinutes; minute++) {
          const startIdx = minute * batchSize;
          const endIdx = Math.min(startIdx + batchSize, totalUsers);
          const currentBatch = userIds.slice(startIdx, endIdx);

          if (currentBatch.length === 0) continue;

          setTimeout(async () => {
            logger.info(
              `Processing batch at minute ${minute} with ${currentBatch.length} users`
            );
            await Promise.all(
              currentBatch.map(async (userId) => {
                try {
                  await this.sendDailySchedule(userId);
                } catch (error) {
                  logger.error(
                    `Error sending notification to user ${userId}: ${error.message}`
                  );
                }
              })
            );
          }, minute * 60 * 1000);
        }

        this.sentNotifications.clear();
      } catch (error) {
        logger.error(`Error in scheduleNotifications: ${error.message}`);
      }
    });
  }

  scheduleClassReminders() {
    schedule.scheduleJob("* * * * *", async () => {
      if (!this.isWeekday() || !this.isWithinOperatingHours()) {
        return;
      }

      try {
        const sessions = sessionManager.getAllSessions();
        const userIds = Object.keys(sessions);

        const BATCH_SIZE = 25;

        for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
          const batch = userIds.slice(i, i + BATCH_SIZE);

          await Promise.all(
            batch.map(async (userId) => {
              if (this.processingUsers.has(userId)) {
                return;
              }

              this.processingUsers.add(userId);

              try {
                await this.checkUpcomingClasses(userId);
              } finally {
                this.processingUsers.delete(userId);
              }
            })
          );

          if (i + BATCH_SIZE < userIds.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
      } catch (error) {
        logger.error(`Error in scheduleClassReminders: ${error.message}`);
      }
    });
  }

  async checkUpcomingClasses(userId) {
    const session = sessionManager.getSession(userId);
    if (!session?.token) {
      return;
    }

    try {
      const response = await apiService.makeAuthenticatedRequest(
        "/upcoming-classes",
        session
      );

      if (!response?.data || response.data.error) {
        return;
      }

      const upcomingClasses = response.data.upcomingClasses;
      if (!upcomingClasses) {
        return;
      }

      if (upcomingClasses.within5Min && upcomingClasses.within5Min.length > 0) {
        await Promise.all(
          upcomingClasses.within5Min.map((classInfo) =>
            this.sendUrgentClassReminderOnce(userId, classInfo, 5)
          )
        );
      }
    } catch (error) {
      logger.error(
        `Error checking upcoming classes for user ${userId}: ${error.message}`
      );
    }
  }

  createNotificationKey(userId, classInfo, timeframe) {
    const today = new Date().toLocaleDateString();
    return `${today}:${userId}:${classInfo.code}:${classInfo.startTime}:${timeframe}`;
  }

  async sendUrgentClassReminderOnce(userId, classInfo, minutes) {
    const notificationKey = this.createNotificationKey(
      userId,
      classInfo,
      minutes
    );

    if (this.sentNotifications.has(notificationKey)) {
      return;
    }

    const urgencyEmoji = "⚠️";
    const timeText = "5 minutes";

    let attendanceInfo = "";
    try {
      const session = sessionManager.getSession(userId);
      const response = await apiService.makeAuthenticatedRequest(
        "/attendance",
        session
      );

      if (response?.data?.attendance) {
        let courseAttendance = response.data.attendance.find(
          (course) =>
            (course.courseCode === classInfo.code ||
              course.courseTitle === classInfo.name) &&
            (course.courseType === classInfo.courseType ||
              course.category === classInfo.courseType)
        );

        if (courseAttendance) {
          const hoursConducted = parseInt(courseAttendance.hoursConducted);
          const hoursAbsent = parseInt(courseAttendance.hoursAbsent);
          const hoursPresent = hoursConducted - hoursAbsent;
          const attendancePercentage = parseFloat(
            courseAttendance.attendancePercentage
          );

          let statusEmoji = "❌";
          if (attendancePercentage >= 90) statusEmoji = "✅";
          else if (attendancePercentage >= 75) statusEmoji = "✳️";
          else if (attendancePercentage >= 60) statusEmoji = "⚠️";

          attendanceInfo = `\n📊 *Attendance Status${
            courseAttendance.courseType || courseAttendance.category
              ? " (" +
                (courseAttendance.courseType || courseAttendance.category) +
                ")"
              : ""
          }*\n${statusEmoji} *Current: ${attendancePercentage}%*`;

          if (attendancePercentage >= 75) {
            const skippable = Math.floor(hoursPresent / 0.75 - hoursConducted);
            attendanceInfo += `\n🎯 You can skip: ${Math.max(
              0,
              skippable
            )} more classes`;
          } else {
            const classesNeeded = Math.ceil(
              (0.75 * hoursConducted - hoursPresent) / 0.25
            );
            attendanceInfo += `\n📌 Need to attend: ${Math.max(
              1,
              classesNeeded
            )} more classes`;
          }
        }
      }
    } catch (error) {
      logger.error(
        `Error fetching attendance for user ${userId}: ${error.message}`
      );
    }

    const message = [
      `${urgencyEmoji} *Class Starting in ${timeText}!*`,
      `\n📚 *${classInfo.name}* (${classInfo.courseType})`,
      `⏰ ${classInfo.startTime} - ${classInfo.endTime}`,
      `🏛 Room: ${classInfo.roomNo || "N/A"}`,
      attendanceInfo,
    ].join("\n");

    try {
      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });

      this.sentNotifications.set(notificationKey, new Date());
      logger.userActivity(userId, `Sent urgent reminder for ${classInfo.name}`);
    } catch (error) {
      logger.error(
        `Error sending urgent reminder to user ${userId}: ${error.message}`
      );

      if (
        !error.message.includes("retry_after") &&
        !error.message.includes("Too Many Requests")
      ) {
        setTimeout(async () => {
          try {
            await this.bot.telegram.sendMessage(userId, message, {
              parse_mode: "Markdown",
              disable_web_page_preview: true,
            });
            this.sentNotifications.set(notificationKey, new Date());
            logger.userActivity(userId, `Successfully retried urgent reminder`);
          } catch (retryError) {
            logger.error(
              `Retry failed for user ${userId}: ${retryError.message}`
            );
          }
        }, 3000);
      }
    }
  }

  getDayGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }

  formatDate() {
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return new Date().toLocaleDateString("en-US", options);
  }

  getAttendanceEmoji(percentage) {
    if (percentage >= 90) return "✅";
    if (percentage >= 75) return "✳️";
    if (percentage >= 60) return "⚠️";
    return "❌";
  }

  async sendDailySchedule(userId) {
    if (!userId) throw new Error("Invalid user ID");

    const session = sessionManager.getSession(userId);
    if (!session?.token || !session?.csrfToken) {
      return;
    }

    try {
      const [classesResponse, attendanceResponse] = await Promise.all([
        apiService.makeAuthenticatedRequest("/today-classes", session),
        apiService.makeAuthenticatedRequest("/attendance", session),
      ]);

      if (!classesResponse?.data || classesResponse.data.error) {
        return;
      }

      const todayData = classesResponse.data;
      const greeting = this.getDayGreeting();
      const date = this.formatDate();

      let completeMessage = [
        `🌟 *${greeting}!*`,
        `\n📅 *${date}*`,
        `\n📚 *Your Classes for Today:*`,
        todayData.dayOrder ? `Day Order: ${todayData.dayOrder}` : `🎉 Holiday!`,
        "\n",
      ].join("\n");

      if (todayData.classes && todayData.classes.length > 0) {
        const sortedClasses = [...todayData.classes].sort((a, b) => {
          return (
            this.convertTimeToMinutes(a.startTime) -
            this.convertTimeToMinutes(b.startTime)
          );
        });

        for (const classInfo of sortedClasses) {
          completeMessage += `\n⏰ *${classInfo.startTime} - ${classInfo.endTime}*\n`;
          completeMessage += `📚 ${classInfo.name} (${classInfo.courseType})\n`;
          completeMessage += `🏛 Room: ${classInfo.roomNo || "N/A"}\n`;

          if (attendanceResponse?.data?.attendance) {
            const courseAttendance = attendanceResponse.data.attendance.find(
              (course) =>
                (course.courseCode === classInfo.code ||
                  course.courseTitle === classInfo.name) &&
                (course.courseType === classInfo.courseType ||
                  course.category === classInfo.courseType)
            );

            if (courseAttendance) {
              const hoursConducted = parseInt(courseAttendance.hoursConducted);
              const hoursAbsent = parseInt(courseAttendance.hoursAbsent);
              const hoursPresent = hoursConducted - hoursAbsent;
              const attendancePercentage = parseFloat(
                courseAttendance.attendancePercentage
              );
              const emoji = this.getAttendanceEmoji(attendancePercentage);

              completeMessage += `${emoji} Attendance: ${attendancePercentage}% (${hoursPresent}/${hoursConducted})\n`;

              if (attendancePercentage >= 75) {
                const skippable = Math.floor(
                  hoursPresent / 0.75 - hoursConducted
                );
                completeMessage += `🎯 Can skip: ${Math.max(
                  0,
                  skippable
                )} more classes\n`;
              } else {
                const classesNeeded = Math.ceil(
                  (0.75 * hoursConducted - hoursPresent) / 0.25
                );
                completeMessage += `📌 Need to attend: ${Math.max(
                  1,
                  classesNeeded
                )} more classes\n`;
              }
            }
          }
        }
      } else {
        completeMessage += "\n😴 No classes scheduled for today!";

        if (attendanceResponse?.data?.attendance) {
          completeMessage += "\n\n📊 *Overall Attendance:*\n";

          const allCourses = attendanceResponse.data.attendance.sort(
            (a, b) =>
              parseFloat(a.attendancePercentage) -
              parseFloat(b.attendancePercentage)
          );

          if (allCourses.length > 0) {
            completeMessage += "\n📋 *Your course attendance:*\n";

            for (const course of allCourses) {
              const hoursConducted = parseInt(course.hoursConducted);
              const hoursAbsent = parseInt(course.hoursAbsent);
              const hoursPresent = hoursConducted - hoursAbsent;
              const attendancePercentage = parseFloat(
                course.attendancePercentage
              );
              const emoji = this.getAttendanceEmoji(attendancePercentage);

              completeMessage += `${emoji} *${course.courseTitle}* (${course.category}): ${attendancePercentage}%\n`;

              if (attendancePercentage >= 75) {
                const skippable = Math.floor(
                  hoursPresent / 0.75 - hoursConducted
                );
                completeMessage += `   🎯 Can skip: ${Math.max(
                  0,
                  skippable
                )} more classes\n`;
              } else {
                const classesNeeded = Math.ceil(
                  (0.75 * hoursConducted - hoursPresent) / 0.25
                );
                completeMessage += `   📌 Need to attend: ${Math.max(
                  1,
                  classesNeeded
                )} more classes\n`;
              }
            }
          } else {
            completeMessage += "✅ No course attendance data available\n";
          }
        }
      }

      await this.bot.telegram.sendMessage(userId, completeMessage, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
      logger.userActivity(userId, `Sent daily schedule`);
    } catch (error) {
      logger.error(
        `Error sending daily schedule to user ${userId}: ${error.message}`
      );

      if (
        !error.message.includes("retry_after") &&
        !error.message.includes("Too Many Requests")
      ) {
        setTimeout(async () => {
          try {
            await this.bot.telegram.sendMessage(
              userId,
              "🌟 *Good day!*\n\nYour daily schedule is available. Check your class details in the app.",
              {
                parse_mode: "Markdown",
              }
            );
            logger.userActivity(userId, `Sent simplified daily schedule`);
          } catch (retryError) {
            logger.error(
              `Failed to send simplified daily schedule to user ${userId}: ${retryError.message}`
            );
          }
        }, 5000);
      }
    }
  }

  convertTimeToMinutes(timeStr) {
    if (!timeStr) return 0;

    const [time, period] = timeStr.split(" ");
    let [hours, minutes] = time.split(":").map(Number);

    if (period === "PM" && hours !== 12) {
      hours += 12;
    } else if (period === "AM" && hours === 12) {
      hours = 0;
    }

    return hours * 60 + minutes;
  }
}

module.exports = NotificationService;
