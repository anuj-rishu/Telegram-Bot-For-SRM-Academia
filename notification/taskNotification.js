const moment = require("moment");
const Task = require("../model/task");

class TaskNotificationService {
  constructor(bot) {
    this.bot = bot;
    console.log("✅ Task notification service initialized");

    setInterval(() => this.checkTaskReminders(), 60 * 1000);
  }

  async checkTaskReminders() {
    try {
      const now = new Date();

      const tasks = await Task.find({
        isCompleted: false,
        reminderSent: false,
      });

      for (const task of tasks) {
        const reminderTime = new Date(
          task.dueDate.getTime() - task.reminderMinutes * 60 * 1000
        );

        if (
          reminderTime <= now &&
          reminderTime >= new Date(now.getTime() - 60 * 1000)
        ) {
          await this.sendTaskReminder(task);

          task.reminderSent = true;
          await task.save();
        }
      }
    } catch (error) {
      console.error("Error checking task reminders:", error);
    }
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

      console.log(
        `Sent reminder for task ${task._id} to user ${task.telegramId}`
      );
    } catch (error) {
      console.error(
        `Error sending task reminder to user ${task.telegramId}:`,
        error
      );
    }
  }
}

module.exports = TaskNotificationService;
