const { Scenes } = require("telegraf");
const axios = require("axios");
const config = require("../config/config");
const sessionManager = require("../utils/sessionManager");
const StudentPortalUser = require("../model/studentPortalUser");
const logger = require("../utils/logger");

const loginStudentPortalScene = new Scenes.WizardScene(
  "loginStudentPortal",

  async (ctx) => {
    try {
      const userId = ctx.from.id;
      
      const session = sessionManager.getStudentPortalSession(userId);
      if (session && session.token) {
        await ctx.reply(
          "You are already logged into the Student Portal. Please use /logoutsp first if you want to login with a different account."
        );
        return ctx.scene.leave();
      }

      ctx.wizard.state.startMessage = await ctx.reply(
        "Please enter your Student Portal username:"
      );
      return ctx.wizard.next();
    } catch (error) {
      logger.error(`Error in student portal login check: ${error.message}`);
      await ctx.reply(
        "There was an error checking your login status. Please try again later."
      );
      return ctx.scene.leave();
    }
  },

  async (ctx) => {
    ctx.wizard.state.usernameMessage = ctx.message;
    ctx.wizard.state.username = ctx.message.text;

    ctx.wizard.state.passwordPrompt = await ctx.reply(
      "Please enter your password:"
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    ctx.wizard.state.passwordMessage = ctx.message;
    const { username, startMessage, usernameMessage, passwordPrompt } =
      ctx.wizard.state;
    const password = ctx.message.text;

    try {
      const processingMsg = await ctx.reply(
        "Logging in to Student Portal, please wait..."
      );

      const response = await axios.post(
        `${config.STUDENT_PORTAL_API_URL}/login`,
        {
          login: username,
          passwd: password,
        }
      );

      try {
        await Promise.all([
          ctx.telegram.deleteMessage(ctx.chat.id, startMessage.message_id),
          ctx.telegram.deleteMessage(ctx.chat.id, usernameMessage.message_id),
          ctx.telegram.deleteMessage(ctx.chat.id, passwordPrompt.message_id),
          ctx.telegram.deleteMessage(
            ctx.chat.id,
            ctx.wizard.state.passwordMessage.message_id
          ),
          ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id),
        ]);
      } catch (deleteError) {}

      if (!response.data?.success || !response.data?.token) {
        await ctx.reply(
          "❌ Student Portal login failed: Invalid credentials. Please try again."
        );
        return ctx.scene.leave();
      }

      const userId = ctx.from.id;
      const token = response.data.token;

      await sessionManager.setStudentPortalSession(userId, {
        token: token,
      });

      await StudentPortalUser.findOneAndUpdate(
        { telegramId: userId },
        {
          telegramId: userId,
          username: username,
          token: token,
          lastLogin: new Date(),
        },
        { upsert: true }
      );

      await ctx.reply(
        "✅ Student Portal login successful! You can now access your academic data."
      );

      return ctx.scene.leave();
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        await ctx.reply(
          "❌ Student Portal login failed: Wrong username or password. Please try again."
        );
      } else {
        await ctx.reply(
          "❌ Student Portal login failed. Please check your credentials and try again."
        );
        logger.error(
          `Student Portal login error for user ${ctx.from.id}: ${error.message}`
        );
      }

      return ctx.scene.leave();
    }
  }
);

module.exports = loginStudentPortalScene;