const sessionManager = require('../utils/sessionManager');

/**
 * Middleware to check if user is logged in
 * @param {Object} ctx - Telegraf context
 * @param {Function} next - Next middleware
 */
function requireLogin(ctx, next) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);
  
  if (!session || !session.csrfToken) {
    ctx.reply('You need to login first. Use /login command.');
    return;
  }
  
  return next();
}

module.exports = {
  requireLogin
};