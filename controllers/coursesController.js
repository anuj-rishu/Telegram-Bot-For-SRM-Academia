const apiService = require('../services/apiService');
const sessionManager = require('../utils/sessionManager');

/**
 * Handle courses command
 * @param {Object} ctx - Telegraf context
 */
async function handleCourses(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);
  
  try {
    ctx.reply('Fetching your courses...');
    
    const response = await apiService.makeAuthenticatedRequest('/courses', session);
    
    const coursesData = response.data;
    let message = '📚 *Your Courses*\n\n';
    
    if (coursesData && coursesData.regNumber) {
      message += `*Registration Number:* ${coursesData.regNumber}\n\n`;
    }
    
    if (coursesData && coursesData.courses && coursesData.courses.length > 0) {
      
      const coursesByCategory = {};
      
      coursesData.courses.forEach(course => {
        const category = course.courseCategory || 'Other';
        if (!coursesByCategory[category]) {
          coursesByCategory[category] = [];
        }
        coursesByCategory[category].push(course);
      });
      
    
      for (const category in coursesByCategory) {
        message += `*📋 ${category}*\n\n`;
        
        coursesByCategory[category].forEach(course => {
          message += `📘 *${course.title}* (${course.code})\n`;
          message += `Credit: ${course.credit} | Type: ${course.type}\n`;
          message += `Faculty: ${course.faculty}\n`;
          message += `Slot: ${course.slot} | Room: ${course.room || 'N/A'}\n\n`;
        });
      }
      
     
      const totalCredits = coursesData.courses.reduce((sum, course) => {
        const credit = parseInt(course.credit) || 0;
        return sum + credit;
      }, 0);
      
      message += `*Total Credits: ${totalCredits}*`;
    } else {
      message = '📚 *Your Courses*\n\nNo courses data available.';
    }
    
    ctx.replyWithMarkdown(message);
  } catch (error) {
    console.error('Courses error:', error.response?.data || error.message);
    ctx.reply(`Error fetching courses: ${error.response?.data?.error || error.message}`);
  }
}

module.exports = {
  handleCourses
};