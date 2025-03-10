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

      if (response.data && response.data.error === true) {
        await ctx.reply(
          "❌ Login failed: Wrong username or password. Please try again."
        );
        return ctx.scene.leave();
      }

      if (response.data && response.data.message) {
        const message = response.data.message.toLowerCase();
        if (
          message.includes("invalid") ||
          message.includes("incorrect") ||
          message.includes("wrong") ||
          message.includes("authentication") ||
          message.includes("fail") ||
          message.includes("error")
        ) {
          await ctx.reply(
            "❌ Login failed: Wrong username or password. Please try again."
          );
          return ctx.scene.leave();
        }
      }

      const userId = ctx.from.id;

      let token = null;
      if (response.data && response.data.token) {
        token = response.data.token;
      } else {
        console.log("Token not found directly, searching response...");

        let foundToken = null;
        if (response.data) {
          for (const key in response.data) {
            if (
              typeof response.data[key] === "string" &&
              response.data[key].length >= 20 &&
              (response.data[key].includes(".") ||
                response.data[key].includes("-"))
            ) {
              foundToken = response.data[key];
              break;
            }
          }
        }

        if (foundToken) {
          token = foundToken;
        } else {
          await ctx.reply(
            "❌ Login failed: Unable to authenticate. Please try again."
          );
          return ctx.scene.leave();
        }
      }

      if (!token) {
        await ctx.reply(
          "❌ Login failed: No authentication token received. Please try again."
        );
        return ctx.scene.leave();
      }

      const fetchingMsg = await ctx.reply("Verifying credentials...");

      try {
        const testResponse = await apiService.makeAuthenticatedRequest(
          "/user",
          { token, csrfToken: token }
        );

        if (!testResponse.data || testResponse.data.error) {
          await ctx.telegram.deleteMessage(ctx.chat.id, fetchingMsg.message_id);
          await ctx.reply(
            "❌ Login failed: Invalid credentials. Please try again."
          );
          return ctx.scene.leave();
        }

        sessionManager.setSession(userId, {
          token: token,
          csrfToken: token,
        });

        await ctx.telegram.editMessageText(
          ctx.chat.id,
          fetchingMsg.message_id,
          undefined,
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

        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, fetchingMsg.message_id);
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

        await ctx.reply(
          "✅ Login successful! You can now use the commands from Menu ≡ to fetch your data."
        );
      } catch (error) {
        console.error(
          "Error during authentication verification:",
          error.message
        );

        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, fetchingMsg.message_id);
        } catch (e) {
          console.error("Error deleting message:", e.message);
        }

        if (
          error.response?.status === 401 ||
          error.response?.status === 403 ||
          error.message.includes("Invalid token") ||
          error.message.includes("authentication")
        ) {
          await ctx.reply(
            "❌ Login failed: Invalid credentials. Please try again."
          );
        } else {
          await ctx.reply(
            "❌ Login failed: Could not verify your credentials. Please try again."
          );
        }

        return ctx.scene.leave();
      }

      return ctx.scene.leave();
    } catch (error) {
      console.error("Login error:", error.response?.data || error.message);

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

      if (error.response?.status === 401 || error.response?.status === 403) {
        await ctx.reply(
          "❌ Login failed: Wrong username or password. Please try again."
        );
      } else if (error.response?.data?.error) {
        const errorMsg =
          typeof error.response.data.error === "string"
            ? error.response.data.error.toLowerCase()
            : "";

        if (
          errorMsg.includes("invalid") ||
          errorMsg.includes("incorrect") ||
          errorMsg.includes("wrong") ||
          errorMsg.includes("authentication") ||
          errorMsg.includes("credentials")
        ) {
          await ctx.reply(
            "❌ Login failed: Wrong username or password. Please try again."
          );
        } else {
          await ctx.reply(
            "❌ Login failed. Please check your credentials and try again."
          );
        }
      } else {
        await ctx.reply(
          "❌ Login failed. Please check your credentials and try again."
        );
      }

      return ctx.scene.leave();
    }
  }
);

module.exports = loginScene;
