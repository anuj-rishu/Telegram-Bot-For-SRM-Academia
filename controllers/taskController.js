const moment = require("moment");
const { Markup } = require("telegraf");
const Task = require("../model/task");

/**
 * Handle tasks list command
 * @param {Object} ctx - Telegraf context
 */
async function handleTasksList(ctx) {
  const userId = ctx.from.id;

  try {
    const tasks = await Task.find({
      telegramId: userId,
      isCompleted: false,
    }).sort({ dueDate: 1 });

    if (tasks.length === 0) {
      return ctx.reply(
        "You don't have any active tasks. Use /addtask to create a new task."
      );
    }

    let message = "📋 *Your Tasks*\n\n";
    const buttons = [];
    const now = moment();

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const dueDate = moment(task.dueDate);
      const isOverdue = dueDate.isBefore(now);
      const dueDateFormatted = dueDate.format("MMM D, YYYY [at] h:mm A");

      message += `${i + 1}. ${isOverdue ? "⚠️ " : ""}*${task.taskName}*\n`;
      if (task.description) {
        message += `   ${task.description}\n`;
      }
      message += `   📅 Due: ${dueDateFormatted}\n`;

      buttons.push([
        Markup.button.callback(
          `✅ Complete: ${task.taskName.substring(0, 20)}`,
          `complete_task:${task._id}`
        ),
        Markup.button.callback(
          `🗑️ Delete: ${task.taskName.substring(0, 20)}`,
          `delete_multiple`
        ),
      ]);
    }

    buttons.push([
      Markup.button.callback("🗑️ Delete Tasks", "delete_multiple"),
    ]);

    await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    ctx.reply("❌ Error fetching your tasks. Please try again.");
  }
}

/**
 * Handle task completion command
 * @param {Object} ctx - Telegraf context
 */
async function handleCompleteTask(ctx) {
  const userId = ctx.from.id;
  const taskId = ctx.message.text.split(" ")[1];

  if (!taskId) {
    return showTasksForCompletion(ctx);
  }

  try {
    const task = await Task.findOneAndUpdate(
      { _id: taskId, telegramId: userId },
      { isCompleted: true },
      { new: true }
    );

    if (!task) {
      return ctx.reply("❌ Task not found. Please check the ID and try again.");
    }

    ctx.reply(`✅ Task "${task.taskName}" marked as complete!`);
  } catch (error) {
    ctx.reply(
      "❌ Error completing the task. Please check the ID and try again."
    );
  }
}

/**
 * Show tasks with completion buttons
 * @param {Object} ctx - Telegraf context
 */
