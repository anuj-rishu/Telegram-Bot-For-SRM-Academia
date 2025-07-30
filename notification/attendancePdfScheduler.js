const schedule = require("node-schedule");
const {
  handleAttendancePdf,
} = require("../controllers/attendancePdfController");
const User = require("../model/user");

function scheduleAttendancePdf(bot) {
  schedule.scheduleJob("01 21 * * *", async () => {
    try {
      const users = await User.find({}, "telegramId name").lean();

      for (const user of users) {
        const name = user.name || "user";
        const userId = user.telegramId;
        const now = new Date();
        const today = now.toLocaleDateString("en-GB");
        const yesterday = new Date(
          now.getTime() - 24 * 60 * 60 * 1000
        ).toLocaleDateString("en-GB");

        const message = `Hey ${name} - here is your attendance history from ${yesterday} 9:00 PM to ${today} 9:00 PM.`;

        const ctx = {
          from: { id: userId },
          chat: { id: userId },
          telegram: bot.telegram,
          reply: (msg) => bot.telegram.sendMessage(userId, msg),
          replyWithDocument: (doc) => bot.telegram.sendDocument(userId, doc),
        };
        try {
          await bot.telegram.sendMessage(userId, message);
          await handleAttendancePdf(ctx);
        } catch (e) {
          bot.telegram.sendMessage(userId, "❌ Error sending attendance PDF.");
        }
      }
    } catch (err) {
      console.error("Error fetching users for attendance PDF:", err);
    }
  });
}
module.exports = scheduleAttendancePdf;
