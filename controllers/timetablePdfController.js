const axios = require("axios");
const { createLoader } = require("../utils/loader");
const { API_BASE_URL } = require("../config/config");
const logger = require("../utils/logger");
const { requireAuth } = require("../utils/authUtils");

async function handleTimetablePdf(ctx) {
  const sessionManager = require("../utils/sessionManager");
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);
  
  if (!requireAuth(ctx, session)) {
    return;
  }

  const csrfToken = session.csrfToken || "";

  const loader = await createLoader(ctx, " Generating your timetable");

  try {
    const response = await axios.get(`${API_BASE_URL}/timetable-pdf`, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "X-CSRF-Token": csrfToken,
      },
    });

    const filename = `Timetable.pdf`;
    await ctx.replyWithDocument({
      source: Buffer.from(response.data),
      filename,
    });
    await loader.clear();
  } catch (e) {
    logger.error("PDF fetch/send error:", e.message || e);
    await loader.clear();
    ctx.reply(
      `❌ Error fetching PDF: ${
        e.response?.data?.error || e.message || "Unknown error"
      }`
    );
  }
}

module.exports = { handleTimetablePdf };