const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

function formatClassSlot(slot) {
  return (
    `⏰ *${slot.startTime} - ${slot.endTime}*\n` +
    `📚 ${slot.name || slot.courseTitle} (${slot.courseType || slot.category})\n` +
    `🏛 Room: ${slot.roomNo || "N/A"}\n\n`
  );
}

async function handleTimetableGeneric(ctx, endpoint, title, noClassMsg) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);
  if (!session?.token)
    return ctx.reply("You need to login first. Use /login command.");

  ctx.reply(`🔄 Fetching ${title.toLowerCase()}...`);
  await ctx.telegram.sendChatAction(ctx.chat.id, "typing"); // Add typing before API call

  try {
    const { data } = await apiService.makeAuthenticatedRequest(
      endpoint,
      session
    );
    let message = `📚 *${title}*\n\n`;

    if (data.dayOrder && data.dayOrder !== "-")
      message += `📅 Day Order: ${data.dayOrder}\n\n`;

    if (data.classes?.length) {
      message += data.classes.map(formatClassSlot).join("");
    } else {
      message += noClassMsg;
    }
    await ctx.replyWithMarkdown(message);
  } catch (error) {
    ctx.reply(
      `❌ Error fetching ${title.toLowerCase()}: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

async function handleTimetable(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);
  if (!session?.token)
    return ctx.reply("You need to login first. Use /login command.");

  ctx.reply("📊 Fetching your complete timetable...");
  await ctx.telegram.sendChatAction(ctx.chat.id, "typing"); // Add typing before API call

  try {
    const { data: timetableData } = await apiService.makeAuthenticatedRequest(
      "/timetable",
      session
    );
    let message = "📋 *Complete Timetable*\n\n";
    if (timetableData?.schedule?.length) {
      for (const daySchedule of timetableData.schedule) {
        message += `📌 *Day ${daySchedule.day}*\n`;
        if (daySchedule.table?.length) {
          message += daySchedule.table.map(formatClassSlot).join("");
        } else {
          message += `😴 No classes scheduled\n\n`;
        }
      }
    } else {
      message += "❌ No timetable data available.";
    }
    await ctx.replyWithMarkdown(message);
  } catch (error) {
    ctx.reply(
      `❌ Error fetching timetable: ${
        error.response?.data?.error || error.message || "Unknown error"
      }`
    );
  }
}

async function handleTodayTimetable(ctx) {
  return handleTimetableGeneric(
    ctx,
    "/today-classes",
    "Today's Classes",
    "🎉 No classes scheduled for today!"
  );
}

async function handleTomorrowTimetable(ctx) {
  return handleTimetableGeneric(
    ctx,
    "/tomorrow-classes",
    "Tomorrow's Classes",
    "🎉 No classes scheduled for tomorrow!"
  );
}

async function handleDayAfterTomorrowTimetable(ctx) {
  return handleTimetableGeneric(
    ctx,
    "/day-after-tomorrow-classes",
    "Day After Tomorrow's Classes",
    "🎉 No classes scheduled for day after tomorrow!"
  );
}

module.exports = {
  handleTimetable,
  handleTodayTimetable,
  handleTomorrowTimetable,
  handleDayAfterTomorrowTimetable,
};