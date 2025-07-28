const axios = require("axios");
const { createLoader } = require("../utils/loader");
const { API_BASE_URL } = require("../config/config");

async function handleTimetablePdf(ctx) {
  const sessionManager = require("../utils/sessionManager");
  const session = sessionManager.getSession(ctx.from.id);
  if (!session?.token) return ctx.reply("🔒 Please login first using /login.");

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
    console.error("PDF fetch/send error:", e);
    await loader.clear();
    ctx.reply(
      `❌ Error fetching PDF: ${
        e.response?.data?.error || e.message || "Unknown error"
      }`
    );
  }
}

module.exports = { handleTimetablePdf };
