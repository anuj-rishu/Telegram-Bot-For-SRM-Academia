const { Scenes, Markup } = require("telegraf");
const apiService = require("../services/apiService");
const sessionManager = require("../utils/sessionManager");
const User = require("../model/user");
const InactiveUser = require("../model/inactiveUser");
const logger = require("../utils/logger");
const config = require("../config/config");

const loginScene = new Scenes.WizardScene(
  "login",
  async (ctx) => {
    try {
      const userId = ctx.from.id;
      const session = sessionManager.getSession(userId);
      
      if (session?.token) {
        await ctx.reply("You are already logged in. Please use /logout first if you want to login with a different account.");
        return ctx.scene.leave();
      }
      
      const user = await User.findOne({ telegramId: userId, loginStatus: "active" });
      if (user?.token) {
        await sessionManager.setSession(userId, { token: user.token, csrfToken: user.token });
        await ctx.reply("You are already logged in. Please use /logout first if you want to login with a different account.");
        return ctx.scene.leave();
      }
      
      ctx.wizard.state.isReactivation = Boolean(await InactiveUser.findOne({ telegramId: userId }));
      ctx.wizard.state.isRelogin = Boolean(ctx.scene.state?.expiredToken);
      
      ctx.wizard.state.privacyMessage = await ctx.reply(
        "Before you continue, please review and agree to our Privacy Policy to use this bot.",
        Markup.inlineKeyboard([
          [Markup.button.url("View Privacy Policy", config.PRIVACY_URL)],
          [Markup.button.callback("Agree", "agree_privacy"), Markup.button.callback("Disagree", "disagree_privacy")]
        ])
      );
    } catch (error) {
      logger.error(`Error in login check: ${error.message}`);
      await ctx.reply("There was an error checking your login status. Please try again later.");
      return ctx.scene.leave();
    }
  },
  
  async (ctx) => {
    if (!ctx.wizard.state.privacyAccepted) return;
    ctx.wizard.state.usernameMessage = ctx.message;
    ctx.wizard.state.username = ctx.message.text;
    ctx.wizard.state.passwordPrompt = await ctx.reply("Please enter your password:");
    return ctx.wizard.next();
  },
  
  async (ctx) => {
    ctx.wizard.state.passwordMessage = ctx.message;
    const { username } = ctx.wizard.state;
    const password = ctx.message.text;
    const userId = ctx.from.id;
    
    const messages = [
      ctx.wizard.state.startMessage,
      ctx.wizard.state.usernameMessage,
      ctx.wizard.state.passwordPrompt,
      ctx.wizard.state.passwordMessage
    ];
    
    try {
      const processingMsg = await ctx.reply("Logging in, please wait...");
      messages.push(processingMsg);
      
      const loginResponse = await apiService.login(username, password);
      await deleteMessages(ctx, messages);
      
      if (loginResponse.data?.error || isErrorMessage(loginResponse.data?.message)) {
        await ctx.reply("❌ Login failed: Wrong username or password. Please try again.");
        return ctx.scene.leave();
      }
      
      const token = extractToken(loginResponse.data);
      if (!token) {
        await ctx.reply("❌ Login failed: No authentication token received. Please try again.");
        logger.error(`No token found in login response for user ${userId}`);
        return ctx.scene.leave();
      }
      
      const fetchingMsg = await ctx.reply("Verifying credentials...");
      
      try {
        const testResponse = await apiService.makeAuthenticatedRequest("/user", { token, csrfToken: token });
        if (!testResponse.data || testResponse.data.error) {
          await ctx.telegram.deleteMessage(ctx.chat.id, fetchingMsg.message_id).catch(() => {});
          await ctx.reply("❌ Login failed: Invalid credentials. Please try again.");
          return ctx.scene.leave();
        }
        
        await sessionManager.setSession(userId, { token, csrfToken: token });
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          fetchingMsg.message_id,
          undefined,
          "Fetching and saving your academic data..."
        ).catch(() => {});
        
        const [userResponse, marksResponse, attendanceResponse] = await Promise.all([
          apiService.makeAuthenticatedRequest("/user", { token, csrfToken: token }),
          apiService.makeAuthenticatedRequest("/marks", { token, csrfToken: token }),
          apiService.makeAuthenticatedRequest("/attendance", { token, csrfToken: token }),
        ]);
        
        await ctx.telegram.deleteMessage(ctx.chat.id, fetchingMsg.message_id).catch(() => {});
        
        const userData = userResponse.data || {};
        const regNumber = userData?.regNumber || marksResponse.data?.regNumber || 
                          attendanceResponse.data?.regNumber || username;
        
        await User.findOneAndUpdate(
          { telegramId: userId },
          {
            telegramId: userId,
            username,
            regNumber,
            token,
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
            loginStatus: "active",
          },
          { upsert: true, new: true }
        );
        
        if (ctx.wizard.state.isRelogin) {
          await ctx.reply("✅ Re-authentication successful! Your session has been restored.");
          await ctx.reply("All notification services are now active again. You can continue using the bot commands from Menu ≡");
        } else if (ctx.wizard.state.isReactivation) {
          await ctx.reply("✅ Welcome back! Your account has been reactivated successfully.");
          await ctx.reply("All your previous data and settings have been restored. You can continue using the bot commands from Menu ≡");
        } else {
          await ctx.reply("✅ Login successful! You can now use the commands from Menu ≡ to fetch your data.");
        }
      } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, fetchingMsg.message_id).catch(() => {});
        
        if (isAuthError(error)) {
          await ctx.reply("❌ Login failed: Invalid credentials. Please try again.");
          logger.error(`Authentication error for user ${userId}: ${error.message}`);
        } else {
          await ctx.reply("❌ Login failed: Could not verify your credentials. Please try again.");
          logger.error(`Unknown error during login for user ${userId}: ${error.message}`);
        }
      }
    } catch (error) {
      await deleteMessages(ctx, messages);
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        await ctx.reply("❌ Login failed: Wrong username or password. Please try again.");
      } else {
        await ctx.reply("❌ Login failed. Please check your credentials and try again.");
        logger.error(`Login error for user ${userId}: ${error.message}`);
      }
    }
    
    return ctx.scene.leave();
  }
);

