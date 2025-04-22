const { Scenes, Markup } = require("telegraf");
const axios = require("axios");
const FormData = require("form-data");
const User = require("../model/user");

const cancelKeyboard = Markup.keyboard([["❌ Cancel"]])
  .oneTime()
  .resize();

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
    if (ctx.message && ctx.message.text === "❌ Cancel") {
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
      fileId = ctx.message.document.file_id;
      fileName = ctx.message.document.file_name;
      fileType = ctx.message.document.mime_type;
    } else if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      fileId = photo.file_id;
      fileName = `photo_${Date.now()}.jpg`;
      fileType = "image/jpeg";
    }

    ctx.wizard.state.uploadDocument.fileId = fileId;
    ctx.wizard.state.uploadDocument.fileName = fileName;
    ctx.wizard.state.uploadDocument.fileType = fileType;

    await ctx.reply(
      "Please enter a custom name for this file:",
      cancelKeyboard
    );

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Upload cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (!ctx.message || !ctx.message.text) {
      await ctx.reply(
        "Please enter a valid custom name for the file:",
        cancelKeyboard
      );
      return;
    }

    ctx.wizard.state.uploadDocument.customName = ctx.message.text;

    await ctx.reply(
      "Please enter a description for this file (optional):\n" +
        "Type /skip to skip this step.",
      cancelKeyboard
    );

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Upload cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (ctx.message && ctx.message.text === "/skip") {
      ctx.wizard.state.uploadDocument.description = "";
    } else if (ctx.message && ctx.message.text) {
      ctx.wizard.state.uploadDocument.description = ctx.message.text;
    } else {
      await ctx.reply(
        "Please enter a description or type /skip to skip this step:",
        cancelKeyboard
      );
      return;
    }

    await ctx.reply(
      "Please enter tags for this file (comma-separated, optional):\n" +
        "Type /skip to skip this step.",
      cancelKeyboard
    );

    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Upload cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (ctx.message && ctx.message.text === "/skip") {
      ctx.wizard.state.uploadDocument.tags = "";
    } else if (ctx.message && ctx.message.text) {
      ctx.wizard.state.uploadDocument.tags = ctx.message.text;
    } else {
      await ctx.reply(
        "Please enter tags or type /skip to skip this step:",
        cancelKeyboard
      );
      return;
    }

    try {
      const userId = ctx.from.id;
      const user = await User.findOne({ telegramId: userId });

      if (!user || !user.token) {
        await ctx.reply(
          "Authentication failed. Please login again with /login",
          Markup.removeKeyboard()
        );
        return ctx.scene.leave();
      }

      const loadingMsg = await ctx.reply("📤 Uploading your document...");

      const fileLink = await ctx.telegram.getFileLink(
        ctx.wizard.state.uploadDocument.fileId
      );

      const fileResponse = await axios.get(fileLink.href, {
        responseType: "arraybuffer",
      });
      const fileBuffer = Buffer.from(fileResponse.data);

      const formData = new FormData();
      formData.append("file", fileBuffer, {
        filename: ctx.wizard.state.uploadDocument.fileName,
        contentType: ctx.wizard.state.uploadDocument.fileType,
      });
      formData.append("customName", ctx.wizard.state.uploadDocument.customName);

      if (ctx.wizard.state.uploadDocument.description) {
        formData.append(
          "description",
          ctx.wizard.state.uploadDocument.description
        );
      }

      if (ctx.wizard.state.uploadDocument.tags) {
        formData.append("tags", ctx.wizard.state.uploadDocument.tags);
      }

      const response = await axios.post(
        "https://vaultify-49479b27c2ec.herokuapp.com/documents/upload",
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            "x-csrf-token": user.token,
            Accept: "application/json",
          },
        }
      );

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      } catch (deleteError) {
        console.log("Error deleting message:", deleteError.message);
      }

      let confirmationMessage =
        "✅ Document uploaded successfully!\n\n" +
        `*File name:* ${ctx.wizard.state.uploadDocument.customName}\n`;

      if (ctx.wizard.state.uploadDocument.description) {
        confirmationMessage += `*Description:* ${ctx.wizard.state.uploadDocument.description}\n`;
      }

      if (ctx.wizard.state.uploadDocument.tags) {
        confirmationMessage += `*Tags:* ${ctx.wizard.state.uploadDocument.tags}\n`;
      }

      confirmationMessage += "\nYour file is now securely stored.";

      await ctx.reply(confirmationMessage, {
        parse_mode: "Markdown",
        ...Markup.removeKeyboard(),
      });
    } catch (error) {
      console.error(
        "Error uploading document:",
        error.response?.data || error.message
      );
      await ctx.reply(
        "❌ Sorry, there was an error uploading your document. Please try again later.",
        Markup.removeKeyboard()
      );
    }

    return ctx.scene.leave();
  }
);

module.exports = uploadDocumentScene;