async function showTasksForCompletion(ctx) {
  const userId = ctx.from.id;

  try {
    const tasks = await Task.find({
      telegramId: userId,
      isCompleted: false,
    }).sort({ dueDate: 1 });

    if (tasks.length === 0) {
      return ctx.reply("You don't have any active tasks to complete.");
    }

    const message = "Select a task to mark as complete:";
    const buttons = tasks.map((task) => [
      Markup.button.callback(
        `${task.taskName.substring(0, 30)}`,
        `complete_task:${task._id}`
      ),
    ]);

    await ctx.reply(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    // Removed console.error to reduce CPU usage
    ctx.reply("❌ Error fetching your tasks. Please try again.");
  }
}

/**
 * Handle multiple task deletion command
 * @param {Object} ctx - Telegraf context
 */
async function handleDeleteMultipleTasks(ctx) {
  await showTasksForMultipleSelection(ctx);
}

/**
 * Show tasks with checkboxes for multiple selection
 * @param {Object} ctx - Telegraf context
 */
async function showTasksForMultipleSelection(ctx) {
  const userId = ctx.from.id;

  try {
    const tasks = await Task.find({
      telegramId: userId,
      isCompleted: false,
    }).sort({ dueDate: 1 });

    if (tasks.length === 0) {
      return ctx.reply("You don't have any active tasks to delete.");
    }

    let message = "Select tasks to delete:\n\n";

    if (!ctx.session.selectedTasks) {
      ctx.session.selectedTasks = {};
    }

    for (let i = 0; i < tasks.length; i++) {
      message += `${i + 1}. ${tasks[i].taskName}\n`;
    }

    const buttons = tasks.map((task) => {
      const taskId = task._id.toString();
      const isSelected = ctx.session.selectedTasks[taskId] === true;

      return [
        Markup.button.callback(
          `${isSelected ? "☑" : "☐"} ${task.taskName.substring(0, 30)}`,
          `selection:${taskId}`
        ),
      ];
    });

    buttons.push([
      Markup.button.callback(
        "🗑️ Delete Selected",
        "confirm_multiple_selection"
      ),
      Markup.button.callback("❌ Cancel", "cancel_multiple_selection"),
    ]);

    await ctx.reply(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    ctx.reply("❌ Error preparing tasks for selection. Please try again.");
  }
}

/**
 * Handle callback queries for task actions
 * @param {Object} ctx - Telegraf context
 */
async function handleTaskCallbacks(ctx) {
  try {
    const callbackData = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    if (callbackData.startsWith("complete_task:")) {
      const taskId = callbackData.split(":")[1];
      const task = await Task.findOneAndUpdate(
        { _id: taskId, telegramId: userId },
        { isCompleted: true },
        { new: true }
      );

      if (!task) {
        await ctx.answerCbQuery("Task not found.");
        return;
      }

      await ctx.answerCbQuery("Task marked as complete!");
      await ctx.editMessageText(
        `✅ Task "${task.taskName}" marked as complete!`
      );
    } else if (callbackData === "delete_multiple") {
      ctx.session.selectedTasks = {};
      await ctx.answerCbQuery();
      await showTasksForMultipleSelection(ctx);
    } else if (callbackData.startsWith("selection:")) {
      const taskId = callbackData.split(":")[1];

      if (!ctx.session.selectedTasks) {
        ctx.session.selectedTasks = {};
      }

      ctx.session.selectedTasks[taskId] = !ctx.session.selectedTasks[taskId];

      const tasks = await Task.find({
        telegramId: userId,
        isCompleted: false,
      }).sort({ dueDate: 1 });

      let message = "Select tasks to delete:\n\n";

      for (let i = 0; i < tasks.length; i++) {
        message += `${i + 1}. ${tasks[i].taskName}\n`;
      }

      const buttons = tasks.map((task) => {
        const id = task._id.toString();
        const isSelected = ctx.session.selectedTasks[id] === true;

        return [
          Markup.button.callback(
            `${isSelected ? "☑" : "☐"} ${task.taskName.substring(0, 30)}`,
            `selection:${id}`
          ),
        ];
      });

      buttons.push([
        Markup.button.callback(
          "🗑️ Delete Selected",
          "confirm_multiple_selection"
        ),
        Markup.button.callback("❌ Cancel", "cancel_multiple_selection"),
      ]);

      await ctx.answerCbQuery();
      await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
    } else if (callbackData === "confirm_multiple_selection") {
      if (!ctx.session.selectedTasks) {
        ctx.session.selectedTasks = {};
      }

      const selectedTaskIds = Object.keys(ctx.session.selectedTasks).filter(
        (id) => ctx.session.selectedTasks[id] === true
      );

      if (selectedTaskIds.length === 0) {
        await ctx.answerCbQuery("No tasks selected.");
        return;
      }

      const selectedTasks = await Task.find({
        _id: { $in: selectedTaskIds },
        telegramId: userId,
      });

      let message = `Are you sure you want to delete these ${selectedTasks.length} tasks?\n\n`;

      for (let i = 0; i < selectedTasks.length; i++) {
        message += `${i + 1}. ${selectedTasks[i].taskName}\n`;
      }

      const buttons = [
        [
          Markup.button.callback("Yes, delete them", "confirm_delete_selected"),
          Markup.button.callback("No, keep them", "cancel_multiple_selection"),
        ],
      ];

      await ctx.answerCbQuery();
      await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
    } else if (callbackData === "cancel_multiple_selection") {
      ctx.session.selectedTasks = {};

      await ctx.answerCbQuery("Deletion cancelled.");
      await ctx.editMessageText("Task deletion cancelled.");
    } else if (callbackData === "confirm_delete_selected") {
      if (!ctx.session.selectedTasks) {
        await ctx.answerCbQuery("No tasks selected.");
        return;
      }

      const selectedTaskIds = Object.keys(ctx.session.selectedTasks).filter(
        (id) => ctx.session.selectedTasks[id] === true
      );

      if (selectedTaskIds.length === 0) {
        await ctx.answerCbQuery("No tasks selected.");
        return;
      }

      const result = await Task.deleteMany({
        _id: { $in: selectedTaskIds },
        telegramId: userId,
      });

      ctx.session.selectedTasks = {};

      await ctx.answerCbQuery("Tasks deleted!");
      await ctx.editMessageText(
        `🗑️ Successfully deleted ${result.deletedCount} tasks.`
      );
    }
  } catch (error) {
    await ctx.answerCbQuery("An error occurred. Please try again.");
  }
}

module.exports = {
  handleTasksList,
  handleCompleteTask,
  handleDeleteMultipleTasks,
  handleTaskCallbacks,
};
