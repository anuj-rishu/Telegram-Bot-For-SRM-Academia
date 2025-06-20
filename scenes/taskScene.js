const { Scenes, Markup } = require("telegraf");
const moment = require("moment");
const getTaskServiceClient = require("../services/taskServiceClient");
const logger = require("../utils/logger");

const taskScene = new Scenes.BaseScene("task");

const CALENDAR_CALLBACK = {
  PREV_MONTH: "prev",
  NEXT_MONTH: "next",
  SELECT_DAY: "day",
  IGNORE: "ignore",
  SET_MONTH: "month",
  SET_YEAR: "year",
};

async function safeEditMessageText(ctx, text, extra) {
  try {
    return await ctx.editMessageText(text, extra);
  } catch (error) {
    if (error.description === "message is not modified") {
      return;
    }
    throw error;
  }
}

async function safeEditMessageReplyMarkup(ctx, markup) {
  try {
    return await ctx.editMessageReplyMarkup(markup);
  } catch (error) {
    if (error.description === "message is not modified") {
      
      return;
    }
    throw error;
  }
}

taskScene.command("cancel", async (ctx) => {
  await ctx.reply("Task creation cancelled.");
  delete ctx.session.taskData;
  return ctx.scene.leave();
});

taskScene.enter(async (ctx) => {
  await ctx.reply(
    "📝 *Create New Task*\n\nPlease enter the task name:\n(Type /cancel to cancel anytime)",
    { parse_mode: "Markdown" }
  );
});

taskScene.on("text", async (ctx) => {
  if (ctx.message.text === "/cancel") return;

  if (!ctx.session.taskData) {
    ctx.session.taskData = {};
  }

  if (!ctx.session.taskData.taskName) {
    ctx.session.taskData.taskName = ctx.message.text;
    await ctx.reply(
      "📄 Enter task description (or type '/skip' or 'skip' to skip):\n(Type /cancel to cancel anytime)"
    );
  } else if (!ctx.session.taskData.description) {
    const text = ctx.message.text.toLowerCase();
    if (text === "/skip" || text === "skip") {
      ctx.session.taskData.description = "";
    } else {
      ctx.session.taskData.description = ctx.message.text;
    }

    const message = await ctx.reply("📅 *Select a date for your task:*", {
      parse_mode: "Markdown",
      ...generateCalendarKeyboard(moment().month(), moment().year()),
    });

    ctx.session.taskData.messageId = message.message_id;
  } else if (ctx.session.taskData.waitingForCustomReminder) {
    const reminderMinutes = parseInt(ctx.message.text);

    if (isNaN(reminderMinutes) || reminderMinutes < 1) {
      return ctx.reply(
        "❌ Please enter a valid number of minutes (minimum 1)."
      );
    }

    ctx.session.taskData.reminderMinutes = reminderMinutes;
    delete ctx.session.taskData.waitingForCustomReminder;

    await createTask(ctx);
  }
});

function generateCalendarKeyboard(month, year) {
  const currentDate = moment().startOf("day");
  const date = moment().year(year).month(month).startOf("month");
  const daysInMonth = date.daysInMonth();
  const firstDay = date.day();

  const keyboard = [];

  keyboard.push([
    Markup.button.callback(
      "◀️",
      `calendar:${CALENDAR_CALLBACK.PREV_MONTH}:${month}:${year}`
    ),
    Markup.button.callback(
      `${date.format("MMMM YYYY")}`,
      `calendar:${CALENDAR_CALLBACK.IGNORE}`
    ),
    Markup.button.callback(
      "▶️",
      `calendar:${CALENDAR_CALLBACK.NEXT_MONTH}:${month}:${year}`
    ),
  ]);

  keyboard.push(
    ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) =>
      Markup.button.callback(day, `calendar:${CALENDAR_CALLBACK.IGNORE}`)
    )
  );

  let dateButtons = [];
  let dayCount = 1;

  for (let i = 0; i < firstDay; i++) {
    dateButtons.push(
      Markup.button.callback(" ", `calendar:${CALENDAR_CALLBACK.IGNORE}`)
    );
  }

  while (dayCount <= daysInMonth) {
    const dayDate = moment().year(year).month(month).date(dayCount);
    const callbackData = `calendar:${CALENDAR_CALLBACK.SELECT_DAY}:${dayCount}:${month}:${year}`;

    let dayText = dayCount.toString();
    if (dayDate.isBefore(currentDate)) {
      dayText = "✖️";
    }

    dateButtons.push(Markup.button.callback(dayText, callbackData));

    if (dateButtons.length === 7) {
      keyboard.push(dateButtons);
      dateButtons = [];
    }

    dayCount++;
  }

  if (dateButtons.length > 0) {
    while (dateButtons.length < 7) {
      dateButtons.push(
        Markup.button.callback(" ", `calendar:${CALENDAR_CALLBACK.IGNORE}`)
      );
    }
    keyboard.push(dateButtons);
  }

  keyboard.push([Markup.button.callback("Cancel", "cancel_task")]);

  return Markup.inlineKeyboard(keyboard);
}

