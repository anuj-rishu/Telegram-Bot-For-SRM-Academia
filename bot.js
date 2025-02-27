const { Telegraf, Scenes, session } = require('telegraf');
const axios = require('axios');
require('dotenv').config();

// Initialize bot with token from .env file
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// In-memory storage for user sessions
const sessions = new Map();

// Base API URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

// Create login scene
const loginScene = new Scenes.WizardScene(
  'login',
  async (ctx) => {
    ctx.reply('Please enter your SRM username/registration number:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.username = ctx.message.text;
    ctx.reply('Please enter your password:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const { username } = ctx.wizard.state;
    const password = ctx.message.text;
    
    try {
      ctx.reply('Logging in, please wait...');
      
      const response = await axios.post(`${API_BASE_URL}/login`, {
        account: username,
        password: password
      });
      
      console.log("Login response:", JSON.stringify(response.data, null, 2));
      
      // Extract token from response - from examining the server code, 
      // we need to get the token and use it for both Authorization and X-CSRF-Token
      const userId = ctx.from.id;
      
      if (response.data && response.data.token) {
        // Store both tokens
        sessions.set(userId, {
          token: response.data.token,
          csrfToken: response.data.token
        });
        
        await ctx.reply('✅ Login successful! You can now use the commands to fetch your data.');
      } else {
        console.log("Invalid login response structure:", response.data);
        
        // Check if there's a token in different field
        let foundToken = null;
        if (response.data) {
          for (const key in response.data) {
            if (typeof response.data[key] === 'string' && response.data[key].length > 10) {
              foundToken = response.data[key];
              break;
            }
          }
        }
        
        if (foundToken) {
          sessions.set(userId, {
            token: foundToken,
            csrfToken: foundToken
          });
          await ctx.reply('✅ Login successful! Token found in response. You can now use the commands.');
        } else {
          await ctx.reply('⚠️ Login succeeded but did not receive proper authentication data.');
        }
      }
      
      return ctx.scene.leave();
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      await ctx.reply(`❌ Login failed: ${error.response?.data?.error || error.message}`);
      return ctx.scene.leave();
    }
  }
);

// Create scene manager
const stage = new Scenes.Stage([loginScene]);

// Register middleware
bot.use(session());
bot.use(stage.middleware());

// Helper function to check if user is logged in
function requireLogin(ctx, next) {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  
  if (!session || !session.csrfToken) {
    ctx.reply('You need to login first. Use /login command.');
    return;
  }
  
  return next();
}

// Helper function to make authenticated API requests
async function makeAuthenticatedRequest(url, session) {
  console.log(`Making request to: ${url}`);
  console.log(`Using CSRF Token: ${session.csrfToken ? session.csrfToken.substring(0, 10) + '...' : 'none'}`);
  
  return axios.get(url, {
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'X-CSRF-Token': session.csrfToken
    }
  });
}

// Start command
bot.start((ctx) => {
  ctx.reply(
    'Welcome to the SRM Scraper bot! 🎓\n\n' +
    'This bot helps you access your SRM data.\n\n' +
    'Available commands:\n' +
    '/login - Login to your SRM account\n' +
    '/attendance - Check your attendance\n' +
    '/marks - Check your marks\n' +
    '/timetable - Get your timetable\n' +
    '/user - Get user information\n' +
    '/courses - List enrolled courses\n' +
    '/calendar - Get academic calendar\n' +
    '/logout - Log out from your account\n\n' +
    'To get started, use /login'
  );
});

// Login command
bot.command('login', (ctx) => ctx.scene.enter('login'));

// Logout command
bot.command('logout', requireLogin, async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  
  try {
    await axios.delete(`${API_BASE_URL}/logout`, {
      headers: {
        'Authorization': `Bearer ${session.token}`,
        'X-CSRF-Token': session.csrfToken
      }
    });
    
    sessions.delete(userId);
    ctx.reply('You have been logged out successfully.');
  } catch (error) {
    console.error('Logout error:', error.response?.data || error.message);
    ctx.reply(`Error during logout: ${error.response?.data?.error || error.message}`);
  }
});

