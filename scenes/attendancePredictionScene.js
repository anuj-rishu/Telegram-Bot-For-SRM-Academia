const { Scenes, Markup } = require("telegraf");
const attendancePredictionController = require("../controllers/attendancePredictionController");

const cancelKeyboard = Markup.keyboard([["❌ Cancel"]]).resize();

const attendancePredictionScene = new Scenes.WizardScene(
  "attendance_prediction",

  async (ctx) => {
    await ctx.reply(
      "🤖 Welcome to Attendance Predictor (Phase 1)!\n\n" +
        "I can calculate how your attendance will be affected if you miss specific days.\n\n" +
        "Example questions:\n" +
        '- "What will my attendance be if I miss class on 23 April?"\n' +
        '- "Calculate my attendance if I\'m absent on 2 May"\n' +
        '- "What happens to my attendance if I skip 15th June?"\n\n' +
        "Simply mention the date you plan to be absent, and I'll calculate the impact on your attendance percentage.",
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
        "Please specify a date you plan to be absent to calculate the attendance impact:",
        cancelKeyboard
      );
      return;
    }

    const question = ctx.message.text;

 
    await ctx.replyWithChatAction("typing");

    await attendancePredictionController.handleAttendancePrediction(
      ctx,
      question
    );

    await ctx.reply(
      "Would you like to check another date?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Check another date", "ask_again")],
        [Markup.button.callback("I'm done", "end_prediction")],
      ])
    );

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply(
        "Please select an option:",
        Markup.inlineKeyboard([
          [Markup.button.callback("Check another date", "ask_again")],
          [Markup.button.callback("I'm done", "end_prediction")],
        ])
      );
      return;
    }

    if (ctx.callbackQuery.data === "ask_again") {
      await ctx.answerCbQuery();
      await ctx.reply(
        'Which date would you like to check next? (e.g., "23 April" or "2 May")',
        cancelKeyboard
      );
      return ctx.wizard.back();
    } else if (ctx.callbackQuery.data === "end_prediction") {
      await ctx.answerCbQuery();
      await ctx.reply(
        "Thanks for using the attendance predictor! To check future dates anytime, just use /checki.",
        Markup.removeKeyboard()
      );
      return ctx.scene.leave();
    }
  }
);

module.exports = attendancePredictionScene;
