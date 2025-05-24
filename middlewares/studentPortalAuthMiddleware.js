const sessionManager = require("../utils/sessionManager");

async function requireStudentPortalLogin(ctx, next) {
  const session = sessionManager.getStudentPortalSession(ctx.from.id);
  if (!session || !session.token) {
    await ctx.reply(
      "You need to login to the Student Portal first. Use /loginstudentportal command."
    );
    return;
  }
  
  return next();
}

module.exports = {
  requireStudentPortalLogin
};