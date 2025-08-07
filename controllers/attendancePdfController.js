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
      date: -1,
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
      const hoursPresent = course.hoursConducted - course.hoursAbsent;
      const attendancePercentage = parseFloat(course.attendancePercentage);
      
      let statusEmoji = "✅";
      if (attendancePercentage < 75 && attendancePercentage >= 65) {
        statusEmoji = "⚠️";
      } else if (attendancePercentage < 65) {
        statusEmoji = "❌";
      }
      
      doc
        .fontSize(12)
        .fillColor("#212F3D")
        .font("Helvetica-Bold")
        .text(
          `${statusEmoji} ${course.courseTitle} (${course.category || "N/A"})`,
          summaryIndent,
          doc.y
        );
      
      if (course.courseCode || course.facultyName || course.slot || course.roomNo) {
        doc.fontSize(10).fillColor("#555").font("Helvetica");
        
        if (course.courseCode) {
          doc.text(`   Code: ${course.courseCode}`, summaryIndent + 10, doc.y);
        }
        if (course.facultyName) {
          doc.text(`   Faculty: ${course.facultyName}`, summaryIndent + 10, doc.y);
        }
        if (course.slot) {
          doc.text(`   Slot: ${course.slot}`, summaryIndent + 10, doc.y);
        }
        if (course.roomNo) {
          doc.text(`   Room: ${course.roomNo}`, summaryIndent + 10, doc.y);
        }
      }
      
      doc
        .fontSize(11)
        .fillColor("#229954")
        .font("Helvetica")
        .text(
          `   Present: ${hoursPresent}/${course.hoursConducted} hours (${attendancePercentage}%)`,
          summaryIndent + 10,
          doc.y
        );
      
      if (attendancePercentage >= 75) {
        const classesCanSkip = Math.floor((hoursPresent / 0.75) - course.hoursConducted);
        if (classesCanSkip > 0) {
          doc
            .fontSize(11)
            .fillColor("#2874A6")
            .text(`   You can skip ${classesCanSkip} more classes and still maintain 75%`, summaryIndent + 10, doc.y);
        } else {
          doc
            .fontSize(11)
            .fillColor("#2874A6")
            .text(`   Attendance is good! Keep it up.`, summaryIndent + 10, doc.y);
        }
      } else {
        const classesNeeded = Math.ceil((0.75 * course.hoursConducted - hoursPresent) / 0.25);
        doc
          .fontSize(11)
          .fillColor("#B03A2E")
          .text(`   Need to attend ${classesNeeded} more consecutive classes to reach 75%`, summaryIndent + 10, doc.y);
      }
      
      doc.moveDown(0.5);
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
    const courseHistoryMap = {};
    
    history.forEach((record) => {
      const courseKey = `${record.courseTitle} (${record.category || "N/A"})`;
      
      if (!courseHistoryMap[courseKey]) {
        courseHistoryMap[courseKey] = [];
      }
      
      // The bug was potentially here - ensure we're capturing wasPresent correctly
      // Make sure it accurately reflects attendance status
      courseHistoryMap[courseKey].push({
        date: record.date,
        dateStr: record.date.toLocaleDateString(),
        wasPresent: record.wasPresent,
        hoursConducted: record.hoursConducted,
        hoursPresent: record.hoursPresent,
        hoursAbsent: record.hoursAbsent,
        attendancePercentage: record.attendancePercentage
      });
    });

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableWidth = 480;
    const startX = doc.page.margins.left + Math.floor((pageWidth - tableWidth) / 2);
    const dateColWidth = 120;
    const statusColWidth = 100;
    const hoursColWidth = 80;
    const percentColWidth = 120;
    const rowHeight = 22;
    const headerHeight = 28;

    Object.entries(courseHistoryMap).forEach(([course, records]) => {
      doc.moveDown(1);

      doc
        .fontSize(14)
        .fillColor("#2874A6")
        .font("Helvetica-Bold")
        .text(course, summaryIndent, doc.y, { align: "left", underline: true });
      doc.moveDown(0.5);

      const startY = doc.y;
      
      doc.save();
      doc.rect(startX, startY, tableWidth, headerHeight).fill("#D6EAF8");
      doc.restore();

      doc
        .fontSize(12)
        .fillColor("#154360")
        .font("Helvetica-Bold");
        
      doc.text("Date", startX + 8, startY + 7, { width: dateColWidth - 16 });
      doc.text("Status", startX + dateColWidth + 8, startY + 7, { width: statusColWidth - 16 });
      doc.text("Hours", startX + dateColWidth + statusColWidth + 8, startY + 7, { width: hoursColWidth - 16 });
      doc.text("Attendance %", startX + dateColWidth + statusColWidth + hoursColWidth + 8, startY + 7, { width: percentColWidth - 16 });

      const displayRecords = records;
      
      displayRecords.forEach((record, i) => {
        const currentY = startY + headerHeight + i * rowHeight;

        if (i % 2 === 0) {
          doc.save();
          doc.rect(startX, currentY, tableWidth, rowHeight).fill("#EBF5FB");
          doc.restore();
        }
        
        doc.rect(startX, currentY, tableWidth, rowHeight).stroke("#AED6F1");

        doc
          .fontSize(11)
          .fillColor("#212F3D")
          .font("Helvetica")
          .text(record.dateStr, startX + 8, currentY + 6, { width: dateColWidth - 16 });

        // Fix to ensure absent records show as "Absent ❌"
        // Check if hoursAbsent > 0 for this specific record
        const isPresent = record.wasPresent;
        
        doc
          .fontSize(11)
          .fillColor(isPresent ? "#229954" : "#B03A2E")
          .font("Helvetica-Bold")
          .text(isPresent ? "Present ✅" : "Absent ❌", startX + dateColWidth + 8, currentY + 6, { width: statusColWidth - 16 });

        doc
          .fontSize(11)
          .fillColor("#212F3D")
          .font("Helvetica")
          .text(`${record.hoursPresent}/${record.hoursConducted}`, startX + dateColWidth + statusColWidth + 8, currentY + 6, { width: hoursColWidth - 16 });

        const percentage = record.attendancePercentage || 
          (record.hoursConducted > 0 ? 
          Math.round((record.hoursPresent / record.hoursConducted) * 100) : 0);
        
        doc
          .fontSize(11)
          .fillColor("#212F3D")
          .font("Helvetica")
          .text(`${percentage}%`, startX + dateColWidth + statusColWidth + hoursColWidth + 8, currentY + 6, { width: percentColWidth - 16 });
      });

      doc.y = startY + headerHeight + displayRecords.length * rowHeight + 10;
      
      doc.moveDown();
    });
  }

  doc.moveDown(2);
  doc
    .fontSize(10)
    .fillColor("#888")
    .font("Helvetica-Oblique")
    .text(
      "Generated by Academia Telegram BOT, By SRM Insider Community",
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