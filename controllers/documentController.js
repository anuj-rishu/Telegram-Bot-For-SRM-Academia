const axios = require("axios");
const FormData = require("form-data");
const User = require("../model/user");

/**
 * Create loader animation for long-running operations
 * @param {Object} ctx - Telegraf context
 * @param {String} initialText - Initial loading text
 */
async function createLoaderAnimation(ctx, initialText) {
  const loadingFrames = ["⏳", "⌛️", "⏳", "⌛️"];
  const loadingMsg = await ctx.reply(`${loadingFrames[0]} ${initialText}`);

  let frameIndex = 0;
  const intervalId = setInterval(() => {
    frameIndex = (frameIndex + 1) % loadingFrames.length;
    ctx.telegram
      .editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        undefined,
        `${loadingFrames[frameIndex]} ${initialText}`
      )
      .catch(() => {
        clearInterval(intervalId);
      });
  }, 800);

  return {
    messageId: loadingMsg.message_id,
    stop: () => clearInterval(intervalId),
  };
}

/**
 * Handle document upload command
 * @param {Object} ctx - Telegraf context
 */
async function handleUploadDocument(ctx) {
  const userId = ctx.from.id;
  const user = await User.findOne({ telegramId: userId });

  if (!user || !user.token) {
    return ctx.reply("You need to login first. Use /login command.");
  }

  return ctx.scene.enter("upload_document");
}

module.exports = {
  handleUploadDocument,
  createLoaderAnimation,
};