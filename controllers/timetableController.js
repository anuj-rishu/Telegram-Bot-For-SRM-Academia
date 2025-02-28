const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

/**
 * Handle timetable command
 * @param {Object} ctx - Telegraf context
 */
async function handleTimetable(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  try {
    ctx.reply("Fetching your timetable...");

    const response = await apiService.makeAuthenticatedRequest(
      "/timetable",
      session
    );
    const timetableData = response.data;

    const dayNames = {
      1: "Monday",
      2: "Tuesday",
      3: "Wednesday",
      4: "Thursday",
      5: "Friday",
      6: "Saturday",
      7: "Sunday",
    };

    const timeSlots = [
      "8:00-8:50",
      "8:50-9:40",
      "9:50-10:40",
      "10:40-11:30",
      "11:40-12:30",
      "12:30-1:20",
      "2:00-2:50",
      "2:50-3:40",
      "3:50-4:40",
      "4:40-5:30",
    ];

    let message = "🗓 *Your Timetable*\n\n";

    if (timetableData.regNumber) {
      message += `*Registration Number:* ${timetableData.regNumber}\n`;
      message += `*Batch:* ${timetableData.batch}\n\n`;
    }

    if (
      timetableData &&
      timetableData.schedule &&
      timetableData.schedule.length > 0
    ) {
      timetableData.schedule.forEach((daySchedule) => {
        const dayName = dayNames[daySchedule.day] || `Day ${daySchedule.day}`;
        message += `*${dayName}*:\n`;

        let hasClasses = false;

        daySchedule.table.forEach((slot, index) => {
          if (slot) {
            hasClasses = true;
            message += `- ${timeSlots[index]}: ${slot.name} (${slot.code}) | ${slot.roomNo} | ${slot.courseType}\n`;
          }
        });

        if (!hasClasses) {
          message += `- No classes scheduled\n`;
        }

        message += "\n";
      });
    } else {
      message += "No timetable data available.";
    }

    ctx.replyWithMarkdown(message);

    if (
      timetableData &&
      timetableData.schedule &&
      timetableData.schedule.length > 3
    ) {
      const today = new Date().getDay();
      const mappedToday = today === 0 ? 7 : today;

      const todaySchedule = timetableData.schedule.find(
        (day) => day.day === mappedToday
      );

      if (todaySchedule) {
        setTimeout(() => {
          ctx.reply(
            "Would you like to see just today's classes? Use /today command."
          );
        }, 1000);
      }
    }
  } catch (error) {
    console.error("Timetable error:", error.response?.data || error.message);
    ctx.reply(
      `Error fetching timetable: ${
        error.response?.data?.error || error.message
      }`
    );
  }
}

/**
 * Handle today's timetable command
 * @param {Object} ctx - Telegraf context
 */
async function handleTodayTimetable(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  try {
    ctx.reply("Fetching today's classes...");

    const response = await apiService.makeAuthenticatedRequest(
      "/timetable",
      session
    );
    const timetableData = response.data;

    const dayNames = {
      1: "Monday",
      2: "Tuesday",
      3: "Wednesday",
      4: "Thursday",
      5: "Friday",
      6: "Saturday",
      7: "Sunday",
    };

    const timeSlots = [
      "8:00-8:50",
      "8:50-9:40",
      "9:50-10:40",
      "10:40-11:30",
      "11:40-12:30",
      "12:30-1:20",
      "2:00-2:50",
      "2:50-3:40",
      "3:50-4:40",
      "4:40-5:30",
    ];

    const today = new Date().getDay();
    const mappedToday = today === 0 ? 7 : today;

    const dayName = dayNames[mappedToday];
    let message = `📚 *Today's Classes (${dayName})*\n\n`;

    if (timetableData && timetableData.schedule) {
      const todaySchedule = timetableData.schedule.find(
        (day) => day.day === mappedToday
      );

      if (todaySchedule) {
        let hasClasses = false;

        todaySchedule.table.forEach((slot, index) => {
          if (slot) {
            hasClasses = true;
            message += `- ${timeSlots[index]}: ${slot.name} (${slot.code}) | ${slot.roomNo} | ${slot.courseType}\n`;
          }
        });

        if (!hasClasses) {
          message += `No classes scheduled for today!\n`;
        }
      } else {
        message += `No timetable found for today (${dayName}).\n`;
      }
    } else {
      message += "No timetable data available.";
    }

    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error(
      "Today's timetable error:",
      error.response?.data || error.message
    );
    ctx.reply(
      `Error fetching today's timetable: ${
        error.response?.data?.error || error.message
      }`
    );
  }
}

module.exports = {
  handleTimetable,
  handleTodayTimetable,
};
