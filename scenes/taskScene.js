const { Scenes, Markup } = require("telegraf");
const moment = require("moment");
const Task = require("../model/task");

const cancelKeyboard = Markup.keyboard([["❌ Cancel"]]).resize();

const taskScene = new Scenes.WizardScene(
  "task",

  async (ctx) => {
    ctx.wizard.state.task = {};

    await ctx.reply("Please enter a name for your task:", cancelKeyboard);

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Task creation cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (!ctx.message || !ctx.message.text) {
      await ctx.reply("Please enter a valid task name:", cancelKeyboard);
      return;
    }

    ctx.wizard.state.task.taskName = ctx.message.text;
    await ctx.reply(
      "Enter a description for your task (or send /skip to skip):",
      cancelKeyboard
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Task creation cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (ctx.message && ctx.message.text) {
      if (ctx.message.text === "/skip") {
        ctx.wizard.state.task.description = "";
      } else {
        ctx.wizard.state.task.description = ctx.message.text;
      }
    } else {
      await ctx.reply(
        "Please enter a valid description or /skip:",
        cancelKeyboard
      );
      return;
    }

    await ctx.reply("📆 Select a date:", await getCalendarKeyboard(moment()));

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Task creation cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (!ctx.callbackQuery) {
      await ctx.reply(
        "Please select a date from the calendar:",
        cancelKeyboard
      );
      return;
    }

    const callbackData = ctx.callbackQuery.data;

    if (callbackData.startsWith("calendar")) {
      const parts = callbackData.split(":");

      if (parts[1] === "date") {
        const selectedDate = parts[2];
        ctx.wizard.state.task.selectedDate = selectedDate;

        await ctx.answerCbQuery();

        const inlineKeyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback("09:00", "time:09:00"),
            Markup.button.callback("12:00", "time:12:00"),
            Markup.button.callback("15:00", "time:15:00"),
          ],
          [
            Markup.button.callback("18:00", "time:18:00"),
            Markup.button.callback("20:00", "time:20:00"),
            Markup.button.callback("22:00", "time:22:00"),
          ],
          [Markup.button.callback("Custom time", "time:custom")],
        ]);

        await ctx.reply(
          "⏰ Select time (or type in HH:MM format):",
          inlineKeyboard
        );

        return ctx.wizard.next();
      } else if (parts[1] === "nav") {
        const action = parts[2];
        const dateString = parts[3];
        const date = moment(dateString, "YYYY-MM-DD");

        if (action === "prev") {
          date.subtract(1, "month");
        } else if (action === "next") {
          date.add(1, "month");
        }

        await ctx.answerCbQuery();
        await ctx.editMessageReplyMarkup(
          (
            await getCalendarKeyboard(date)
          ).reply_markup
        );
        return;
      }
    }

    await ctx.reply("Please select a date from the calendar:", cancelKeyboard);
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Task creation cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    let selectedTime;

    if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith("time:")) {
      const time = ctx.callbackQuery.data.split(":")[1];

      if (time === "custom") {
        await ctx.answerCbQuery();
        await ctx.reply(
          "Please enter the time in HH:MM format (24-hour):",
          cancelKeyboard
        );
        return;
      } else {
        selectedTime = time;
        await ctx.answerCbQuery();
      }
    } else if (ctx.message && ctx.message.text) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
      if (!timeRegex.test(ctx.message.text)) {
        await ctx.reply(
          "Invalid time format. Please use HH:MM format (24-hour):",
          cancelKeyboard
        );
        return;
      }
      selectedTime = ctx.message.text;
    } else {
      await ctx.reply(
        "Please enter a valid time in HH:MM format (24-hour):",
        cancelKeyboard
      );
      return;
    }

    ctx.wizard.state.task.selectedTime = selectedTime;

    const reminderButtons = Markup.inlineKeyboard([
      [
        Markup.button.callback("5 minutes", "reminder:5"),
        Markup.button.callback("10 minutes", "reminder:10"),
      ],
      [
        Markup.button.callback("15 minutes", "reminder:15"),
        Markup.button.callback("30 minutes", "reminder:30"),
      ],
      [
        Markup.button.callback("1 hour", "reminder:60"),
        Markup.button.callback("1:30 hours", "reminder:90"),
      ],
      [
        Markup.button.callback("2 hours", "reminder:120"),
        Markup.button.callback("2:30 hours", "reminder:150"),
      ],

      [Markup.button.callback("Custom time", "reminder:custom")],
    ]);

    await ctx.reply(
      "⏰ Select reminder time before the task:",
      reminderButtons
    );

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Task creation cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    let reminderMinutes;

    if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith("reminder:")) {
      const reminderData = ctx.callbackQuery.data.split(":")[1];

      if (reminderData === "custom") {
        await ctx.answerCbQuery();
        await ctx.reply(
          "Enter custom reminder time (5-1440 minutes).\n" +
            "Examples:\n" +
            "• 5 = 5 minutes before\n" +
            "• 60 = 1 hour before\n" +
            "• 90 = 1 hour 30 minutes before\n" +
            "• 120 = 2 hours before\n" +
            "• 720 = 12 hours before\n" +
            "• 1440 = 24 hours before",
          cancelKeyboard
        );
        return;
      } else {
        reminderMinutes = parseInt(reminderData);
        await ctx.answerCbQuery();
      }
    } else if (ctx.message && ctx.message.text) {
      const customMinutes = parseInt(ctx.message.text);

      if (isNaN(customMinutes) || customMinutes < 5 || customMinutes > 1440) {
        await ctx.reply(
          "Please enter a valid number between 5 and 1440 minutes (24 hours):",
          cancelKeyboard
        );
        return;
      }

      reminderMinutes = customMinutes;
    } else {
      await ctx.reply(
        "Please select a reminder time from the options:",
        cancelKeyboard
      );
      return;
    }

    ctx.wizard.state.task.reminderMinutes = reminderMinutes;

    const dateTimeString = `${ctx.wizard.state.task.selectedDate} ${ctx.wizard.state.task.selectedTime}`;
    const dueDate = moment(dateTimeString, "YYYY-MM-DD HH:mm").toDate();

    try {
      const { taskName, description, reminderMinutes } = ctx.wizard.state.task;

      const task = new Task({
        telegramId: ctx.from.id,
        taskName,
        description: description || "",
        dueDate,
        reminderMinutes,
      });

      await task.save();

      const formattedDate = moment(dueDate).format("MMMM Do YYYY, h:mm a");

      let reminderText = "";
      if (reminderMinutes < 60) {
        reminderText = `${reminderMinutes} minutes`;
      } else if (reminderMinutes === 60) {
        reminderText = "1 hour";
      } else if (reminderMinutes === 90) {
        reminderText = "1 hour 30 minutes";
      } else if (reminderMinutes === 120) {
        reminderText = "2 hours";
      } else if (reminderMinutes === 240) {
        reminderText = "4 hours";
      } else if (reminderMinutes === 720) {
        reminderText = "12 hours";
      } else if (reminderMinutes === 1440) {
        reminderText = "24 hours";
      } else {
        const hours = Math.floor(reminderMinutes / 60);
        const mins = reminderMinutes % 60;
        reminderText = `${hours} hour${hours > 1 ? "s" : ""}${
          mins > 0 ? ` ${mins} minute${mins > 1 ? "s" : ""}` : ""
        }`;
      }

      await ctx.reply(
        `✅ Task created successfully!\n\n` +
          `*Task:* ${taskName}\n` +
          `*Description:* ${description || "N/A"}\n` +
          `*Due:* ${formattedDate}\n` +
          `*Reminder:* ${reminderText} before\n\n` +
          `You'll receive a reminder ${reminderText} before the task is due.`,
        {
          parse_mode: "Markdown",
          ...Markup.removeKeyboard(),
        }
      );

      return ctx.scene.leave();
    } catch (error) {
      console.error("Error saving task:", error);
      await ctx.reply(
        "❌ Error creating task. Please try again.",
        Markup.removeKeyboard()
      );
      return ctx.scene.leave();
    }
  }
);

