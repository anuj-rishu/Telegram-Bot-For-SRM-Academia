const PDFDocument = require("pdfkit");
const stream = require("stream");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const AttendanceHistory = require("../model/attendanceHistory");
const { createLoader } = require("../utils/loader");
const User = require("../model/user");

async function handleAttendancePdf(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session?.token) return ctx.reply("🔒 Please login first using /login.");

  const loader = await createLoader(
    ctx,
    "Generating your attendance report..."
  );
  let attendanceArr = [];

  try {
    const response = await apiService.makeAuthenticatedRequest(
      "/attendance",
      session
    );
    attendanceArr = response.data?.attendance || [];
  } catch (e) {
    await loader.clear();
    return ctx.reply("❌ Error fetching attendance data.");
  }

  let history = [];
  try {
    history = await AttendanceHistory.find({ telegramId: userId }).sort({
      date: 1,
    });
  } catch (e) {}

  let userName = "";
  try {
    const user = await User.findOne({ telegramId: userId });
    userName = user?.name || "";
  } catch (e) {
    userName = "";
  }

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const passThroughStream = new stream.PassThrough();
  const chunks = [];

  doc.pipe(passThroughStream);

  doc.rect(0, 0, doc.page.width, 60).fill("#2E86C1");
  doc
    .fillColor("white")
    .fontSize(28)
    .font("Helvetica-Bold")
    .text("Attendance Report", 0, 15, { align: "center" });
  doc.fillColor("black").font("Helvetica");
  doc.moveDown(2);

  const headerIndent = doc.page.margins.left + 20;
  doc
    .fontSize(12)
    .fillColor("#555")
    .text(`Generated for: ${userName}`, headerIndent, doc.y, { align: "left" });
  doc.text(`Date: ${new Date().toLocaleString()}`, headerIndent, doc.y, {
    align: "left",
  });
  doc.moveDown(1);

  doc
    .moveTo(40, doc.y)
    .lineTo(doc.page.width - 40, doc.y)
    .stroke("#2E86C1");
  doc.moveDown(1);

  doc
    .fontSize(16)
    .fillColor("#154360")
    .font("Helvetica-Bold")
    .text("Current Attendance Summary", headerIndent, doc.y, {
      align: "left",
      underline: true,
    });
  doc.moveDown(0.5);

  const summaryIndent = doc.page.margins.left + 40;

  if (attendanceArr.length === 0) {
    doc
      .fontSize(12)
      .fillColor("#B03A2E")
      .text("No attendance data available.", summaryIndent);
  } else {
    attendanceArr.forEach((course) => {
      doc
        .fontSize(12)
        .fillColor("#212F3D")
        .font("Helvetica")
        .text(
          `${course.courseTitle} (${course.category || "N/A"}): `,
          summaryIndent,
          doc.y,
          { continued: true }
        )
        .fillColor("#229954")
        .font("Helvetica-Bold")
        .text(
          `${course.hoursConducted - course.hoursAbsent}/${
            course.hoursConducted
          } Present `,
          { continued: true }
        )
        .fillColor("#2874A6")
        .text(`(${course.attendancePercentage}%)`);
    });
  }

  doc.moveDown(1);

  doc
    .moveTo(40, doc.y)
    .lineTo(doc.page.width - 40, doc.y)
    .stroke("#2E86C1");
  doc.moveDown(1);

  doc
    .fontSize(16)
    .fillColor("#154360")
    .font("Helvetica-Bold")
    .text("Attendance History", headerIndent, doc.y, {
      align: "left",
      underline: true,
    });
  doc.moveDown(0.5);

  if (history.length === 0) {
    doc
      .fontSize(12)
      .fillColor("#B03A2E")
      .text("No attendance history available.", summaryIndent);
  } else {
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

    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableWidth = 440;
    const startX =
      doc.page.margins.left + Math.floor((pageWidth - tableWidth) / 2);
    const colWidth = 220;
    const rowHeight = 22;
    const headerHeight = 28;

    Object.entries(grouped).forEach(([course, dates]) => {
      doc.moveDown(1);

      doc
        .fontSize(14)
        .fillColor("#2874A6")
        .font("Helvetica-Bold")
        .text(course, summaryIndent, doc.y, { align: "left", underline: true });
      doc.moveDown(0.3);

      const startY = doc.y;

      doc.save();
      doc.rect(startX, startY, colWidth, headerHeight).fill("#D6EAF8");
      doc
        .rect(startX + colWidth, startY, colWidth, headerHeight)
        .fill("#FADBD8");
      doc.restore();

      doc
        .fontSize(12)
        .fillColor("#154360")
        .font("Helvetica-Bold")
        .text("Present Dates", startX + 8, startY + 7, {
          width: colWidth - 16,
        });
      doc.text("Absent Dates", startX + colWidth + 8, startY + 7, {
        width: colWidth - 16,
      });

      const maxRows = Math.max(dates.present.length, dates.absent.length);
      const maxRowsToShow = Math.max(1, maxRows);

      for (let i = 0; i < maxRowsToShow; i++) {
        const currentY = startY + headerHeight + i * rowHeight;

        if (i % 2 === 0) {
          doc.save();
          doc.rect(startX, currentY, colWidth, rowHeight).fill("#EBF5FB");
          doc
            .rect(startX + colWidth, currentY, colWidth, rowHeight)
            .fill("#FDEDEC");
          doc.restore();
        }

        doc.rect(startX, currentY, colWidth, rowHeight).stroke("#AED6F1");
        doc
          .rect(startX + colWidth, currentY, colWidth, rowHeight)
          .stroke("#F5B7B1");

        const presentDate = dates.present[i] || "";
        doc
          .fontSize(11)
          .fillColor("#229954")
          .font("Helvetica")
          .text(presentDate || "None", startX + 8, currentY + 6, {
            width: colWidth - 16,
          });

        const absentDate = dates.absent[i] || "";
        doc
          .fontSize(11)
          .fillColor("#B03A2E")
          .font("Helvetica")
          .text(absentDate || "None", startX + colWidth + 8, currentY + 6, {
            width: colWidth - 16,
          });
      }

      doc.y = startY + headerHeight + maxRowsToShow * rowHeight + 10;
      doc.moveDown();
    });
  }

  doc.moveDown(2);
  doc
    .fontSize(10)
    .fillColor("#888")
    .font("Helvetica-Oblique")
    .text(
      " Genrated by Academia Telegram BOT, By SRM Insider Community ",
      0,
      doc.page.height - 60,
      {
        align: "center",
      }
    );

  doc.end();

  passThroughStream.on("data", (chunk) => chunks.push(chunk));
  passThroughStream.on("end", async () => {
    const buffer = Buffer.concat(chunks);
    await loader.clear();

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
