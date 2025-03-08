const { Scenes } = require("telegraf");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const User = require("../model/user");

const loginScene = new Scenes.WizardScene(
  "login",
  async (ctx) => {
    ctx.wizard.state.startMessage = await ctx.reply(
      "Please enter your SRM username/email:"
    );
    return ctx.wizard.next();
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
    // Store password message
    ctx.wizard.state.passwordMessage = ctx.message;
    const { username, startMessage, usernameMessage, passwordPrompt } =
      ctx.wizard.state;
    const password = ctx.message.text;

    try {
      const processingMsg = await ctx.reply("Logging in, please wait...");

      const response = await apiService.login(username, password);

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, startMessage.message_id);
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          usernameMessage.message_id
        );
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          passwordPrompt.message_id
        );
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          ctx.wizard.state.passwordMessage.message_id
        );
        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
      } catch (deleteError) {
        console.error("Error deleting messages:", deleteError);
      }

      console.log("Login response:", JSON.stringify(response.data, null, 2));

      const userId = ctx.from.id;

      let token = null;
      if (response.data && response.data.token) {
        token = response.data.token;
        sessionManager.setSession(userId, {
          token: token,
          csrfToken: token,
        });

        await ctx.reply(
          "✅ Login successful! You can now use the commands to fetch your data."
        );
      } else {
        console.log("Invalid login response structure:", response.data);

        let foundToken = null;
        if (response.data) {
          for (const key in response.data) {
            if (
              typeof response.data[key] === "string" &&
              response.data[key].length > 10
            ) {
              foundToken = response.data[key];
              break;
            }
          }
        }

        if (foundToken) {
          token = foundToken;
          sessionManager.setSession(userId, {
            token: foundToken,
            csrfToken: foundToken,
          });
          await ctx.reply(" 🕔 Please Wait.....");
        } else {
          await ctx.reply(
            "⚠️ Login succeeded but did not receive proper authentication data."
          );
          return ctx.scene.leave();
        }
      }

      if (token) {
        try {
          const fetchingMsg = await ctx.reply(
            "Fetching and saving your academic data..."
          );

          const userResponse = await apiService.makeAuthenticatedRequest(
            "/user",
            { token, csrfToken: token }
          );

          const marksResponse = await apiService.makeAuthenticatedRequest(
            "/marks",
            { token, csrfToken: token }
          );

          const attendanceResponse = await apiService.makeAuthenticatedRequest(
            "/attendance",
            { token, csrfToken: token }
          );

          // Delete fetching message
          try {
            await ctx.telegram.deleteMessage(
              ctx.chat.id,
              fetchingMsg.message_id
            );
          } catch (deleteError) {
            console.error("Error deleting fetching message:", deleteError);
          }

          const userData = userResponse.data || {};

          const regNumber =
            (userData && userData.regNumber) ||
            (marksResponse.data && marksResponse.data.regNumber) ||
            (attendanceResponse.data && attendanceResponse.data.regNumber) ||
            username;

          await User.findOneAndUpdate(
            { telegramId: userId },
            {
              telegramId: userId,
              username: username,
              regNumber: regNumber,
              token: token,
              name: userData.name,
              email: userData.email,
              department: userData.department,
              school: userData.school,
              program: userData.program,
              semester: userData.semester,
              marks: marksResponse.data,
              attendance: attendanceResponse.data,
              userInfo: userData,
              lastLogin: new Date(),
            },
            { upsert: true, new: true }
          );

          ctx.reply("✅ Login successfull!");
        } catch (error) {
          console.error("Error saving academic data:", error.message);
          ctx.reply(
            "⚠️ Login successful, but there was an error saving your academic data."
          );
        }
      }

      return ctx.scene.leave();
    } catch (error) {
      console.error("Login error:", error.response?.data || error.message);

      // Try to delete credential messages even on error
      try {
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          ctx.wizard.state.startMessage.message_id
        );
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          ctx.wizard.state.usernameMessage.message_id
        );
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          ctx.wizard.state.passwordPrompt.message_id
        );
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          ctx.wizard.state.passwordMessage.message_id
        );
      } catch (deleteError) {
        console.error("Error deleting messages on login failure:", deleteError);
      }

      await ctx.reply(
        `❌ Login failed: ${error.response?.data?.error || error.message}`
      );
      return ctx.scene.leave();
    }
  }
);

module.exports = loginScene;
