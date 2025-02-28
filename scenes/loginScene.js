const { Scenes } = require("telegraf");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");

// Create login scene
const loginScene = new Scenes.WizardScene(
  "login",
  async (ctx) => {
    ctx.reply("Please enter your SRM username/registration number:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.username = ctx.message.text;
    ctx.reply("Please enter your password:");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const { username } = ctx.wizard.state;
    const password = ctx.message.text;

    try {
      ctx.reply("Logging in, please wait...");

      const response = await apiService.login(username, password);

      console.log("Login response:", JSON.stringify(response.data, null, 2));

      const userId = ctx.from.id;

      if (response.data && response.data.token) {
        // Store both tokens
        sessionManager.setSession(userId, {
          token: response.data.token,
          csrfToken: response.data.token,
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
          sessionManager.setSession(userId, {
            token: foundToken,
            csrfToken: foundToken,
          });
          await ctx.reply(
            "✅ Login successful! Token found in response. You can now use the commands."
          );
        } else {
          await ctx.reply(
            "⚠️ Login succeeded but did not receive proper authentication data."
          );
        }
      }

      return ctx.scene.leave();
    } catch (error) {
      console.error("Login error:", error.response?.data || error.message);
      await ctx.reply(
        `❌ Login failed: ${error.response?.data?.error || error.message}`
      );
      return ctx.scene.leave();
    }
  }
);

module.exports = loginScene;
