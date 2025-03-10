# SRM Academia Telegram Bot

A Telegram bot that provides SRM University students with easy access to their academic information, including attendance, marks, class schedules, and real-time notifications.

## 📌 Features

- 🔐 **Secure Authentication**: Login with your SRM credentials.
- 📊 **Attendance Tracking**: Check your attendance percentage for all courses.
- 🎓 **Academic Marks**: View test scores and overall marks for all subjects.
- 📚 **Course Information**: List all enrolled courses with details.
- ⏰ **Timetable Access**: Get your complete weekly class schedule.
- 📅 **Today's Classes**: Quick view of classes scheduled for the day.
- 🔔 **Real-time Notifications**:
  - Daily morning schedule notification at 7:01 AM.
  - Class reminders 30 minutes and 5 minutes before start.
  - Instant notifications when marks or attendance are updated.
- 👤 **User Profile**: View your academic profile information.

## 🚀 Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/anuj-rishu/Telegram-Bot-For-SRM-Academia
   cd Telegram-Bot-For-SRM-Academia
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a `.env` file in the root directory with the following:
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   MONGODB_URI=your_mongo_connection_string
   API_ENDPOINT=your_srm_api_endpoint
   ```

## ⚙️ Configuration

- **Create a new Telegram bot** via [BotFather](https://t.me/botfather) to get your `TELEGRAM_BOT_TOKEN`.
- **Set up a MongoDB database** and get your connection string.
- **Configure the API endpoint** for SRM Academia data.

## 🏃‍♂️ Usage

Start the bot:
```sh
npm start
```

### Bot Commands

- `/start` - Start the bot and view the welcome message.
- `/login` - Login to your SRM account.
- `/attendance` - Check your attendance percentages.
- `/marks` - View your academic marks and test scores.
- `/timetable` - Get your complete weekly timetable.
- `/todaysclass` - View today's scheduled classes.
- `/user` - View your profile information.
- `/courses` - List all enrolled courses.
- `/calendar` - Check the academic calendar.
- `/logout` - Log out from your account.
- `/help` - Show help message with all commands.

## 🧩 Architecture

The bot is structured with the following components:

- **Controllers**: Handle bot commands and user interactions.
- **Services**: Manage API communications and authentication.
- **Models**: Define data structures for MongoDB.
- **Middleware**: Implement auth checks and other processing.
- **Scenes**: Handle multi-step dialogues like login.
- **Notifications**: Real-time updates for marks, attendance, and classes.

## 📚 Tech Stack

- **Node.js** - JavaScript runtime.
- **Telegraf** - Telegram Bot Framework.
- **MongoDB** - Database.
- **Mongoose** - ODM for MongoDB.
- **Axios** - HTTP Client for API calls.
- **Node-Schedule** - Task Scheduling for notifications.

## ⏲️ Notification System

The bot includes three notification services:

- **Timetable Notifications**: Daily schedule and class reminders.
- **Marks Update**: Real-time alerts when grades are updated.
- **Attendance Update**: Real-time alerts when attendance is updated.

## 🔐 Security

- Credentials are deleted from chat after login.
- Authentication tokens are stored securely.
- User sessions are validated before accessing data.

## 📋 Dependencies

Ensure you have the following installed:
- Node.js (v16 or later)
- MongoDB
- Telegram Bot API

## 👨‍💻 Development

This project follows a modular structure:

- `controllers/` - Command handlers.
- `middlewares/` - Authentication checks.
- `models/` - Database schemas.
- `scenes/` - Multi-step dialogues.
- `services/` - External API communication.
- `utils/` - Helper functions.
- `notification/` - Notification services.

## 🧑‍💻 Author

Developed by **Anuj Rishu Tiwari**

- **GitHub**: [anuj-rishu](https://github.com/anuj-rishu)
- **LinkedIn**: [anuj-rishu](https://linkedin.com/in/anuj-rishu)

## 📜 License

This project is open-source and available under the [MIT License](LICENSE).

## 📝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create your feature branch:
   ```sh
   git checkout -b feature/amazing-feature
   ```
3. Commit your changes:
   ```sh
   git commit -m 'Add some amazing feature'
   ```
4. Push to the branch:
   ```sh
   git push origin feature/amazing-feature
   ```
5. Open a Pull Request.

Happy coding! 🚀

