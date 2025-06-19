const { Scenes, Markup } = require("telegraf");
const moment = require("moment");
const getTaskServiceClient = require("../services/taskServiceClient");
const logger = require("../utils/logger");

const taskScene = new Scenes.BaseScene("task");

taskScene.enter(async (ctx) => {
  await ctx.reply(
    "📝 *Create New Task*\n\nPlease enter the task name:",
    { parse_mode: "Markdown" }
  );
});

taskScene.on("text", async (ctx) => {
  if (!ctx.session.taskData) {
    ctx.session.taskData = {};
  }

  if (!ctx.session.taskData.taskName) {
    ctx.session.taskData.taskName = ctx.message.text;
    await ctx.reply("📄 Enter task description (or type 'skip' to skip):");
  } else if (!ctx.session.taskData.description) {
    ctx.session.taskData.description =
      ctx.message.text.toLowerCase() === "skip" ? "" : ctx.message.text;
    await ctx.reply(
      "📅 Enter due date and time (format: DD/MM/YYYY HH:MM):\nExample: 25/12/2024 14:30"
    );
  } else if (!ctx.session.taskData.dueDate) {
    const dateTimeRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;
    const match = ctx.message.text.match(dateTimeRegex);

    if (!match) {
      return ctx.reply(
        "❌ Invalid date format. Please use DD/MM/YYYY HH:MM format.\nExample: 25/12/2024 14:30"
      );
    }

    const [, day, month, year, hour, minute] = match;
    const dueDate = moment(`${year}-${month}-${day} ${hour}:${minute}`, "YYYY-MM-DD HH:mm");

    if (!dueDate.isValid()) {
      return ctx.reply("❌ Invalid date. Please enter a valid date and time.");
    }

    if (dueDate.isBefore(moment())) {
      return ctx.reply("❌ Due date cannot be in the past. Please enter a future date.");
    }

    ctx.session.taskData.dueDate = dueDate.toDate();

    const buttons = [
      [Markup.button.callback("5 minutes", "reminder_5")],
      [Markup.button.callback("15 minutes", "reminder_15")],
      [Markup.button.callback("30 minutes", "reminder_30")],
      [Markup.button.callback("1 hour", "reminder_60")],
      [Markup.button.callback("Custom", "reminder_custom")]
    ];

    await ctx.reply(
      "⏰ How many minutes before the due date should I remind you?",
      Markup.inlineKeyboard(buttons)
    );
  } else if (ctx.session.taskData.waitingForCustomReminder) {
    const reminderMinutes = parseInt(ctx.message.text);

    if (isNaN(reminderMinutes) || reminderMinutes < 1) {
      return ctx.reply("❌ Please enter a valid number of minutes (minimum 1).");
    }

    ctx.session.taskData.reminderMinutes = reminderMinutes;
    delete ctx.session.taskData.waitingForCustomReminder;

    await createTask(ctx);
  }
});

taskScene.action(/reminder_(\d+|custom)/, async (ctx) => {
  const action = ctx.match[1];

  if (action === "custom") {
    ctx.session.taskData.waitingForCustomReminder = true;
    await ctx.answerCbQuery();
    await ctx.reply("Enter the number of minutes for the reminder:");
    return;
  }

  ctx.session.taskData.reminderMinutes = parseInt(action);
  await ctx.answerCbQuery();
  await createTask(ctx);
});

async function createTask(ctx) {
  try {
    const taskService = getTaskServiceClient(ctx.telegram);
    
    const taskData = {
      telegramId: ctx.from.id.toString(),
      taskName: ctx.session.taskData.taskName,
      description: ctx.session.taskData.description,
      dueDate: ctx.session.taskData.dueDate,
      reminderMinutes: ctx.session.taskData.reminderMinutes
    };

    await taskService.createTask(taskData);

    const dueFormatted = moment(taskData.dueDate).format("MMM D, YYYY [at] h:mm A");

    await ctx.reply(
      `✅ *Task Created Successfully!*\n\n` +
      `📝 *Task:* ${taskData.taskName}\n` +
      `📄 *Description:* ${taskData.description || "None"}\n` +
      `📅 *Due:* ${dueFormatted}\n` +
      `⏰ *Reminder:* ${taskData.reminderMinutes} minutes before`,
      { parse_mode: "Markdown" }
    );

    delete ctx.session.taskData;
    await ctx.scene.leave();
  } catch (error) {
    logger.error(`Error creating task: ${error.message}`);
    await ctx.reply("❌ Failed to create task. Please try again.");
    await ctx.scene.leave();
  }
}

taskScene.leave((ctx) => {
  delete ctx.session.taskData;
});

module.exports = taskScene;