const sessionManager = require("../utils/sessionManager");

function requireLogin(ctx, next) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!session || !session.csrfToken) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  return next();
}

module.exports = {
  requireLogin,
};