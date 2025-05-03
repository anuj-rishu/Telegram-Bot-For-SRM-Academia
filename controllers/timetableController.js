const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

function findAttendanceForSlot(slot, att) {
  return att?.find(
    (c) =>
      (c.courseTitle === slot.name || c.courseTitle === slot.courseTitle) &&
      (c.category === slot.courseType || c.category === slot.category)
  );
}

const attendanceCache = new Map();
const CACHE_TIME = 5 * 60 * 1000;

const formatClassSlot = (s) =>
  `⏰ *${s.startTime} - ${s.endTime}*\n` +
  `📚 *${s.name || s.courseTitle}* _(${s.courseType || s.category})_\n` +
  `🏛️ Room: *${s.roomNo || "N/A"}*\n`;

const formatClassSlotWithAttendance = (slot, att) => {
  const c = findAttendanceForSlot(slot, att);
  if (!c) return formatClassSlot(slot);
  const p = +c.attendancePercentage || 0,
    t = +c.hoursConducted || 0,
    a = +c.hoursAbsent || 0,
    pr = t - a;
  const e = p >= 90 ? "🟢" : p >= 75 ? "🟡" : p >= 60 ? "🟠" : "🔴";
  let m =
    formatClassSlot(slot) +
    `\n${e} *Attendance: ${p}%*\n` +
    `╰┈➤ ✅ Present: *${pr}/${t}*\n` +
    `╰┈➤ ❌ Absent: *${a}*\n`;
  m +=
    p >= 75
      ? `╰┈➤ 🎯 *Can skip:* _${Math.max(
          0,
          pr > 0 ? Math.floor(pr / 0.75 - t) : 0
        )} more class(es)_\n`
      : `╰┈➤ 📌 *Need to attend:* _${Math.max(
          1,
          t > 0 ? Math.ceil((0.75 * t - pr) / 0.25) : 1
        )} more class(es)_\n`;
  return m;
};

const removeConsecutiveLines = (msg) =>
  msg.replace(/(━━━━━━━━━━━━\n){2,}/g, "");

const createLoaderAnimation = async (ctx, txt) => {
  const f = ["⏳", "⌛️"],
    msg = await ctx.reply(`${f[0]} ${txt}`);
  let i = 0,
    id = setInterval(() => {
      i = (i + 1) % f.length;
      ctx.telegram
        .editMessageText(
          ctx.chat.id,
          msg.message_id,
          undefined,
          `${f[i]} ${txt}`
        )
        .catch(() => clearInterval(id));
    }, 800);
  return { messageId: msg.message_id, stop: () => clearInterval(id) };
};

const fetchAttendanceData = async (session) => {
  const k = session.token,
    now = Date.now(),
    c = attendanceCache.get(k);
  if (c && now - c.timestamp < CACHE_TIME) return c.data;
  try {
    const r = await apiService.makeAuthenticatedRequest("/attendance", session);
    const d = r.data?.attendance || [];
    attendanceCache.set(k, { data: d, timestamp: now });
    return d;
  } catch {
    return [];
  }
};

const handleTimetableGeneric = async (
  ctx,
  endpoint,
  title,
  noClassMsg,
  includeAttendance = false
) => {
  const session = sessionManager.getSession(ctx.from.id);
  if (!session?.token) return ctx.reply("🔒 Please login first using /login.");
  const loader = await createLoaderAnimation(
    ctx,
    `Fetching ${title.toLowerCase()}...`
  );
  try {
    const [tr, att] = await Promise.all([
      apiService.makeAuthenticatedRequest(endpoint, session),
      includeAttendance ? fetchAttendanceData(session) : [],
    ]);
    loader.stop();
    const d = tr.data,
      fn = includeAttendance
        ? (s) => formatClassSlotWithAttendance(s, att)
        : formatClassSlot;
    let msg = `*${title}*\n${
      d.dayOrder && d.dayOrder !== "-" ? `📅 Day Order: *${d.dayOrder}*\n` : ""
    }\n`;
    msg += d.classes?.length
      ? d.classes.map(fn).join("\n")
      : `✨ ${noClassMsg}`;
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      msg,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    loader.stop();
    ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error: ${e.response?.data?.error || e.message || "Unknown error"}`
    );
  }
};

const handleTimetable = async (ctx, includeAttendance = false) => {
  const session = sessionManager.getSession(ctx.from.id);
  if (!session?.token) return ctx.reply("🔒 Please login first using /login.");
  const loader = await createLoaderAnimation(
    ctx,
    "Fetching your complete timetable..."
  );
  try {
    const [tr, att] = await Promise.all([
      apiService.makeAuthenticatedRequest("/timetable", session),
      includeAttendance ? fetchAttendanceData(session) : [],
    ]);
    loader.stop();
    const d = tr.data,
      fn = includeAttendance
        ? (s) => formatClassSlotWithAttendance(s, att)
        : formatClassSlot;
    let msg = "📋 *Complete Timetable*\n\n";
    if (d?.schedule?.length) {
      for (const day of d.schedule) {
        msg += `\n📌 *Day ${day.day}*\n`;
        msg += day.table?.length
          ? day.table.map(fn).join("\n")
          : `😴 No classes scheduled\n`;
      }
    } else msg += "❌ No timetable data available.";
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      msg,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    loader.stop();
    ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error: ${e.response?.data?.error || e.message || "Unknown error"}`
    );
  }
};

const handleAttendance = async (ctx) => {
  const session = sessionManager.getSession(ctx.from.id);
  if (!session?.token) return ctx.reply("🔒 Please login first using /login.");
  const loader = await createLoaderAnimation(
    ctx,
    "Fetching your attendance data..."
  );
  try {
    const r = await apiService.makeAuthenticatedRequest("/attendance", session);
    loader.stop();
    const att = r.data?.attendance;
    if (!att?.length)
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        loader.messageId,
        undefined,
        "❌ *No attendance data available.*",
        { parse_mode: "Markdown" }
      );
    let total = 0,
      absent = 0;
    att.forEach((c) => {
      total += +c.hoursConducted || 0;
      absent += +c.hoursAbsent || 0;
    });
    const percent =
      total > 0 ? (((total - absent) / total) * 100).toFixed(2) : 0;
    const emoji =
      percent >= 90 ? "🟢" : percent >= 75 ? "🟡" : percent >= 60 ? "🟠" : "🔴";
    let msg = `📊 *YOUR ATTENDANCE SUMMARY*\n\n${emoji} *Overall: ${percent}%*\n📚 *Total Classes: ${total}*\n`;
    for (const c of att) {
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
    ctx.telegram.editMessageText(
      ctx.chat.id,
      loader.messageId,
      undefined,
      `❌ Error: ${e.response?.data?.error || e.message || "Unknown error"}`
    );
  }
};

module.exports = {
  handleTimetable,
  handleTodayTimetable: (ctx) =>
    handleTimetableGeneric(
      ctx,
      "/today-classes",
      "Today's Classes",
      "No classes scheduled for today!",
      true
    ),
  handleTomorrowTimetable: (ctx) =>
    handleTimetableGeneric(
      ctx,
      "/tomorrow-classes",
      "Tomorrow's Classes",
      "No classes scheduled for tomorrow!",
      true
    ),
  handleDayAfterTomorrowTimetable: (ctx) =>
    handleTimetableGeneric(
      ctx,
      "/day-after-tomorrow-classes",
      "Day After Tomorrow's Classes",
      "No classes scheduled for day after tomorrow!",
      true
    ),
  handleTimetableWithAttendance: (ctx) => handleTimetable(ctx, true),
  handleAttendance,
};
