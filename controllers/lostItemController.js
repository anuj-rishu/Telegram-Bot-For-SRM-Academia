async function handleReportLostItem(ctx) {
  return ctx.scene.enter("lost_item");
}

module.exports = {
  handleReportLostItem
};