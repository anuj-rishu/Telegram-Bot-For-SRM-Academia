const sessionManager = require("../utils/sessionManager");
const StudentPortalUser = require("../model/studentPortalUser");
const logger = require("../utils/logger");

async function handleLogout(ctx) {
  try {
    const userId = ctx.from.id;
    
    const result = sessionManager.deleteStudentPortalSession(userId);

    if (result) {
      await ctx.reply(
        "You have been successfully logged out from the Student Portal."
      );
    } else {
      await ctx.reply("You are not currently logged into the Student Portal.");
    }

    return true;
  } catch (error) {
    logger.error(
      `Student Portal logout error for user ${ctx.from.id}: ${error.message}`
    );
    await ctx.reply("An error occurred during logout. Please try again later.");
    return false;
  }
}

module.exports = {
  handleLogout,
};