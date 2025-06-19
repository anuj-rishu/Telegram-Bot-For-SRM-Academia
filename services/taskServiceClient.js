const axios = require("axios");
const ioClient = require("socket.io-client");
const config = require("../config/config");
const logger = require("../utils/logger");

let instance = null;

class TaskServiceClient {
  constructor(bot) {
    if (instance) return instance;
    this.bot = bot;
    this.socket = null;
    this.socketUrl = config.TASK_SERVICE_URL;
    this.apiUrl = `${config.TASK_SERVICE_URL}/api`;
    this.initSocket();

    instance = this;
  }

  setBot(bot) {
    if (bot && bot.telegram) this.bot = bot;
  }

  initSocket() {
    this.socket = ioClient(this.socketUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    this.socket.on("connect", () => {
      logger.info("Task Service: Connected");
      this.socket.emit("bot:register", { botId: "telegram-bot" });
    });

    this.socket.on("task:reminder", async (reminderData) => {
      await this.handleTaskReminder(reminderData);
    });

    this.socket.on("disconnect", () => {
      logger.warn("Task Service: Disconnected");
    });

    this.socket.on("connect_error", (err) => {
      logger.error(`Task Service: Connection error: ${err.message}`);
    });
  }

  async handleTaskReminder(reminderData) {
    try {
      if (!this.bot || !this.bot.telegram) {
        throw new Error("Telegram bot instance is not properly initialized");
      }

      const dueDate = new Date(reminderData.dueDate);
      const formattedDueDate = dueDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      const message =
        `⏰ *Task Reminder*\n\n` +
        `Your task "*${reminderData.taskName}*" is due in ${reminderData.reminderMinutes} minutes (at ${formattedDueDate}).\n\n` +
        (reminderData.description
          ? `*Description:* ${reminderData.description}\n\n`
          : "");

      await this.bot.telegram.sendMessage(reminderData.telegramId, message, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Mark as Complete",
                callback_data: `complete_task:${reminderData.taskId}`,
              },
            ],
          ],
        },
      });
    } catch (error) {
      logger.error(`Task reminder error: ${error.message}`);
    }
  }

  async createTask(taskData) {
    try {
      const response = await axios.post(`${this.apiUrl}/tasks`, taskData);
      return response.data;
    } catch (error) {
      logger.error(`Create task error: ${error.message}`);
      throw error;
    }
  }

  async getTasks(telegramId) {
    try {
      const response = await axios.get(`${this.apiUrl}/tasks/${telegramId}`);
      return response.data;
    } catch (error) {
      logger.error(`Get tasks error: ${error.message}`);
      throw error;
    }
  }

  async completeTask(taskId, telegramId) {
    try {
      const response = await axios.put(
        `${this.apiUrl}/tasks/${taskId}/complete`,
        {
          telegramId,
        }
      );
      return response.data;
    } catch (error) {
      logger.error(`Complete task error: ${error.message}`);
      throw error;
    }
  }

  async deleteTasks(taskIds, telegramId) {
    try {
      const response = await axios.delete(`${this.apiUrl}/tasks`, {
        data: { taskIds, telegramId },
      });
      return response.data;
    } catch (error) {
      logger.error(`Delete tasks error: ${error.message}`);
      throw error;
    }
  }
}

function getTaskServiceClient(bot) {
  if (!instance && bot) {
    return new TaskServiceClient(bot);
  }

  if (instance && bot) {
    instance.setBot(bot);
  }

  return instance;
}

module.exports = getTaskServiceClient;
