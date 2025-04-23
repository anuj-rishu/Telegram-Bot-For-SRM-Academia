const { Scenes, Markup } = require("telegraf");
const axios = require("axios");
const FormData = require("form-data");
const User = require("../model/user");
const config = require("../config/config");

const cancelKeyboard = Markup.keyboard([["❌ Cancel"]])
  .oneTime()
  .resize();

/**
 * Create a loader animation with a loading message
 * @param {Object} ctx - Telegraf context
 * @param {String} text - Loading text to display
 * @returns {Object} Loader controller
 */
async function createLoader(ctx, text) {
  const frames = ["⏳", "⌛️", "⏳", "⌛️"];
  const msg = await ctx.reply(`${frames[0]} ${text}`);
  let idx = 0,
    intervalId;

  intervalId = setInterval(() => {
    idx = (idx + 1) % frames.length;
    ctx.telegram
      .editMessageText(
        ctx.chat.id,
        msg.message_id,
        undefined,
        `${frames[idx]} ${text}`
      )
      .catch(() => clearInterval(intervalId));
  }, 800);

  return {
    messageId: msg.message_id,
    stop: () => clearInterval(intervalId),
    async clear() {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, this.messageId);
        this.stop();
      } catch (err) {
        console.error("Error clearing loader:", err.message);
      }
    },
  };
}

const uploadDocumentScene = new Scenes.WizardScene(
  "upload_document",

  async (ctx) => {
    ctx.wizard.state.uploadDocument = {};

    await ctx.reply(
      "Please send me the file you want to upload:",
      cancelKeyboard
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message?.text === "❌ Cancel") {
      await ctx.reply("Upload cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (!ctx.message || (!ctx.message.document && !ctx.message.photo)) {
      await ctx.reply(
        "Please send a file to upload (document or photo):",
        cancelKeyboard
      );
      return;
    }

    let fileId, fileName, fileType;

    if (ctx.message.document) {
      ({
        file_id: fileId,
        file_name: fileName,
        mime_type: fileType,
      } = ctx.message.document);
    } else if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      fileId = photo.file_id;
      fileName = `photo_${Date.now()}.jpg`;
      fileType = "image/jpeg";
    }

    Object.assign(ctx.wizard.state.uploadDocument, {
      fileId,
      fileName,
      fileType,
    });

    await ctx.reply(
      "Please enter a custom name for this file:",
      cancelKeyboard
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    // Handle cancellation
    if (ctx.message?.text === "❌ Cancel") {
      await ctx.reply("Upload cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (!ctx.message?.text) {
      await ctx.reply(
        "Please enter a valid custom name for the file:",
        cancelKeyboard
      );
      return;
    }

    ctx.wizard.state.uploadDocument.customName = ctx.message.text;

    await ctx.reply(
      "Please enter a description for this file (optional):\nType /skip to skip this step.",
      cancelKeyboard
    );

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message?.text === "❌ Cancel") {
      await ctx.reply("Upload cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (ctx.message?.text === "/skip") {
      ctx.wizard.state.uploadDocument.description = "";
    } else if (ctx.message?.text) {
      ctx.wizard.state.uploadDocument.description = ctx.message.text;
    } else {
      await ctx.reply(
        "Please enter a description or type /skip to skip this step:",
        cancelKeyboard
      );
      return;
    }

    await ctx.reply(
      "Please enter tags for this file (comma-separated, optional):\nType /skip to skip this step.",
      cancelKeyboard
    );

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message?.text === "❌ Cancel") {
      await ctx.reply("Upload cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (ctx.message?.text === "/skip") {
      ctx.wizard.state.uploadDocument.tags = "";
    } else if (ctx.message?.text) {
      ctx.wizard.state.uploadDocument.tags = ctx.message.text;
    } else {
      await ctx.reply(
        "Please enter tags or type /skip to skip this step:",
        cancelKeyboard
      );
      return;
    }

    try {
      const user = await User.findOne({ telegramId: ctx.from.id });
      if (!user?.token) {
        await ctx.reply(
          "Authentication failed. Please login again with /login",
          Markup.removeKeyboard()
        );
        return ctx.scene.leave();
      }

      const loader = await createLoader(
        ctx,
        "📤 Downloading and uploading your document..."
      );

      try {
        const fileLink = await ctx.telegram.getFileLink(
          ctx.wizard.state.uploadDocument.fileId
        );

        const { data: fileData } = await axios.get(fileLink.href, {
          responseType: "arraybuffer",
        });
        const fileBuffer = Buffer.from(fileData);

        const formData = new FormData();
        formData.append("file", fileBuffer, {
          filename: ctx.wizard.state.uploadDocument.fileName,
          contentType: ctx.wizard.state.uploadDocument.fileType,
        });
        formData.append(
          "customName",
          ctx.wizard.state.uploadDocument.customName
        );

        if (ctx.wizard.state.uploadDocument.description) {
          formData.append(
            "description",
            ctx.wizard.state.uploadDocument.description
          );
        }

        if (ctx.wizard.state.uploadDocument.tags) {
          formData.append("tags", ctx.wizard.state.uploadDocument.tags);
        }

        await axios.post(
          `${config.VAULTIFY_API_URL}/documents/upload`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
              "x-csrf-token": user.token,
              Accept: "application/json",
            },
          }
        );

        await loader.clear();

        const confirmationParts = [
          "✅ Document uploaded successfully!\n\n",
          `*File name:* ${ctx.wizard.state.uploadDocument.customName}\n`,
        ];

        if (ctx.wizard.state.uploadDocument.description) {
          confirmationParts.push(
            `*Description:* ${ctx.wizard.state.uploadDocument.description}\n`
          );
        }

        if (ctx.wizard.state.uploadDocument.tags) {
          confirmationParts.push(
            `*Tags:* ${ctx.wizard.state.uploadDocument.tags}\n`
          );
        }

        confirmationParts.push("\nYour file is now securely stored.");

        await ctx.reply(confirmationParts.join(""), {
          parse_mode: "Markdown",
          ...Markup.removeKeyboard(),
        });
      } catch (error) {
        // Error handling
        await loader.clear();
        console.error(
          "Error uploading document:",
          error.response?.data || error.message
        );
        await ctx.reply(
          "❌ Sorry, there was an error uploading your document. Please try again later.",
          Markup.removeKeyboard()
        );
      }
    } catch (error) {
      console.error("Error in upload process:", error.message);
      await ctx.reply(
        "❌ An unexpected error occurred. Please try again later.",
        Markup.removeKeyboard()
      );
    }

    return ctx.scene.leave();
  }
);

module.exports = uploadDocumentScene;