function generateTimeKeyboard() {
  const keyboard = [];

  keyboard.push([Markup.button.callback("Select Hour ⏰", "ignore")]);

  for (let i = 0; i < 24; i += 6) {
    const row = [];
    for (let j = i; j < i + 6 && j < 24; j++) {
      row.push(
        Markup.button.callback(j.toString().padStart(2, "0"), `hour:${j}`)
      );
    }
    keyboard.push(row);
  }

  keyboard.push([Markup.button.callback("Select Minute ⏰", "ignore")]);

  const minutesRow1 = [];
  const minutesRow2 = [];
  for (let i = 0; i < 60; i += 5) {
    const btn = Markup.button.callback(
      i.toString().padStart(2, "0"),
      `minute:${i}`
    );
    if (i < 30) {
      minutesRow1.push(btn);
    } else {
      minutesRow2.push(btn);
    }
  }

  keyboard.push(minutesRow1);
  keyboard.push(minutesRow2);
  keyboard.push([
    Markup.button.callback("Back to Calendar", "back_to_calendar"),
  ]);
  keyboard.push([Markup.button.callback("Cancel", "cancel_task")]);

  return Markup.inlineKeyboard(keyboard);
}

function generateReminderKeyboard() {
  const buttons = [
    [Markup.button.callback("5 minutes before", "reminder_5")],
    [Markup.button.callback("15 minutes before", "reminder_15")],
    [Markup.button.callback("30 minutes before", "reminder_30")],
    [Markup.button.callback("1 hour before", "reminder_60")],
    [Markup.button.callback("Custom reminder", "reminder_custom")],
    [Markup.button.callback("Back to Time Selection", "back_to_time")],
    [Markup.button.callback("Cancel", "cancel_task")],
  ];

  return Markup.inlineKeyboard(buttons);
}

taskScene.action(
  /calendar:([^:]+)(?::(\d+))?(?::(\d+))?(?::(\d+))?/,
  async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    if (action === CALENDAR_CALLBACK.IGNORE) {
      return;
    }

    if (action === "cancel_task") {
      await ctx.reply("Task creation cancelled.");
      delete ctx.session.taskData;
      return ctx.scene.leave();
    }

    if (action === CALENDAR_CALLBACK.SELECT_DAY) {
      const day = parseInt(ctx.match[2]);
      const month = parseInt(ctx.match[3]);
      const year = parseInt(ctx.match[4]);

      const selectedDate = moment().year(year).month(month).date(day);

      if (!selectedDate.isValid()) {
        await ctx.answerCbQuery("❌ Invalid date selected.");
        return;
      }

      if (selectedDate.isBefore(moment().startOf("day"))) {
        await ctx.answerCbQuery("❌ Please select a future date.");
        return;
      }

      ctx.session.taskData.selectedDate = selectedDate;

      await safeEditMessageText(
        ctx,
        `📅 Date selected: *${selectedDate.format(
          "MMM D, YYYY"
        )}*\n\nNow select time:`,
        {
          parse_mode: "Markdown",
          reply_markup: generateTimeKeyboard().reply_markup,
        }
      );
      return;
    }

    if (
      action === CALENDAR_CALLBACK.PREV_MONTH ||
      action === CALENDAR_CALLBACK.NEXT_MONTH
    ) {
      let month = parseInt(ctx.match[2]);
      let year = parseInt(ctx.match[3]);

      if (action === CALENDAR_CALLBACK.PREV_MONTH) {
        month -= 1;
        if (month < 0) {
          month = 11;
          year -= 1;
        }
      } else {
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      }

      await safeEditMessageReplyMarkup(
        ctx,
        generateCalendarKeyboard(month, year).reply_markup
      );
      return;
    }
  }
);

