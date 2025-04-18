const { Scenes, Markup } = require("telegraf");
const axios = require("axios");
const FormData = require("form-data");
const sessionManager = require("../utils/sessionManager");
const User = require("../model/user");
const config = require("../config/config");

const cancelKeyboard = Markup.keyboard([["❌ Cancel"]]).resize();

const lostItemScene = new Scenes.WizardScene(
  "lost_item",

  async (ctx) => {
    ctx.wizard.state.lostItem = {};

    const userId = ctx.from.id;
    const session = sessionManager.getSession(userId);

    if (!session || !session.token) {
      await ctx.reply(
        "You need to be logged in to report lost items. Use /login first."
      );
      return ctx.scene.leave();
    }

    try {
      const user = await User.findOne({ telegramId: userId });

      if (!user) {
        await ctx.reply(
          "Your user profile is incomplete. Please /login again or contact support."
        );
        return ctx.scene.leave();
      }

      const userName = user.userInfo?.name || user.name || user.username;
      const userContact = user.userInfo?.mobile
        ? user.userInfo.mobile
        : user.email ||
          user.regNumber ||
          `@${ctx.from.username || "telegram_user"}`;

      ctx.wizard.state.lostItem.finder_name = userName;
      ctx.wizard.state.lostItem.finder_contact = userContact;

      await ctx.reply(
        "What item did you find? (e.g., Wallet, ID Card, Keys)\n\nYou can cancel anytime by clicking ❌ Cancel.",
        cancelKeyboard
      );
      return ctx.wizard.next();
    } catch (error) {
      console.error("Error fetching user data:", error);
      await ctx.reply("Something went wrong. Please try again later.");
      return ctx.scene.leave();
    }
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Report cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (!ctx.message || !ctx.message.text) {
      await ctx.reply("Please enter a valid item name:", cancelKeyboard);
      return;
    }

    ctx.wizard.state.lostItem.item_name = ctx.message.text;
    await ctx.reply(
      "*(Optional)* Please provide a description of the item:\n\nType /skip to continue without adding a description.",
      cancelKeyboard
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Report cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (ctx.message && ctx.message.text === "/skip") {
      ctx.wizard.state.lostItem.item_description = "No description provided";
    } else {
      ctx.wizard.state.lostItem.item_description =
        ctx.message?.text || "No description provided";
    }

    await ctx.reply(
      "Where did you find this item? (e.g., Library, Cafeteria, Room 302)",
      cancelKeyboard
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Report cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (!ctx.message || !ctx.message.text) {
      await ctx.reply("Please enter a valid location:", cancelKeyboard);
      return;
    }

    ctx.wizard.state.lostItem.location_found = ctx.message.text;
    await ctx.reply(
      "Please upload a photo of the item (send as an image, not as a file):",
      cancelKeyboard
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message && ctx.message.text === "❌ Cancel") {
      await ctx.reply("Report cancelled.", Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (!ctx.message || !ctx.message.photo || ctx.message.photo.length === 0) {
      await ctx.reply(
        "Please send a photo of the item (as an image, not as a file):",
        cancelKeyboard
      );
      return;
    }

    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];

      const loadingMsg = await ctx.reply(
        "📤 Uploading image and submitting your report..."
      );

      const fileLink = await ctx.telegram.getFileLink(photo.file_id);

      const imageResponse = await axios.get(fileLink.href, {
        responseType: "arraybuffer",
      });
      const imageBuffer = Buffer.from(imageResponse.data);

      const formData = new FormData();
      formData.append("item_name", ctx.wizard.state.lostItem.item_name);
      formData.append(
        "item_description",
        ctx.wizard.state.lostItem.item_description
      );
      formData.append(
        "location_found",
        ctx.wizard.state.lostItem.location_found
      );
      formData.append("finder_name", ctx.wizard.state.lostItem.finder_name);
      formData.append(
        "finder_contact",
        ctx.wizard.state.lostItem.finder_contact
      );
      formData.append("found_date", new Date().toISOString());
      formData.append("status", "lost");

      formData.append("image", imageBuffer, {
        filename: "item_image.jpg",
        contentType: "image/jpeg",
      });

        const response = await axios.post(
          config.LOST_ITEM_API_URL,
          formData,
        {
          headers: {
            ...formData.getHeaders(),
            Accept: "application/json",
          },
        }
      );

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      } catch (deleteError) {
        console.log("Error deleting message:", deleteError.message);
      }

      await ctx.reply(
        "✅ Item reported successfully!\n\n" +
          `*Item:* ${ctx.wizard.state.lostItem.item_name}\n` +
          `*Description:* ${ctx.wizard.state.lostItem.item_description}\n` +
          `*Location:* ${ctx.wizard.state.lostItem.location_found}\n` +
          `*Reported by:* ${ctx.wizard.state.lostItem.finder_name}\n\n` +
          "Thank you for helping return this item to its owner!",
        {
          parse_mode: "Markdown",
          ...Markup.removeKeyboard(),
        }
      );
    } catch (error) {
      console.error(
        "Error submitting lost item report:",
        error.response?.data || error.message
      );
      await ctx.reply(
        "❌ Sorry, there was an error submitting your report. Please try again later.",
        Markup.removeKeyboard()
      );
    }

    return ctx.scene.leave();
  }
);

module.exports = lostItemScene;
