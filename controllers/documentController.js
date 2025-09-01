const axios = require("axios");
const User = require("../model/user");
const { Markup } = require("telegraf");
const config = require("../config/config");
const logger = require("../utils/logger");
const { createLoader } = require("../utils/loader");
const sessionManager = require("../utils/sessionManager");
const { requireAuth } = require("../utils/authUtils");

const MIME_TO_EXT = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/gif": ".gif",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/vnd.ms-excel": ".xls",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/zip": ".zip",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/x-rar-compressed": ".rar",
  "application/x-tar": ".tar",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
};

const apiRequest = async (endpoint, token, options = {}) => {
  const url = `${config.VAULTIFY_API_URL}${endpoint}`;
  const headers = {
    "x-csrf-token": token,
    Accept: "application/json",
    ...options.headers,
  };
  return axios({
    url,
    method: options.method || "get",
    headers,
    data: options.data,
    responseType: options.responseType || "json",
  });
};

const format = {
  fileSize: (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(1) + " GB";
  },
  date: (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  },
  filename: (name, mimeType) => {
    const ext = MIME_TO_EXT[mimeType] || "";
    const hasExt =
      name.lastIndexOf(".") > name.lastIndexOf("/") &&
      name.lastIndexOf(".") !== -1;
    return hasExt ? name : name + ext;
  },
};

async function handleUploadDocument(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }
  
  return ctx.scene.enter("upload_document");
}

async function handleGetDocuments(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }

  try {
    const loader = await createLoader(ctx, "Fetching your documents...");
    const response = await apiRequest("/documents/", session.token);
    await loader.clear();

    const documents = response.data;
    if (!documents?.length) {
      return ctx.reply(
        "You don't have any documents yet. Use /uploaddoc to upload your first document."
      );
    }

    for (let i = 0; i < documents.length; i += 5) {
      const chunk = documents.slice(i, i + 5);
      let message = i === 0 ? "📁 *Your Documents*\n\n" : "*More Documents*\n\n";
      chunk.forEach((doc, idx) => {
        const docNum = i + idx + 1;
        message += `*${docNum}. 📄 ${doc.fileName}*\n`;
        message += `Type: ${doc.fileType}\n`;
        message += `Size: ${format.fileSize(doc.fileSize)}\n`;
        if (doc.description) message += `Description: ${doc.description}\n`;
        if (doc.tags?.length) message += `Tags: ${doc.tags.join(", ")}\n`;
        message += `Uploaded: ${format.date(doc.createdAt)}\n\n`;
      });
      const buttons = chunk.map((doc) => [
        Markup.button.callback(`📄 Get ${doc.fileName}`, `send_doc:${doc.id}`),
      ]);
      await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(buttons));
    }
  } catch (error) {
    logger.error("Error fetching documents:", error.response?.data || error.message);
    await ctx.reply(
      "❌ Sorry, there was an error retrieving your documents. Please try again later."
    );
  }
}

async function handleSendDocument(ctx, documentId) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);

  if (!requireAuth(ctx, session)) {
    return;
  }

  try {
    const loader = await createLoader(ctx, "Preparing document for sending...");
    const response = await apiRequest("/documents/", session.token);
    const document = response.data.find((doc) => doc.id === documentId);

    if (!document) {
      await loader.clear();
      return ctx.reply(
        "Document not found. It may have been deleted or you don't have access to it."
      );
    }

    const fileResponse = await axios.get(document.downloadUrl, {
      responseType: "arraybuffer",
    });
    await loader.clear();

    const caption = [
      `📄 *${document.fileName}*`,
      document.description && `\n\n${document.description}`,
      document.tags?.length && `\n\nTags: ${document.tags.join(", ")}`,
    ]
      .filter(Boolean)
      .join("");

    if (ctx.callbackQuery) ctx.answerCbQuery("Sending your document...");

    const filename = format.filename(document.fileName, document.fileType);
    await ctx.replyWithDocument(
      { source: Buffer.from(fileResponse.data), filename },
      { caption, parse_mode: "Markdown" }
    );
  } catch (error) {
    logger.error("Error sending document:", error.response?.data || error.message);
    if (ctx.callbackQuery)
      ctx.answerCbQuery("Error sending document", { show_alert: true });
    await ctx.reply(
      "❌ Sorry, there was an error retrieving your documents. Please try again later."
    );
  }
}

module.exports = {
  handleUploadDocument,
  handleGetDocuments,
  handleSendDocument,
};