const express = require("express");
const router = express.Router();
const bot = require("../bot");

//webhook
router.post("/", (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

module.exports = router;