// Debug command
bot.command('debug', requireLogin, async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  
  // Create a masked version of the token for display
  const maskedToken = session.token.length > 20 
    ? `${session.token.substring(0, 7)}...${session.token.substring(session.token.length - 7)}` 
    : session.token;
  
  const message = `Bot Debug Info:\n\n` +
    `- User ID: ${userId}\n` +
    `- Token (masked): ${maskedToken}\n` +
    `- Has CSRF Token: ${Boolean(session.csrfToken)}\n` +
    `- API Base URL: ${API_BASE_URL}\n\n` +
    `Try using a command like /user to test your authentication.`;
  
  ctx.reply(message);
});

// Attendance command
bot.command('attendance', requireLogin, async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  
  try {
    ctx.reply('Fetching your attendance data...');
    
    const response = await makeAuthenticatedRequest(`${API_BASE_URL}/attendance`, session);
    
    const attendanceData = response.data;
    let message = '📊 *Your Attendance Summary*\n\n';
    
    if (attendanceData && attendanceData.attendance && attendanceData.attendance.length > 0) {
      // Display registration number if available
      if (attendanceData.regNumber) {
        message += `*Registration Number:* ${attendanceData.regNumber}\n\n`;
      }
      
      // Iterate through each course's attendance
      attendanceData.attendance.forEach(course => {
        message += `📘 *${course.courseTitle}* (${course.courseCode})\n`;
        message += `Category: ${course.category} | Slot: ${course.slot}\n`;
        message += `Faculty: ${course.facultyName}\n`;
        message += `Present: ${parseInt(course.hoursConducted) - parseInt(course.hoursAbsent)}/${course.hoursConducted}\n`;
        message += `Absent: ${course.hoursAbsent}\n`;
        message += `Attendance: ${course.attendancePercentage}%\n\n`;
      });
      
      // Calculate overall attendance
      const totalClasses = attendanceData.attendance.reduce((sum, course) => sum + parseInt(course.hoursConducted), 0);
      const totalAbsent = attendanceData.attendance.reduce((sum, course) => sum + parseInt(course.hoursAbsent), 0);
      const overallPercentage = totalClasses > 0 
        ? ((totalClasses - totalAbsent) / totalClasses * 100).toFixed(2) 
        : 0;
      
      message += `*Overall Attendance: ${overallPercentage}%*`;
    } else {
      message = 'No attendance data available.';
    }
    
    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error('Attendance error:', error.response?.data || error.message);
    ctx.reply(`Error fetching attendance data: ${error.response?.data?.error || error.message}`);
  }
});

// Marks command
// Updated marks command that properly parses the response structure
// Courses command
bot.command('courses', requireLogin, async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  
  try {
    ctx.reply('Fetching your courses...');
    
    const response = await makeAuthenticatedRequest(`${API_BASE_URL}/courses`, session);
    
    const coursesData = response.data;
    let message = '📚 *Your Courses*\n\n';
    
    if (coursesData && coursesData.regNumber) {
      message += `*Registration Number:* ${coursesData.regNumber}\n\n`;
    }
    
    if (coursesData && coursesData.courses && coursesData.courses.length > 0) {
      // Group courses by category
      const coursesByCategory = {};
      
      coursesData.courses.forEach(course => {
        const category = course.courseCategory || 'Other';
        if (!coursesByCategory[category]) {
          coursesByCategory[category] = [];
        }
        coursesByCategory[category].push(course);
      });
      
      // Display courses grouped by category
      for (const category in coursesByCategory) {
        message += `*📋 ${category}*\n\n`;
        
        coursesByCategory[category].forEach(course => {
          message += `📘 *${course.title}* (${course.code})\n`;
          message += `Credit: ${course.credit} | Type: ${course.type}\n`;
          message += `Faculty: ${course.faculty}\n`;
          message += `Slot: ${course.slot} | Room: ${course.room || 'N/A'}\n\n`;
        });
      }
      
      // Add total credits information
      const totalCredits = coursesData.courses.reduce((sum, course) => {
        const credit = parseInt(course.credit) || 0;
        return sum + credit;
      }, 0);
      
      message += `*Total Credits: ${totalCredits}*`;
    } else {
      message = '� *Your Courses*\n\nNo courses data available.';
    }
    
    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error('Courses error:', error.response?.data || error.message);
    ctx.reply(`Error fetching courses: ${error.response?.data?.error || error.message}`);
  }
});