function isErrorMessage(message) {
  if (!message) return false;
  const errorKeywords = ["invalid", "incorrect", "wrong", "authentication", "fail", 
                         "error", "credentials", "expired", "timeout", "denied", "unauthorized"];
  return errorKeywords.some(keyword => String(message).toLowerCase().includes(keyword));
}

function isAuthError(error) {
  return error.response?.status === 401 || 
         error.response?.status === 403 || 
         error.message?.includes("Invalid token") ||
         error.message?.includes("authentication") ||
         error.message === "TOKEN_EXPIRED";
}

function extractToken(data) {
  if (!data) return null;
  if (data.token) return data.token;
  
  return Object.values(data).find(value => 
    typeof value === "string" && 
    value.length >= 20 && 
    (value.includes(".") || value.includes("-"))
  ) || null;
}

async function deleteMessages(ctx, messages) {
  try {
    await Promise.all(
      messages
        .filter(Boolean)
        .map(msg => ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {}))
    );
  } catch {}
}

loginScene.action("agree_privacy", async (ctx) => {
  try {
    ctx.wizard.state.privacyAccepted = true;
    await ctx.editMessageText("Thank you for agreeing to the Privacy Policy.");
    
    let welcomeText = "Please enter your SRM username/email:";
    if (ctx.wizard.state.isRelogin) {
      welcomeText = "Your session has expired. Please enter your SRM username/email to reconnect:";
    } else if (ctx.wizard.state.isReactivation) {
      welcomeText = "Welcome back! Please enter your SRM username/email to reactivate your account:";
    }
    
    ctx.wizard.state.startMessage = await ctx.reply(welcomeText);
    return ctx.wizard.next();
  } catch (error) {
    logger.error(`Error in privacy agree: ${error.message}`);
    await ctx.reply("An error occurred. Please try again.");
    return ctx.scene.leave();
  }
});

loginScene.action("disagree_privacy", async (ctx) => {
  try {
    await ctx.editMessageText("You must agree to the Privacy Policy to use this bot.");
    return ctx.scene.leave();
  } catch (error) {
    logger.error(`Error in privacy disagree: ${error.message}`);
    return ctx.scene.leave();
  }
});

loginScene.enterAfterTokenExpiry = async (ctx) => {
  ctx.scene.state = { expiredToken: true };
  return ctx.scene.enter("login");
};

module.exports = loginScene;