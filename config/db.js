const mongoose = require("mongoose");
const logger = require("../utils/logger");
const config = require("..//config/config");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.MONGODB_URI);
    logger.info('MongoDB: Connected');
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