// User info command
bot.command('user', requireLogin, async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  
  try {
    ctx.reply('Fetching your profile...');
    
    const response = await makeAuthenticatedRequest(`${API_BASE_URL}/user`, session);
    
    const user = response.data;
    let message = '👤 *User Information*\n\n';
    
    if (user) {
      message += `Name: ${user.name || 'N/A'}\n`;
      message += `Registration Number: ${user.regNumber || 'N/A'}\n`;
      message += `Email: ${user.email || 'N/A'}\n`;
      message += `Department: ${user.department || 'N/A'}\n`;
      message += `School: ${user.school || 'N/A'}\n`;
      message += `Program: ${user.program || 'N/A'}\n`;
      message += `Semester: ${user.semester || 'N/A'}\n`;
    } else {
      message = 'No user data available.';
    }
    
    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error('User info error:', error.response?.data || error.message);
    ctx.reply(`Error fetching user information: ${error.response?.data?.error || error.message}`);
  }
});

// Timetable command
bot.command('timetable', requireLogin, async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  
  try {
    ctx.reply('Fetching your timetable...');
    
    const response = await makeAuthenticatedRequest(`${API_BASE_URL}/timetable`, session);
    
    const timetable = response.data;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let message = '🗓 *Your Timetable*\n\n';
    
    if (timetable && timetable.days) {
      days.forEach(day => {
        if (timetable.days[day]) {
          message += `*${day}*:\n`;
          
          timetable.days[day].forEach(slot => {
            message += `${slot.time}: ${slot.course} (${slot.room})\n`;
          });
          
          message += '\n';
        }
      });
    } else {
      message = 'No timetable data available.';
    }
    
    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error('Timetable error:', error.response?.data || error.message);
    ctx.reply(`Error fetching timetable: ${error.response?.data?.error || error.message}`);
  }
});

// Courses command
bot.command('courses', requireLogin, async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  
  try {
    ctx.reply('Fetching your courses...');
    
    const response = await makeAuthenticatedRequest(`${API_BASE_URL}/courses`, session);
    
    const courses = response.data;
    let message = '📚 *Your Courses*\n\n';
    
    if (courses && courses.courses && courses.courses.length > 0) {
      courses.courses.forEach((course, index) => {
        message += `${index + 1}. *${course.code || 'N/A'}* - ${course.name || 'N/A'}\n`;
        message += `   Credits: ${course.credits || 'N/A'}\n`;
        message += `   Faculty: ${course.faculty || 'N/A'}\n\n`;
      });
    } else {
      message = 'No courses data available.';
    }
    
    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error('Courses error:', error.response?.data || error.message);
    ctx.reply(`Error fetching courses: ${error.response?.data?.error || error.message}`);
  }
});

// Calendar command
bot.command('calendar', requireLogin, async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  
  try {
    ctx.reply('Fetching academic calendar...');
    
    const response = await makeAuthenticatedRequest(`${API_BASE_URL}/calendar`, session);
    
    const calendar = response.data;
    let message = '📅 *Academic Calendar*\n\n';
    
    if (calendar && calendar.calendar && calendar.calendar.length > 0) {
      calendar.calendar.forEach(month => {
        message += `*${month.month}*\n`;
        
        if (month.days && month.days.length > 0) {
          month.days.forEach(day => {
            message += `${day.date}: ${day.event}\n`;
          });
        } else {
          message += 'No events\n';
        }
        
        message += '\n';
      });
    } else {
      message = 'No calendar data available.';
    }
    
    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error('Calendar error:', error.response?.data || error.message);
    ctx.reply(`Error fetching calendar: ${error.response?.data?.error || error.message}`);
  }
});

// Help command
bot.help((ctx) => {
  ctx.reply(
    'SRM Scraper Bot Commands:\n\n' +
    '/login - Login to your SRM account\n' +
    '/attendance - Check your attendance\n' +
    '/marks - Check your marks\n' +
    '/timetable - Get your timetable\n' +
    '/user - Get user information\n' +
    '/courses - List enrolled courses\n' +
    '/calendar - Get academic calendar\n' +
    '/debug - Show authentication info\n' +
    '/logout - Log out from your account\n' +
    '/help - Show this help message'
  );
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('An error occurred. Please try again later.');
});

// Start the bot
bot.launch()
  .then(() => console.log('Bot started successfully!'))
  .catch(err => console.error('Error starting bot:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));