async function getCalendarKeyboard(date) {
  const month = date.month();
  const year = date.year();

  const currentMonth = date.format("MMMM YYYY");
  const daysInMonth = date.daysInMonth();
  const firstDay = moment(date).startOf("month").day();

  let keyboard = [];

  keyboard.push([
    Markup.button.callback(
      "◀️",
      `calendar:nav:prev:${date.format("YYYY-MM-DD")}`
    ),
    Markup.button.callback(currentMonth, `calendar:info:${currentMonth}`),
    Markup.button.callback(
      "▶️",
      `calendar:nav:next:${date.format("YYYY-MM-DD")}`
    ),
  ]);

  keyboard.push(
    ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) =>
      Markup.button.callback(day, `calendar:day:${day}`)
    )
  );

  let days = [];
  let dayCount = 1;

  for (let i = 0; i < firstDay; i++) {
    days.push(Markup.button.callback(" ", "calendar:empty"));
  }

  while (dayCount <= daysInMonth) {
    days.push(
      Markup.button.callback(
        String(dayCount),
        `calendar:date:${date.format("YYYY-MM")}-${dayCount
          .toString()
          .padStart(2, "0")}`
      )
    );

    if (days.length === 7) {
      keyboard.push(days);
      days = [];
    }

    dayCount++;
  }

  while (days.length > 0 && days.length < 7) {
    days.push(Markup.button.callback(" ", "calendar:empty"));
    if (days.length === 7) {
      keyboard.push(days);
      days = [];
    }
  }

  return Markup.inlineKeyboard(keyboard);
}

module.exports = taskScene;