taskScene.action(/hour:(\d+)/, async (ctx) => {
  const hour = parseInt(ctx.match[1]);
  await ctx.answerCbQuery(`Hour set to ${hour}`);

  if (!ctx.session.taskData.selectedTime) {
    ctx.session.taskData.selectedTime = {};
  }

  ctx.session.taskData.selectedTime.hour = hour;

  const selectedDate = ctx.session.taskData.selectedDate;
  await safeEditMessageText(
    ctx,
    `📅 Date: *${selectedDate.format("MMM D, YYYY")}*\n⏰ Hour: *${hour
      .toString()
      .padStart(2, "0")}*\n\nNow select minute:`,
    {
      parse_mode: "Markdown",
      reply_markup: generateTimeKeyboard().reply_markup,
    }
  );
});

taskScene.action(/minute:(\d+)/, async (ctx) => {
  const minute = parseInt(ctx.match[1]);
  await ctx.answerCbQuery(`Minute set to ${minute}`);

  if (!ctx.session.taskData.selectedTime) {
    ctx.session.taskData.selectedTime = {};
  }

  ctx.session.taskData.selectedTime.minute = minute;

  if (ctx.session.taskData.selectedTime.hour !== undefined) {
    finalizeDateTimeSelection(ctx);
  } else {
    await safeEditMessageText(
      ctx,
      `📅 Date: *${ctx.session.taskData.selectedDate.format(
        "MMM D, YYYY"
      )}*\n⏰ Minute: *${minute
        .toString()
        .padStart(2, "0")}*\n\nPlease select an hour:`,
      {
        parse_mode: "Markdown",
        reply_markup: generateTimeKeyboard().reply_markup,
      }
    );
  }
});

taskScene.action("back_to_calendar", async (ctx) => {
  await ctx.answerCbQuery();
  const now = moment();

  await safeEditMessageText(ctx, "📅 *Select a date for your task:*", {
    parse_mode: "Markdown",
    reply_markup: generateCalendarKeyboard(now.month(), now.year())
      .reply_markup,
  });
});

taskScene.action("back_to_time", async (ctx) => {
  await ctx.answerCbQuery();
  const selectedDate = ctx.session.taskData.selectedDate;

  delete ctx.session.taskData.selectedTime;

  await safeEditMessageText(
    ctx,
    `📅 Date selected: *${selectedDate.format("MMM D, YYYY")}*\n\nSelect time:`,
    {
      parse_mode: "Markdown",
      reply_markup: generateTimeKeyboard().reply_markup,
    }
  );
});

async function finalizeDateTimeSelection(ctx) {
  const selectedDate = ctx.session.taskData.selectedDate;
  const { hour, minute } = ctx.session.taskData.selectedTime;

  selectedDate.hour(hour).minute(minute).second(0);

  if (selectedDate.isBefore(moment())) {
    await ctx.answerCbQuery("❌ The selected time is in the past.");
    await safeEditMessageText(
      ctx,
      `❌ The selected time is in the past.\n\n📅 Please select a future time:`,
      { reply_markup: generateTimeKeyboard().reply_markup }
    );
    return;
  }

  ctx.session.taskData.dueDate = selectedDate.toDate();

  await safeEditMessageText(
    ctx,
    `📅 Task scheduled for: *${selectedDate.format(
      "MMM D, YYYY [at] h:mm A"
    )}*\n\n` + "⏰ How many minutes before the due date should I remind you?",
    {
      parse_mode: "Markdown",
      reply_markup: generateReminderKeyboard().reply_markup,
    }
  );
}

taskScene.action(/reminder_(\d+|custom)/, async (ctx) => {
  const action = ctx.match[1];
  await ctx.answerCbQuery();

  if (action === "custom") {
    ctx.session.taskData.waitingForCustomReminder = true;
    await safeEditMessageText(
      ctx,
      "Enter the number of minutes before the task to send a reminder:\n" +
        "(Reply with a number in the chat)",
      {
        reply_markup: {
          inline_keyboard: [[Markup.button.callback("Cancel", "cancel_task")]],
        },
      }
    );
    return;
  }

  ctx.session.taskData.reminderMinutes = parseInt(action);
  await createTask(ctx);
});

taskScene.action("cancel_task", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Task creation cancelled.");
  delete ctx.session.taskData;
  return ctx.scene.leave();
});

async function createTask(ctx) {
  try {
    const taskService = getTaskServiceClient(ctx.telegram);

    const taskData = {
      telegramId: ctx.from.id.toString(),
      taskName: ctx.session.taskData.taskName,
      description: ctx.session.taskData.description,
      dueDate: ctx.session.taskData.dueDate,
      reminderMinutes: ctx.session.taskData.reminderMinutes,
    };

    await taskService.createTask(taskData);

    const dueFormatted = moment(taskData.dueDate).format(
      "MMM D, YYYY [at] h:mm A"
    );

    await safeEditMessageText(
      ctx,
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
