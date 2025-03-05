const schedule = require("node-schedule");
const timetableController = require("../controllers/timetableController");
const sessionManager = require("../utils/sessionManager");
const apiService = require("../services/apiService");

class NotificationService {
  constructor(bot) {
    this.bot = bot;
    this.morningQuotes = [
      "Rise and shine! Success awaits those who make an early start. 🌅",
      "Every morning is a fresh beginning. Make it count! ✨",
      "Good morning! Today is another chance to be better than yesterday. 🌟",
      "Wake up with determination, go to bed with satisfaction. 💪",
      "A new day brings new opportunities. Make it most of it! 🎯",
      "Your future is created by what you do today, not tomorrow. Good morning! 🌄",
      "Start your day with a grateful heart and positive mindset. 🙏",
      "Today's goals: Coffee ☕, Success 🎯, Kindness 💝",
      "Every day is a new page in your story. Make it a good one! 📖",
      "Morning motivation: You've got this! 💫",
      "Begin each day believing something wonderful is about to happen! 🌟",
      "Your positive action combined with positive thinking results in success. 🎯",
      "The only way to do great work is to love what you do. 💝",
      "Make today amazing! Your future self will thank you. ⭐",
    ];
    this.scheduleNotifications();
    this.scheduleClassReminders();
    console.log("🔔 Notification service initialized");
  }

  scheduleNotifications() {
    schedule.scheduleJob("34 09 * * *", async () => {
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
      } catch (error) {
        console.error("❌ Daily notification error:", error.message);
      }
    });
  }

  scheduleClassReminders() {
    schedule.scheduleJob("* * * * *", async () => {
      try {
        const sessions = sessionManager.getAllSessions();
        for (const userId of Object.keys(sessions)) {
          await this.checkUpcomingClasses(userId);
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
      console.log(`⚠️ No valid session for user ${userId}`);
      return;
    }

    try {
      // Get calendar data
      const calendarResponse = await apiService.makeAuthenticatedRequest(
        "/calendar",
        session
      );

      // Validate calendar response
      if (!calendarResponse?.data?.today) {
        console.log(`⚠️ Invalid calendar data for user ${userId}`);
        return;
      }

      // Skip if no day order or it's a holiday
      const dayOrder = calendarResponse.data.today.dayOrder;
      if (!dayOrder || dayOrder === "-" || dayOrder === "") {
        console.log(
          `ℹ️ No classes today (dayOrder: ${dayOrder}) for user ${userId}`
        );
        return;
      }

      // Get timetable data
      const response = await apiService.makeAuthenticatedRequest(
        "/timetable",
        session
      );

      // Validate timetable response
      if (!response?.data?.schedule) {
        console.log(`⚠️ Invalid timetable data for user ${userId}`);
        return;
      }

      const todaySchedule = response.data.schedule.find(
        (day) => day.day === parseInt(dayOrder)
      );

      if (!todaySchedule) {
        console.log(
          `ℹ️ No schedule found for day order ${dayOrder} for user ${userId}`
        );
        return;
      }

      if (!Array.isArray(todaySchedule.table)) {
        console.log(`⚠️ Invalid table data in schedule for user ${userId}`);
        return;
      }

      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      for (const slot of todaySchedule.table) {
        if (!slot || !slot.startTime) continue;

        const [startHour, startMinute] = slot.startTime.split(":").map(Number);
        if (isNaN(startHour) || isNaN(startMinute)) continue;

        const startTimeInMinutes = startHour * 60 + startMinute;

        if (startTimeInMinutes - currentTime === 2) {
          await this.sendClassReminder(userId, slot);
        }
      }
    } catch (error) {
      console.error(
        `❌ Error checking classes for user ${userId}:`,
        error.message
      );
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
      }
    }
  }

  async sendClassReminder(userId, slot) {
    const message = [
      `🔔 *Class Starting Soon!*`,
      `\n📚 *${slot.name}*`,
      `⏰ Starts in 2 minutes (${slot.startTime} - ${slot.endTime})`,
      `🏛 Room: ${slot.roomNo}`,
    ].join("\n");

    try {
      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
      console.log(`✅ Sent class reminder to user ${userId} for ${slot.name}`);
    } catch (error) {
      console.error(
        `❌ Failed to send class reminder to user ${userId}:`,
        error.message
      );
    }
  }

  getRandomQuote() {
    return this.morningQuotes[
      Math.floor(Math.random() * this.morningQuotes.length)
    ];
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

    const context = {
      from: { id: userId },
      reply: (text) => this.bot.telegram.sendMessage(userId, text),
      replyWithMarkdown: (text) =>
        this.bot.telegram.sendMessage(userId, text, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
    };

    const greeting = this.getDayGreeting();
    const date = this.formatDate();
    const quote = this.getRandomQuote();

    const message = [
      `🌟 *${greeting}!*`,
      `\n📅 *${date}*`,
      `\n📚 *Your Schedule for Today:*`,
    ].join("\n");

    await context.replyWithMarkdown(message);
    await timetableController.handleTodayTimetable(context);

    // const footerMessage = [
    //     `\n━━━━━━━━━━━━━━━━━━━━`,
    //     `🎯 *Have a productive day!*`,
    //     `_Remember: Every small step counts towards your goals._`
    // ].join('\n');

    // await context.replyWithMarkdown(footerMessage);
  }
}

module.exports = NotificationService;
