const moment = require("moment");
const Task = require("../model/task");

class TaskNotificationService {
  constructor(bot) {
    this.bot = bot;
    setInterval(() => this.checkTaskReminders(), 5 * 60 * 1000);
  }

  async checkTaskReminders() {
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const tasks = await Task.find({
        isCompleted: false,
        reminderSent: false,
        dueDate: { $gt: now },
      });

      for (const task of tasks) {
        const reminderTime = new Date(
          task.dueDate.getTime() - task.reminderMinutes * 60 * 1000
        );

        if (reminderTime <= now && reminderTime >= fiveMinutesAgo) {
          await this.sendTaskReminder(task);

          await Task.findByIdAndUpdate(task._id, {
            reminderSent: true,
          });
        }
      }
    } catch (error) {}
  }

  async sendTaskReminder(task) {
    try {
      const formattedDueDate = moment(task.dueDate).format("h:mm A");

      const message =
        `⏰ *Task Reminder*\n\n` +
        `Your task "*${task.taskName}*" is due in ${task.reminderMinutes} minutes (at ${formattedDueDate}).\n\n` +
        (task.description ? `*Description:* ${task.description}\n\n` : "");

      await this.bot.telegram.sendMessage(task.telegramId, message, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Mark as Complete",
                callback_data: `complete_task:${task._id}`,
              },
            ],
          ],
        },
      });
    } catch (error) {}
  }
}

module.exports = TaskNotificationService;
