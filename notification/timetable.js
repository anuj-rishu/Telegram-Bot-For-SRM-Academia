const schedule = require("node-schedule");
const sessionManager = require("../utils/sessionManager");
const apiService = require("../services/apiService");

class NotificationService {
  constructor(bot) {
    this.bot = bot;
    this.sentNotifications = new Map();
    this.processingUsers = new Set();
    this.scheduleNotifications();
    this.scheduleClassReminders();
    console.log("🔔 Notification service initialized");
  }

  scheduleNotifications() {
    schedule.scheduleJob("01 07 * * *", async () => {
      try {
        console.log("📅 Starting daily schedule notification...");
        const debugInfo = sessionManager.debug();
        console.log("📊 Session Debug:", debugInfo);

        const sessions = sessionManager.getAllSessions();
        const userIds = Object.keys(sessions);

        console.log(`👥 Found ${userIds.length} users to notify`);

        for (const userId of userIds) {
          console.log(`🔄 Processing user ${userId}...`);
          try {
            await this.sendDailySchedule(userId);
            console.log(`✅ Sent schedule to user ${userId}`);
          } catch (error) {
            console.error(`❌ Failed to notify user ${userId}:`, error.message);
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        this.sentNotifications.clear();
      } catch (error) {
        console.error("❌ Daily notification error:", error.message);
      }
    });
  }

  scheduleClassReminders() {
    console.log("🔔 Scheduling class reminders...");
    schedule.scheduleJob("* * * * *", async () => {
      try {
        console.log("🔔 Checking for upcoming classes...");
        const sessions = sessionManager.getAllSessions();

        for (const userId of Object.keys(sessions)) {
          if (this.processingUsers.has(userId)) {
            console.log(`⏭️ Already processing user ${userId}, skipping`);
            continue;
          }

          this.processingUsers.add(userId);

          try {
            await this.checkUpcomingClasses(userId);
          } finally {
            this.processingUsers.delete(userId);
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error("❌ Class reminder error:", error.message);
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
        for (const classInfo of upcomingClasses.within5Min) {
          await this.sendUrgentClassReminderOnce(userId, classInfo, 5);
        }
      }

      
    } catch (error) {
      console.error(
        `❌ Error checking classes for user ${userId}:`,
        error.message
      );
      if (error.response) {
        console.error("Response status:", error.response.status);
      }
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
     ;
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
        const courseAttendance = response.data.attendance.find(
          course => course.courseCode === classInfo.code
        );

        if (courseAttendance) {
          const hoursConducted = parseInt(courseAttendance.hoursConducted);
          const hoursAbsent = parseInt(courseAttendance.hoursAbsent);
          const hoursPresent = hoursConducted - hoursAbsent;
          const attendancePercentage = parseFloat(courseAttendance.attendancePercentage);

          let statusEmoji = "❌";
          if (attendancePercentage >= 90) statusEmoji = "✅";
          else if (attendancePercentage >= 75) statusEmoji = "✳️";
          else if (attendancePercentage >= 60) statusEmoji = "⚠️";

          attendanceInfo = `\n📊 *Attendance Status*\n${statusEmoji} *Current: ${attendancePercentage}%*`;
          
          if (attendancePercentage >= 75) {
            const skippable = Math.floor(hoursPresent / 0.75 - hoursConducted);
            attendanceInfo += `\n🎯 You can skip: ${Math.max(0, skippable)} more classes`;
          } else {
            const classesNeeded = Math.ceil(
              (0.75 * hoursConducted - hoursPresent) / 0.25
            );
            attendanceInfo += `\n📌 Need to attend: ${Math.max(1, classesNeeded)} more classes`;
          }
        }
      }
    } catch (error) {
      console.error(`Failed to fetch attendance for class ${classInfo.code}:`, error.message);
    }

    const message = [
      `${urgencyEmoji} *Class Starting in ${timeText}!*`,
      `\n📚 *${classInfo.name}* (${classInfo.code})`,
      `⏰ ${classInfo.startTime} - ${classInfo.endTime}`,
      `🏛 Room: ${classInfo.roomNo || "N/A"}`,
      `📝 Type: ${classInfo.courseType || "N/A"}`,
      attendanceInfo
    ].join("\n");

    try {
      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });

      this.sentNotifications.set(notificationKey, new Date());

      console.log(
        `✅ Sent ${timeText} reminder to user ${userId} for ${classInfo.name}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to send class reminder to user ${userId}:`,
        error.message
      );
    }
  }

  async sendHourlyClassReminder(userId, classInfo, hours) {
    const minutesUntil = classInfo.minutesUntil;
    const hoursUntil = Math.floor(minutesUntil / 60);
    const remainingMinutes = minutesUntil % 60;

    let timeDisplay = "";
    if (hoursUntil > 0) {
      timeDisplay += `${hoursUntil} hour${hoursUntil > 1 ? "s" : ""}`;
    }
    if (remainingMinutes > 0) {
      timeDisplay += `${
        hoursUntil > 0 ? " and " : ""
      }${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""}`;
    }

    const message = [
      `🕒 *Upcoming Class in ${timeDisplay}*`,
      `\n📚 *${classInfo.name}* (${classInfo.code})`,
      `⏰ ${classInfo.startTime} - ${classInfo.endTime}`,
      `🏛 Room: ${classInfo.roomNo || "N/A"}`,
      `📝 Type: ${classInfo.courseType || "N/A"}`,
    ].join("\n");

    try {
      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
      console.log(
        `✅ Sent ${hours}-hour reminder to user ${userId} for ${classInfo.name}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to send class reminder to user ${userId}:`,
        error.message
      );
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

  async sendDailySchedule(userId) {
    if (!userId) throw new Error("Invalid user ID");

    const session = sessionManager.getSession(userId);
    if (!session) {
      console.log(`⚠️ No active session for user ${userId}`);
      return;
    }

    if (!session.token || !session.csrfToken) {
      console.error(`🔑 Invalid session data for user ${userId}`);
      return;
    }

    try {
      const response = await apiService.makeAuthenticatedRequest(
        "/today-classes",
        session
      );

      if (!response?.data || response.data.error) {
        console.log(`⚠️ Invalid response for user ${userId}`);
        return;
      }

      const todayData = response.data;
      const greeting = this.getDayGreeting();
      const date = this.formatDate();

      const headerMessage = [
        `🌟 *${greeting}!*`,
        `\n📅 *${date}*`,
        `\n📚 *Your Classes for Today:*`,
        `Day Order: ${todayData.dayOrder}`,
      ].join("\n");

      await this.bot.telegram.sendMessage(userId, headerMessage, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });

      if (todayData.classes && todayData.classes.length > 0) {
        let classesMessage = "";

        const sortedClasses = [...todayData.classes].sort((a, b) => {
          return (
            this.convertTimeToMinutes(a.startTime) -
            this.convertTimeToMinutes(b.startTime)
          );
        });

        sortedClasses.forEach((classInfo) => {
          classesMessage += `⏰ *${classInfo.startTime} - ${classInfo.endTime}*\n`;
          classesMessage += `📚 ${classInfo.name} (${classInfo.code})\n`;
          classesMessage += `🏛 Room: ${classInfo.roomNo || "N/A"}\n`;
          classesMessage += `📝 Type: ${classInfo.courseType || "N/A"}\n\n`;
        });

        await this.bot.telegram.sendMessage(userId, classesMessage, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        });
      } else {
        await this.bot.telegram.sendMessage(
          userId,
          "😴 No classes scheduled for today!",
          {
            parse_mode: "Markdown",
          }
        );
      }
    } catch (error) {
      console.error(
        `❌ Error sending daily schedule to user ${userId}:`,
        error.message
      );
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