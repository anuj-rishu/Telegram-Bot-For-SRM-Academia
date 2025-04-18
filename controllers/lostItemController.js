/**
 * Handle report lost item command
 * @param {Object} ctx - Telegraf context
 */
async function handleReportLostItem(ctx) {
  return ctx.scene.enter("lost_item");
}

module.exports = {
  handleReportLostItem
};