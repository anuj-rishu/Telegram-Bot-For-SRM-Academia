const { Scenes, Markup } = require("telegraf");
const attendancePredictionController = require("../controllers/attendancePredictionController");

const cancelKeyboard = Markup.keyboard([["❌ Cancel"]]).resize();

const attendancePredictionScene = new Scenes.WizardScene(
  "attendance_prediction",

  async (ctx) => {
    await ctx.reply(
      "🤖 Hello! I can help you with attendance predictions.\n\n" +
        "You can ask me questions like:\n" +
        '- "What\'s my current attendance percentage?"\n' +
        '- "Can I skip tomorrow\'s class?"\n' +
        '- "How many classes can I miss?"\n' +
        '- "What will my attendance be if I miss the next two days?"\n' +
        '- "Will I be detained if I skip this week?"\n\n' +
        "What would you like to know about your attendance?",
      cancelKeyboard
    );

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Prediction cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (!ctx.message || !ctx.message.text) {
      await ctx.reply(
        "Please ask a valid question about your attendance:",
        cancelKeyboard
      );
      return;
    }

    const question = ctx.message.text;

    await attendancePredictionController.handleAttendancePrediction(
      ctx,
      question
    );
    await ctx.reply(
      "Do you have any other questions about your attendance?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Yes, ask another question", "ask_again")],
        [Markup.button.callback("No, I'm done", "end_prediction")],
      ])
    );

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply(
        "Please select an option from the buttons below:",
        Markup.inlineKeyboard([
          [Markup.button.callback("Ask another question", "ask_again")],
          [Markup.button.callback("I'm done", "end_prediction")],
        ])
      );
      return;
    }

    if (ctx.callbackQuery.data === "ask_again") {
      await ctx.answerCbQuery();
      await ctx.reply(
        "What else would you like to know about your attendance?",
        cancelKeyboard
      );
      return ctx.wizard.back();
    } else if (ctx.callbackQuery.data === "end_prediction") {
      await ctx.answerCbQuery();
      await ctx.reply(
        "Thanks for using the attendance prediction service! You can access it again anytime with /predict.",
        Markup.removeKeyboard()
      );
      return ctx.scene.leave();
    }
  }
);

module.exports = attendancePredictionScene;
