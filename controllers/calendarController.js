const apiService = require('../services/apiService');
const sessionManager = require('../utils/sessionManager');

/**
 * Handle calendar command
 * @param {Object} ctx - Telegraf context
 */
async function handleCalendar(ctx) {
  const userId = ctx.from.id;
  const session = sessionManager.getSession(userId);
  
  try {
    ctx.reply('Fetching academic calendar...');
    
    const response = await apiService.makeAuthenticatedRequest('/calendar', session);
    
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
}

module.exports = {
  handleCalendar
};