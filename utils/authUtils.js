const requireAuth = (ctx, session) => {
  if (!session || !session.token) {
    ctx.reply("You need to login first. Use /login command.");
    return false;
  }
  return true;
};

module.exports = {
  requireAuth
};