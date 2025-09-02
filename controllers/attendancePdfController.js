const PDFDocument = require("pdfkit");
const stream = require("stream");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const AttendanceHistory = require("../model/attendanceHistory");
const { createLoader } = require("../utils/loader");
const User = require("../model/user");
const { requireAuth } = require("../utils/authUtils");

async function handleAttendancePdf(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }

  const loader = await createLoader(ctx, "Generating your attendance report...");
  let attendanceArr = [];

  try {
    const response = await apiService.makeAuthenticatedRequest("/attendance", session);
    attendanceArr = response.data?.attendance || [];
  } catch (e) {
    await loader.clear();
    return ctx.reply("❌ Error fetching attendance data.");
  }

  let history = [];
  try {
    history = await AttendanceHistory.find({ telegramId: userId }).sort({ date: -1 });
  } catch (e) {
    history = [];
  }

  let userName = "";
  try {
    const user = await User.findOne({ telegramId: userId });
    userName = user?.name || "";
  } catch (e) {
    userName = "";
  }

  const doc = new PDFDocument({ margin: 40, size: "A4", autoFirstPage: true });
  const passThroughStream = new stream.PassThrough();
  const chunks = [];
  doc.pipe(passThroughStream);

  doc.rect(0, 0, doc.page.width, 60).fill("#2E86C1");
  doc.fillColor("white").fontSize(28).font("Helvetica-Bold")
    .text("Attendance Report", 0, 15, { align: "center" });
  doc.fillColor("black").font("Helvetica");
  doc.moveDown(2);

  const headerIndent = doc.page.margins.left + 20;
  doc.fontSize(12).fillColor("#555")
    .text(`Generated for: ${userName}`, headerIndent, doc.y, { align: "left" });
  doc.text(`Date: ${new Date().toLocaleString()}`, headerIndent, doc.y, { align: "left" });
  doc.moveDown(1);

  doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke("#2E86C1");
  doc.moveDown(1);

  doc.fontSize(16).fillColor("#154360").font("Helvetica-Bold")
    .text("Current Attendance Summary", headerIndent, doc.y, { align: "left", underline: true });
  doc.moveDown(0.5);

  const summaryIndent = doc.page.margins.left + 40;
  if (attendanceArr.length === 0) {
    doc.fontSize(12).fillColor("#B03A2E").text("No attendance data available.", summaryIndent);
  } else {
    attendanceArr.forEach((course) => {
      const hoursPresent = course.hoursConducted - course.hoursAbsent;
      const attendancePercentage = parseFloat(course.attendancePercentage);

      let statusEmoji = "✅";
      if (attendancePercentage < 75 && attendancePercentage >= 65) statusEmoji = "⚠️";
      else if (attendancePercentage < 65) statusEmoji = "❌";

      doc.fontSize(12).fillColor("#212F3D").font("Helvetica-Bold")
        .text(`${statusEmoji} ${course.courseTitle} (${course.category || "N/A"})`, summaryIndent, doc.y);

      if (course.courseCode || course.facultyName || course.slot || course.roomNo) {
        doc.fontSize(10).fillColor("#555").font("Helvetica");
        if (course.courseCode) doc.text(`   Code: ${course.courseCode}`, summaryIndent + 10, doc.y);
        if (course.facultyName) doc.text(`   Faculty: ${course.facultyName}`, summaryIndent + 10, doc.y);
        if (course.slot) doc.text(`   Slot: ${course.slot}`, summaryIndent + 10, doc.y);
        if (course.roomNo) doc.text(`   Room: ${course.roomNo}`, summaryIndent + 10, doc.y);
      }

      doc.fontSize(11).fillColor("#229954").font("Helvetica")
        .text(`   Present: ${hoursPresent}/${course.hoursConducted} hours (${attendancePercentage}%)`, summaryIndent + 10, doc.y);

      if (attendancePercentage >= 75) {
        const classesCanSkip = Math.floor(hoursPresent / 0.75 - course.hoursConducted);
        if (classesCanSkip > 0) {
          doc.fontSize(11).fillColor("#2874A6")
            .text(`   You can skip ${classesCanSkip} more classes and still maintain 75%`, summaryIndent + 10, doc.y);
        } else {
          doc.fontSize(11).fillColor("#2874A6")
            .text(`   Attendance is good! Keep it up.`, summaryIndent + 10, doc.y);
        }
      } else {
        const classesNeeded = Math.ceil((0.75 * course.hoursConducted - hoursPresent) / 0.25);
        doc.fontSize(11).fillColor("#B03A2E")
          .text(`   Need to attend ${classesNeeded} more consecutive classes to reach 75%`, summaryIndent + 10, doc.y);
      }

      doc.moveDown(0.5);
    });
  }

  doc.moveDown(1);
  doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke("#2E86C1");
  doc.moveDown(1);

  doc.fontSize(16).fillColor("#154360").font("Helvetica-Bold")
    .text("Attendance History", headerIndent, doc.y, { align: "left", underline: true });
  doc.moveDown(0.5);

  if (history.length === 0) {
    doc.fontSize(12).fillColor("#B03A2E").text("No attendance history available.", summaryIndent);
  } else {
    const courseHistoryMap = {};
    history.forEach((record) => {
      const courseKey = `${record.courseTitle} (${record.category || "N/A"})`;
      if (!courseHistoryMap[courseKey]) courseHistoryMap[courseKey] = [];
      courseHistoryMap[courseKey].push(record);
    });

    const pageInnerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tableWidth = Math.min(520, pageInnerWidth - 20);
    const startX = doc.page.margins.left + Math.floor((pageInnerWidth - tableWidth) / 2);
    const dateColWidth = 110;
    const statusColWidth = 100;
    const hoursColWidth = 100;
    const percentColWidth = tableWidth - (dateColWidth + statusColWidth + hoursColWidth);
    const rowHeight = 24;
    const headerHeight = 30;
    const footerReserve = 80;

    function ensureSpace(requiredHeight, courseTitle, continued = false) {
      const bottomLimit = doc.page.height - doc.page.margins.bottom - footerReserve;
      if (doc.y + requiredHeight > bottomLimit) {
        doc.addPage();
        doc.y = doc.page.margins.top + 20;
        if (courseTitle) {
          doc.fontSize(14).fillColor("#2874A6").font("Helvetica-Bold")
            .text(`${courseTitle}${continued ? " (continued)" : ""}`, summaryIndent, doc.y, { align: "left" });
          doc.moveDown(0.5);
        }
        return true;
      }
      return false;
    }

    function drawTableHeader() {
      const headerY = doc.y;
      doc.save();
      doc.rect(startX, headerY, tableWidth, headerHeight).fill("#D6EAF8");
      doc.restore();

      doc.fontSize(12).fillColor("#154360").font("Helvetica-Bold");
      doc.text("Date", startX + 8, headerY + 7, { width: dateColWidth - 16 });
      doc.text("Status", startX + dateColWidth + 8, headerY + 7, { width: statusColWidth - 16 });
      doc.text("Hours", startX + dateColWidth + statusColWidth + 8, headerY + 7, { width: hoursColWidth - 16 });
      doc.text("Attendance %", startX + dateColWidth + statusColWidth + hoursColWidth + 8, headerY + 7, { width: percentColWidth - 16 });

      doc.y = headerY + headerHeight + 6;
    }

    function drawTableRow(record, rowIndex) {
      const currentY = doc.y;
      if (rowIndex % 2 === 0) {
        doc.save();
        doc.rect(startX, currentY, tableWidth, rowHeight).fill("#EBF5FB");
        doc.restore();
      }

      doc.rect(startX, currentY, tableWidth, rowHeight).stroke("#AED6F1");

      let dateStr = "Invalid Date";
      try {
        dateStr = new Date(record.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
      } catch (e) {}

      doc.fontSize(11).fillColor("#212F3D").font("Helvetica")
        .text(dateStr, startX + 8, currentY + 6, { width: dateColWidth - 16 });

      const isPresent = record.wasPresent;
      doc.fontSize(11).fillColor(isPresent ? "#229954" : "#B03A2E").font("Helvetica-Bold")
        .text(isPresent ? "Present ✅" : "Absent ❌", startX + dateColWidth + 8, currentY + 6, { width: statusColWidth - 16 });

      doc.fontSize(11).fillColor("#212F3D").font("Helvetica")
        .text(`${record.hoursPresent}/${record.hoursConducted}`, startX + dateColWidth + statusColWidth + 8, currentY + 6, { width: hoursColWidth - 16 });

      const percentage = record.attendancePercentage || (record.hoursConducted > 0 ? Math.round((record.hoursPresent / record.hoursConducted) * 100) : 0);
      doc.fontSize(11).fillColor("#212F3D").font("Helvetica")
        .text(`${percentage}%`, startX + dateColWidth + statusColWidth + hoursColWidth + 8, currentY + 6, { width: percentColWidth - 16 });

      doc.y = currentY + rowHeight + 4;
    }

    Object.entries(courseHistoryMap).forEach(([course, records]) => {
      ensureSpace(40);

      records.sort((a, b) => new Date(b.date) - new Date(a.date));

      const uniqueRecords = [];
      const dateMap = {};
      records.forEach((record) => {
        const dateKey = new Date(record.date).toISOString().split("T")[0];
        const createdAt = record.createdAt ? new Date(record.createdAt).getTime() : 0;
        if (!dateMap[dateKey] || createdAt > (dateMap[dateKey].createdAt || 0)) {
          if (dateMap[dateKey]) {
            const idx = uniqueRecords.findIndex((r) => new Date(r.date).toISOString().split("T")[0] === dateKey);
            if (idx !== -1) uniqueRecords.splice(idx, 1);
          }
          uniqueRecords.push(record);
          dateMap[dateKey] = { createdAt };
        }
      });

      uniqueRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

      doc.fontSize(14).fillColor("#2874A6").font("Helvetica-Bold")
        .text(course, summaryIndent, doc.y, { align: "left", underline: true });
      doc.moveDown(0.5);

      if (uniqueRecords.length === 0) {
        doc.fontSize(12).fillColor("#B03A2E").text("No records for this course.", summaryIndent);
        doc.moveDown(0.5);
        return;
      }

      {
        let rowIndexInBlock = 0;
        ensureSpace(headerHeight + 10);
        drawTableHeader();

        for (let r = 0; r < uniqueRecords.length; r++) {
          if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - footerReserve) {
            ensureSpace(rowHeight + headerHeight + 20, course, true);
            drawTableHeader();
            rowIndexInBlock = 0;
          }

          drawTableRow(uniqueRecords[r], rowIndexInBlock);
          rowIndexInBlock++;
        }
      }

      doc.moveDown(0.5);
    });
  }

  doc.moveDown(2);
  doc.fontSize(10).fillColor("#888").font("Helvetica-Oblique")
    .text("Generated by Academia Telegram BOT, By SRM Insider Community", 0, doc.page.height - 60, { align: "center" });

  doc.end();

  passThroughStream.on("data", (chunk) => chunks.push(chunk));
  passThroughStream.on("end", async () => {
    const buffer = Buffer.concat(chunks);
    await loader.clear();
    if (buffer.length === 0) return ctx.reply("❌ Error generating PDF. Please try again.");
    const safeName = (userName || "User").replace(/[\\/:*?"<>|]/g, "").trim() || "User";
    const datePart = new Date().toISOString().split("T")[0];
    const filename = `AttendanceReport - ${safeName} - ${datePart}.pdf`;
    await ctx.replyWithDocument({ source: buffer, filename });
  });
}


module.exports = {
  handleAttendancePdf,
};