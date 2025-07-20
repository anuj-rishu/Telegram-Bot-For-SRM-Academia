const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");
const { createLoader } = require("../utils/loader");

function findAttendanceForSlot(slot, attendance) {
  return attendance?.find(
    (c) =>
      (c.courseTitle === slot.name || c.courseTitle === slot.courseTitle) &&
      (c.category === slot.courseType || c.category === slot.category)
  );
}

const attendanceCache = new Map();
const CACHE_TIME = 5 * 60 * 1000;

function formatClassSlot(slot) {
  return (
    `⏰ *${slot.startTime} - ${slot.endTime}*\n` +
    `📚 *${slot.name || slot.courseTitle}* _(${
      slot.courseType || slot.category
    })_\n` +
    `🏛️ Room: *${slot.roomNo || "N/A"}*\n`
  );
}

function formatClassSlotWithAttendance(slot, attendance) {
  const course = findAttendanceForSlot(slot, attendance);
  if (!course) return formatClassSlot(slot);

  const percent = +course.attendancePercentage || 0;
  const total = +course.hoursConducted || 0;
  const absent = +course.hoursAbsent || 0;
  const present = total - absent;
  const emoji =
    percent >= 90 ? "🟢" : percent >= 75 ? "🟡" : percent >= 60 ? "🟠" : "🔴";

  let msg =
    formatClassSlot(slot) +
    `\n${emoji} *Attendance: ${percent}%*\n` +
    `╰┈➤ ✅ Present: *${present}/${total}*\n` +
    `╰┈➤ ❌ Absent: *${absent}*\n`;

  msg +=
    percent >= 75
      ? `╰┈➤ 🎯 *Can skip:* _${Math.max(
          0,
          present > 0 ? Math.floor(present / 0.75 - total) : 0
        )} more class(es)_\n`
      : `╰┈➤ 📌 *Need to attend:* _${Math.max(
          1,
          total > 0 ? Math.ceil((0.75 * total - present) / 0.25) : 1
        )} more class(es)_\n`;

  return msg;
}

async function fetchAttendanceData(session) {
  const key = session.token;
  const now = Date.now();
  const cached = attendanceCache.get(key);

  if (cached && now - cached.timestamp < CACHE_TIME) return cached.data;

  try {
    const response = await apiService.makeAuthenticatedRequest(
      "/attendance",
      session
    );
    const data = response.data?.attendance || [];
    attendanceCache.set(key, { data, timestamp: now });
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      logger.error("Timetable attendance fetch error:", error.message || error);
    }
    return [];
  }
}

async function handleTimetable(ctx, includeAttendance = false) {
  const session = sessionManager.getSession(ctx.from.id);
  if (!session?.token) return ctx.reply("🔒 Please login first using /login.");

  const loaderPromise = createLoader(
    ctx,
    "Fetching your complete timetable..."
  );
  const apiPromise = apiService.makeAuthenticatedRequest("/timetable", session);
  const attendancePromise = includeAttendance
    ? fetchAttendanceData(session)
    : Promise.resolve([]);

  const [loader, apiResponse, attendance] = await Promise.all([
    loaderPromise,
    apiPromise,
    attendancePromise,
  ]);

  try {
    loader.stop();
    const data = apiResponse.data;
    const formatFn = includeAttendance
      ? (slot) => formatClassSlotWithAttendance(slot, attendance)
      : formatClassSlot;

    let msg = "📋 *Complete Timetable*\n\n";
    if (data?.schedule?.length) {
      for (const day of data.schedule) {
        msg += `\n📌 *Day ${day.day}*\n`;
        msg += day.table?.length
          ? day.table.map(formatFn).join("\n")
          : `😴 No classes scheduled\n`;
      }
    } else {
      msg += "❌ No timetable data available.";
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      msg,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    loader.stop();
    if (process.env.NODE_ENV === "production") {
      logger.error("Timetable fetch error:", e.message || e);
    }
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error: ${e.response?.data?.error || e.message || "Unknown error"}`
    );
  }
}

async function handleAttendance(ctx) {
  const session = sessionManager.getSession(ctx.from.id);
  if (!session?.token) return ctx.reply("🔒 Please login first using /login.");

  const loader = await createLoader(ctx, "Fetching your attendance data...");
  try {
    const response = await apiService.makeAuthenticatedRequest(
      "/attendance",
      session
    );
    loader.stop();
    const attendance = response.data?.attendance;
    if (!attendance?.length) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.messageId,
        undefined,
        "❌ *No attendance data available.*",
        { parse_mode: "Markdown" }
      );
    }

    let total = 0,
      absent = 0;
    attendance.forEach((c) => {
      total += +c.hoursConducted || 0;
      absent += +c.hoursAbsent || 0;
    });
    const percent =
      total > 0 ? (((total - absent) / total) * 100).toFixed(2) : 0;
    const emoji =
      percent >= 90 ? "🟢" : percent >= 75 ? "🟡" : percent >= 60 ? "🟠" : "🔴";

    let msg = `📊 *YOUR ATTENDANCE SUMMARY*\n\n${emoji} *Overall: ${percent}%*\n📚 *Total Classes: ${total}*\n`;
    for (const c of attendance) {
      const t = +c.hoursConducted || 0,
        a = +c.hoursAbsent || 0,
        p = t - a,
        per = +c.attendancePercentage || 0;
      const e = per >= 90 ? "🟢" : per >= 75 ? "🟡" : per >= 60 ? "🟠" : "🔴";
      const ce = c.category === "Theory" ? "📖" : "🧪";
      msg += `\n${ce} *${c.courseTitle || "Unknown Course"}* _(${
        c.category || "Unknown"
      })_\n${e} *Attendance: ${per}%*\n╰┈➤ ✅ Present: *${p}/${t}*\n╰┈➤ ❌ Absent: *${a}*\n`;
      msg +=
        per >= 75
          ? `╰┈➤ 🎯 *Can skip:* _${Math.max(
              0,
              p > 0 ? Math.floor(p / 0.75 - t) : 0
            )} more class(es)_\n`
          : `╰┈➤ 📌 *Need to attend:* _${Math.max(
              1,
              t > 0 ? Math.ceil((0.75 * t - p) / 0.25) : 1
            )} more class(es)_\n`;
    }
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      msg,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    loader.stop();
    if (process.env.NODE_ENV === "production") {
      logger.error("Attendance fetch error:", e.message || e);
    }
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error: ${e.response?.data?.error || e.message || "Unknown error"}`
    );
  }
}

module.exports = {
  handleTimetable,
  handleTimetableWithAttendance: (ctx) => handleTimetable(ctx, true),
  handleAttendance,
};