const PDFDocument = require("pdfkit");
const stream = require("stream");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const AttendanceHistory = require("../model/attendanceHistory");

async function handleAttendancePdf(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);
  if (!session?.token) return ctx.reply("🔒 Please login first using /login.");

  let attendanceArr = [];
  try {
    const response = await apiService.makeAuthenticatedRequest(
      "/attendance",
      session
    );
    attendanceArr = response.data?.attendance || [];
  } catch (e) {
    return ctx.reply("❌ Error fetching attendance data.");
  }

  // Fetch attendance history for user
  let history = [];
  try {
    history = await AttendanceHistory.find({ telegramId: userId }).sort({
      date: 1,
    });
  } catch (e) {
    // ignore
  }

  // Generate PDF
  const doc = new PDFDocument({ margin: 40 });
  const passThroughStream = new stream.PassThrough();
  const chunks = [];

  doc.pipe(passThroughStream);

  doc.fontSize(20).text("Attendance Report", { align: "center" });
  doc.moveDown();

  doc
    .fontSize(14)
    .text(`Generated for Telegram ID: ${userId}`, { align: "left" });
  doc.moveDown();

  doc.fontSize(16).text("Current Attendance Summary:", { underline: true });
  doc.moveDown(0.5);

  if (attendanceArr.length === 0) {
    doc.fontSize(12).text("No attendance data available.");
  } else {
    attendanceArr.forEach((course) => {
      doc
        .fontSize(12)
        .text(
          `${course.courseTitle} (${course.category || "N/A"}): ${
            course.hoursConducted - course.hoursAbsent
          }/${course.hoursConducted} Present (${course.attendancePercentage}%)`
        );
    });
  }

  doc.moveDown();
  doc
    .fontSize(16)
    .text("Attendance History (Dates of Present/Absent):", { underline: true });
  doc.moveDown(0.5);

  if (history.length === 0) {
    doc.fontSize(12).text("No attendance history available.");
  } else {
    // Group by courseTitle + category
    const grouped = {};
    history.forEach((record) => {
      const key = `${record.courseTitle} (${record.category || "N/A"})`;
      if (!grouped[key]) {
        grouped[key] = { present: [], absent: [] };
      }
      const dateStr = record.date.toLocaleDateString();
      if (record.wasPresent) {
        grouped[key].present.push(dateStr);
      } else {
        grouped[key].absent.push(dateStr);
      }
    });

    doc.fontSize(12);
    Object.entries(grouped).forEach(([course, dates]) => {
      doc.text(course, { underline: true });
      doc.text(
        `  Present Dates: ${
          dates.present.length ? dates.present.join(", ") : "None"
        }`
      );
      doc.text(
        `  Absent Dates: ${
          dates.absent.length ? dates.absent.join(", ") : "None"
        }`
      );
      doc.moveDown(0.5);
    });
  }

  doc.end();

  passThroughStream.on("data", (chunk) => chunks.push(chunk));
  passThroughStream.on("end", async () => {
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      return ctx.reply("❌ Error generating PDF. Please try again.");
    }
    await ctx.replyWithDocument({
      source: buffer,
      filename: "AttendanceReport.pdf",
    });
  });
}

module.exports = {
  handleAttendancePdf,
};
