const User = require('../model/user');
const apiService = require('../services/apiService');
const sessionManager = require('../utils/sessionManager');

class AttendanceNotificationService {
  constructor(bot) {
    this.bot = bot;
    this.checkAttendanceUpdates();
   
    setInterval(() => this.checkAttendanceUpdates(), 60 * 1000);
  }

  async checkAttendanceUpdates() {
    try {
      const users = await User.find({ 
        token: { $exists: true },
        attendance: { $exists: true }
      });

      for (const user of users) {
        const session = sessionManager.getSession(user.telegramId);
        if (!session) continue;

        const response = await apiService.makeAuthenticatedRequest('/attendance', session);
        const newAttendanceData = response.data;

        if (!newAttendanceData?.attendance) continue;

        const updatedCourses = this.compareAttendance(user.attendance, newAttendanceData);
        
        if (updatedCourses.length > 0) {
          console.log(`Attendance updated for user ${user.telegramId}`);
          await this.sendAttendanceUpdateNotification(user.telegramId, updatedCourses);
          
          await User.findByIdAndUpdate(user._id, { 
            attendance: newAttendanceData,
            lastAttendanceUpdate: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Error in attendance update check:', error);
    }
  }

  compareAttendance(oldData, newData) {
    const updatedCourses = [];

    if (!oldData?.attendance || !newData?.attendance) return updatedCourses;

    newData.attendance.forEach(newCourse => {
      const oldCourse = oldData.attendance.find(c => c.courseName === newCourse.courseName);

      if (!oldCourse) {
        if (this.hasValidAttendance(newCourse)) {
          updatedCourses.push({
            courseName: newCourse.courseName,
            type: 'new_course',
            new: newCourse,
            old: null
          });
        }
        return;
      }

      if (this.attendanceChanged(newCourse, oldCourse)) {
        updatedCourses.push({
          courseName: newCourse.courseName,
          type: 'update',
          new: newCourse,
          old: oldCourse
        });
      }
    });

    return updatedCourses;
  }

  hasValidAttendance(course) {
    return course && course.totalClasses > 0;
  }

  attendanceChanged(newCourse, oldCourse) {
    return newCourse.totalClasses !== oldCourse.totalClasses || 
           newCourse.attendedClasses !== oldCourse.attendedClasses;
  }

  calculatePercentage(attended, total) {
    return ((attended / total) * 100).toFixed(1);
  }

  getAttendanceEmoji(percentage) {
    if (percentage >= 75) return '✅';
    if (percentage >= 65) return '⚠️';
    return '❌';
  }

  async sendAttendanceUpdateNotification(telegramId, updatedCourses) {
    let message = "🔔 *Attendance Update Alert!*\n\n";

    let overallOld = 0;
    let overallNew = 0;
    let totalOldClasses = 0;
    let totalNewClasses = 0;

    updatedCourses.forEach(update => {
      const newPercentage = this.calculatePercentage(
        update.new.attendedClasses,
        update.new.totalClasses
      );
      const emoji = this.getAttendanceEmoji(newPercentage);

      message += `📚 *${update.courseName}*\n`;
      message += `${emoji} Current: ${update.new.attendedClasses}/${update.new.totalClasses} (${newPercentage}%)\n`;

      if (update.old) {
        const oldPercentage = this.calculatePercentage(
          update.old.attendedClasses,
          update.old.totalClasses
        );
        message += `Previous: ${update.old.attendedClasses}/${update.old.totalClasses} (${oldPercentage}%)\n`;
        
        // Calculate change in classes
        const newClasses = update.new.totalClasses - update.old.totalClasses;
        const attendedNew = update.new.attendedClasses - update.old.attendedClasses;
        
        if (newClasses > 0) {
          message += `New classes: ${newClasses}\n`;
          message += `Attended: ${attendedNew}/${newClasses}\n`;
        }

        overallOld += update.old.attendedClasses;
        totalOldClasses += update.old.totalClasses;
      }

      overallNew += update.new.attendedClasses;
      totalNewClasses += update.new.totalClasses;
      message += '\n';
    });

    // Add overall attendance change
    if (totalOldClasses > 0 && totalNewClasses > 0) {
      const newOverallPercentage = this.calculatePercentage(overallNew, totalNewClasses);
      const oldOverallPercentage = this.calculatePercentage(overallOld, totalOldClasses);
      const overallEmoji = this.getAttendanceEmoji(newOverallPercentage);

      message += `📊 *Overall Attendance*\n`;
      message += `${overallEmoji} Current: ${overallNew}/${totalNewClasses} (${newOverallPercentage}%)\n`;
      message += `Previous: ${overallOld}/${totalOldClasses} (${oldOverallPercentage}%)\n`;
    }

    try {
      await this.bot.telegram.sendMessage(telegramId, message, { 
        parse_mode: 'Markdown',
        disable_notification: false
      });
    } catch (error) {
      console.error('Failed to send attendance notification:', error);
    }
  }
}

module.exports = AttendanceNotificationService;