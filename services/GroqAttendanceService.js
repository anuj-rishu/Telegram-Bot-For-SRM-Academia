const axios = require("axios");
const config = require("../config/config");
const AttendanceQuery = require("../model/attendanceQuery");

class GroqAttendanceService {
  constructor(bot) {
    this.bot = bot;
    this.calendarApiUrl = `${config.API_BASE_URL}/calendar`;
    this.attendanceApiUrl = `${config.API_BASE_URL}/attendance`;
    this.timetableApiUrl = `${config.API_BASE_URL}/timetable`;
    this.groqApiKey = config.GROQ_API_KEY;
    this.groqApiUrl = "https://api.groq.com/openai/v1/chat/completions";
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  async fetchData(url, session) {
    try {
      const headers = session
        ? {
            Authorization: `Bearer ${session.token}`,
            "X-CSRF-Token": session.csrfToken,
          }
        : {};

      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch data from ${url}: ${error.message}`);
    }
  }

  async processAttendanceQuestion(userId, question, session) {
    try {
      if (!session || !session.token) {
        throw new Error("Session not found or invalid. Please login first.");
      }

      const [calendarData, attendanceData, timetableData] = await Promise.all([
        this.fetchData(this.calendarApiUrl, session),
        this.fetchData(this.attendanceApiUrl, session),
        this.fetchData(this.timetableApiUrl, session),
      ]);

      const dateRangeMatch = question.match(
        /(\d+)\s*-\s*(\d+)\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
      );

      if (dateRangeMatch) {
        return await this.processDateRange(
          userId,
          question,
          dateRangeMatch,
          calendarData,
          attendanceData,
          timetableData,
          session
        );
      }

      // Regular single-date pattern
      const dateMatch = question.match(
        /(\d+)(?:st|nd|rd|th)?\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
      );

      let dateInfo = null;
      let scheduledClasses = [];
      let slotToClassesMap = new Map();
      let courseCodes = new Set();

      if (dateMatch) {
        const day = dateMatch[1];
        const month = dateMatch[2].toLowerCase();
        const displayDate = `${day} ${
          month.charAt(0).toUpperCase() + month.slice(1)
        }`;

        dateInfo = this.findDateInCalendar(calendarData, day, month);

        if (dateInfo) {
          if (dateInfo.dayOrder === "-" || dateInfo.holiday) {
            const holidayName = dateInfo.holiday
              ? ` (${dateInfo.holiday})`
              : "";
            const holidayMsg = `${displayDate} is a holiday${holidayName}. No classes are scheduled, so your attendance won't be affected.`;

            try {
              await AttendanceQuery.create({
                telegramId: userId.toString(),
                question: question,
                response: holidayMsg,
              });
            } catch (dbError) {
              console.error(
                "Failed to save attendance query to database:",
                dbError.message
              );
            }

            return holidayMsg;
          }

          if (!dateInfo.dayOrder) {
            const noClassesMsg = `${displayDate} has no scheduled classes. Your attendance won't be affected.`;

            try {
              await AttendanceQuery.create({
                telegramId: userId.toString(),
                question: question,
                response: noClassesMsg,
              });
            } catch (dbError) {
              console.error(
                "Failed to save attendance query to database:",
                dbError.message
              );
            }

            return noClassesMsg;
          }

          if (dateInfo.dayOrder && dateInfo.dayOrder !== "-") {
            const dayOrderNum = parseInt(dateInfo.dayOrder);
            scheduledClasses = this.findAllClassesForDayOrder(
              timetableData,
              dayOrderNum
            );

            if (scheduledClasses.length === 0) {
              const noClassesMsg = `No classes are scheduled on ${displayDate} (Day Order: ${dateInfo.dayOrder}). Your attendance won't be affected.`;

              try {
                await AttendanceQuery.create({
                  telegramId: userId.toString(),
                  question: question,
                  response: noClassesMsg,
                });
              } catch (dbError) {
                console.error(
                  "Failed to save attendance query to database:",
                  dbError.message
                );
              }

              return noClassesMsg;
            }

            slotToClassesMap = this.groupClassesBySlot(scheduledClasses);
            scheduledClasses.forEach((classInfo) => {
              courseCodes.add(classInfo.code);
            });
          }
        } else {
          const invalidDateMsg = `I couldn't find ${displayDate} in the academic calendar. Please check if this is a valid college working day.`;

          // Save the query to database
          try {
            await AttendanceQuery.create({
              telegramId: userId.toString(),
              question: question,
              response: invalidDateMsg,
            });
          } catch (dbError) {
            console.error(
              "Failed to save attendance query to database:",
              dbError.message
            );
          }

          return invalidDateMsg;
        }
      }

      let relevantAttendance = [];
      if (attendanceData && attendanceData.attendance && courseCodes.size > 0) {
        relevantAttendance = attendanceData.attendance.filter((course) =>
          courseCodes.has(course.courseCode)
        );
      }

      const groqResponse = await this.queryGroqAPI(
        question,
        calendarData,
        attendanceData,
        timetableData,
        dateInfo,
        scheduledClasses,
        slotToClassesMap,
        relevantAttendance,
        dateMatch
      );

      const formattedResponse = this.formatResponseForTelegram(groqResponse);

      try {
        await AttendanceQuery.create({
          telegramId: userId.toString(),
          question: question,
          response: formattedResponse,
        });
      } catch (dbError) {
        console.error(
          "Failed to save attendance query to database:",
          dbError.message
        );
      }

      return formattedResponse;
    } catch (error) {
      throw new Error(
        `Failed to process attendance question: ${error.message}`
      );
    }
  }

  async processDateRange(
    userId,
    question,
    dateRangeMatch,
    calendarData,
    attendanceData,
    timetableData,
    session
  ) {
    try {
      const startDay = parseInt(dateRangeMatch[1]);
      const endDay = parseInt(dateRangeMatch[2]);
      const month = dateRangeMatch[3].toLowerCase();

      if (startDay > endDay) {
        const errorMsg = `Invalid date range: start date (${startDay}) cannot be after end date (${endDay}).`;

        try {
          await AttendanceQuery.create({
            telegramId: userId.toString(),
            question: question,
            response: errorMsg,
          });
        } catch (dbError) {
          console.error(
            "Failed to save attendance query to database:",
            dbError.message
          );
        }

        return errorMsg;
      }

      // Get all working days in the range
      const workingDays = [];
      const holidayDays = [];
      let invalidDays = [];

      for (let day = startDay; day <= endDay; day++) {
        const dateInfo = this.findDateInCalendar(
          calendarData,
          day.toString(),
          month
        );

        if (!dateInfo) {
          invalidDays.push(day);
          continue;
        }

        if (
          dateInfo.dayOrder === "-" ||
          dateInfo.holiday ||
          !dateInfo.dayOrder
        ) {
          const displayDate = `${day} ${
            month.charAt(0).toUpperCase() + month.slice(1)
          }`;
          holidayDays.push({
            day,
            displayDate,
            reason: dateInfo.holiday || "No classes scheduled",
          });
          continue;
        }

        // Working day with classes
        const dayOrderNum = parseInt(dateInfo.dayOrder);
        const classes = this.findAllClassesForDayOrder(
          timetableData,
          dayOrderNum
        );

        if (classes.length > 0) {
          workingDays.push({
            day,
            dateInfo,
            classes,
            dayOrder: dateInfo.dayOrder,
          });
        } else {
          const displayDate = `${day} ${
            month.charAt(0).toUpperCase() + month.slice(1)
          }`;
          holidayDays.push({
            day,
            displayDate,
            reason: `No classes on Day Order ${dateInfo.dayOrder}`,
          });
        }
      }

      if (workingDays.length === 0) {
        // No working days in the range
        const displayRange = `${startDay}-${endDay} ${
          month.charAt(0).toUpperCase() + month.slice(1)
        }`;
        let response = `No classes are scheduled for the dates ${displayRange}. `;

        if (holidayDays.length > 0) {
          response += `These dates are holidays or have no scheduled classes.`;
        }

        if (invalidDays.length > 0) {
          response += ` Some dates (${invalidDays.join(
            ", "
          )}) were not found in the academic calendar.`;
        }

        try {
          await AttendanceQuery.create({
            telegramId: userId.toString(),
            question: question,
            response,
          });
        } catch (dbError) {
          console.error(
            "Failed to save attendance query to database:",
            dbError.message
          );
        }

        return response;
      }

      const allCoursesByDay = {};
      const allCourseCodes = new Set();

      workingDays.forEach((dayData) => {
        const courseCodes = new Set();
        dayData.classes.forEach((classInfo) => {
          courseCodes.add(classInfo.code);
          allCourseCodes.add(classInfo.code);
        });

        const courseSessionCount = {};
        dayData.classes.forEach((classInfo) => {
          if (!courseSessionCount[classInfo.code]) {
            courseSessionCount[classInfo.code] = {
              count: 0,
              name: classInfo.name,
            };
          }
          courseSessionCount[classInfo.code].count++;
        });

        allCoursesByDay[dayData.day] = {
          courseCodes: Array.from(courseCodes),
          courseSessionCount,
          dayOrder: dayData.dayOrder,
        };
      });

      let relevantAttendance = [];
      if (
        attendanceData &&
        attendanceData.attendance &&
        allCourseCodes.size > 0
      ) {
        relevantAttendance = attendanceData.attendance.filter((course) =>
          allCourseCodes.has(course.courseCode)
        );
      }

      const displayRange = `${startDay}-${endDay} ${
        month.charAt(0).toUpperCase() + month.slice(1)
      }`;

      const consolidatedSessionCounts = {};

      Object.keys(allCoursesByDay).forEach((day) => {
        const dayData = allCoursesByDay[day];

        Object.entries(dayData.courseSessionCount).forEach(([code, course]) => {
          if (!consolidatedSessionCounts[code]) {
            consolidatedSessionCounts[code] = {
              count: 0,
              name: course.name,
              dayWiseCount: {},
            };
          }
          consolidatedSessionCounts[code].count += course.count;
          consolidatedSessionCounts[code].dayWiseCount[day] = course.count;
        });
      });

      let rangePrompt = `Calculate attendance impact for missing classes during the date range ${displayRange}.`;

      const rangeDateInfo = {
        dayOrder: `Range (${workingDays.map((d) => d.dayOrder).join(", ")})`,
        startDay: startDay,
        endDay: endDay,
        month: month,
        isRange: true,
      };

      let allScheduledClasses = workingDays.flatMap((day) => day.classes);

      const groqResponse = await this.queryGroqAPI(
        rangePrompt,
        calendarData,
        attendanceData,
        timetableData,
        rangeDateInfo,
        allScheduledClasses,
        new Map(),
        relevantAttendance,
        {
          [0]: `${startDay}-${endDay} ${month}`,
          [1]: `${startDay}-${endDay}`,
          [2]: month,
          isRange: true,
        }
      );

      let additionalInfo = "";
      if (holidayDays.length > 0) {
        additionalInfo +=
          "\n\n📅 Note: The following dates are holidays or have no scheduled classes:";
        holidayDays.forEach((holiday) => {
          additionalInfo += `\n- ${holiday.displayDate}${
            holiday.reason ? ` (${holiday.reason})` : ""
          }`;
        });
      }

      if (invalidDays.length > 0) {
        additionalInfo += `\n\n⚠️ Some dates (${invalidDays.join(
          ", "
        )}) were not found in the academic calendar.`;
      }

      const formattedResponse = this.formatResponseForTelegram(
        groqResponse + additionalInfo
      );

      try {
        await AttendanceQuery.create({
          telegramId: userId.toString(),
          question: question,
          response: formattedResponse,
        });
      } catch (dbError) {
        console.error(
          "Failed to save attendance query to database:",
          dbError.message
        );
      }

      return formattedResponse;
    } catch (error) {
      return `Failed to process date range: ${error.message}`;
    }
  }

  groupClassesBySlot(classes) {
    const slotMap = new Map();
    classes.forEach((classInfo) => {
      if (!slotMap.has(classInfo.slot)) {
        slotMap.set(classInfo.slot, []);
      }
      slotMap.get(classInfo.slot).push(classInfo);
    });
    return slotMap;
  }

  formatResponseForTelegram(response) {
    try {
      const maxLength = 3800;
      if (response.length > maxLength) {
        response =
          response.substring(0, maxLength) +
          "...\n\n(Response truncated due to length)";
      }

      response = response
        .replace(/```/g, "")
        .replace(/_/g, "\\_")
        .replace(/\*/g, "\\*")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]");

      return response;
    } catch (error) {
      return "Could not format response properly. Please try a more specific question.";
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  compressData(data) {
    if (!data) return "{}";
    try {
      return JSON.stringify(data, null, 0);
    } catch (error) {
      return "{}";
    }
  }

  async queryGroqAPI(
    question,
    calendarData,
    attendanceData,
    timetableData,
    dateInfo,
    scheduledClasses,
    slotToClassesMap,
    relevantAttendance,
    dateMatch
  ) {
    let retries = 0;
    let delay = this.retryDelay;
    const models = ["llama3-8b-8192", "mixtral-8x7b-32768", "gemma-7b-it"];
    const triedModels = new Set();

    while (retries <= this.maxRetries) {
      try {
        let modelToUse;
        for (const model of models) {
          if (!triedModels.has(model)) {
            modelToUse = model;
            triedModels.add(model);
            break;
          }
        }

        if (!modelToUse) {
          modelToUse = models[retries % models.length];
        }

        const courseSessionCount = {};
        scheduledClasses.forEach((classInfo) => {
          if (!courseSessionCount[classInfo.code]) {
            courseSessionCount[classInfo.code] = {
              count: 0,
              name: classInfo.name,
            };
          }
          courseSessionCount[classInfo.code].count++;
        });

        const isDateRange = dateInfo?.isRange || dateMatch?.isRange;
        const dateDisplayText = isDateRange
          ? `${dateInfo.startDay}-${dateInfo.endDay} ${
              dateInfo.month.charAt(0).toUpperCase() + dateInfo.month.slice(1)
            }`
          : dateMatch
          ? `${dateMatch[1]} ${dateMatch[2]}`
          : "the specified date";

        let systemPrompt = `You are an attendance calculator for SRM University.

      ### IMPORTANT: READ CAREFULLY
      For each course, you MUST:
      1. Only calculate for the EXACT number of sessions scheduled for the specific date${
        isDateRange ? " range" : ""
      }
      2. For example, if DevOps has 1 session and Software Engineering has 2 sessions, calculate accordingly
      3. Use these exact calculations:
         - Current attendance = (Hours Conducted - Hours Absent) / Hours Conducted × 100%
         - New attendance = (Hours Conducted - Hours Absent) / (Hours Conducted + Sessions on date${
           isDateRange ? " range" : ""
         }) × 100%
      
      ### CALCULATION EXAMPLES:
      - If current attendance = 84.21% (32 classes attended out of 38 conducted)
        And if there ${isDateRange ? "are" : "is"} ${
          isDateRange ? "multiple" : "1"
        } session${isDateRange ? "s" : ""} scheduled:
        New attendance = 32/(38+${
          isDateRange ? "total sessions" : "1"
        }) × 100% = 32/39 × 100% = 82.05%
      
      - If current attendance = 84.85% (28 classes attended out of 33 conducted)
        And if there are ${isDateRange ? "multiple" : "2"} sessions scheduled:
        New attendance = 28/(33+${
          isDateRange ? "total sessions" : "2"
        }) × 100% = 28/35 × 100% = 80.00%

      ### RESPONSE FORMAT:
      - Date: ${dateDisplayText}, Day Order: ${dateInfo?.dayOrder || "N/A"}
      - Course: [name] ([code])
        Current: [current]% → After missing [exact # of sessions scheduled] session(s): [new]% (Drop: [drop]%)
        [Add "DETENTION RISK" only if new attendance is below 75%]`;

        if (
          dateInfo &&
          dateInfo.dayOrder !== "-" &&
          scheduledClasses.length > 0
        ) {
          systemPrompt += `\n\n### SCHEDULED COURSES (EXACT SESSION COUNTS FOR ${dateDisplayText}):`;

          Object.entries(courseSessionCount).forEach(([code, course]) => {
            systemPrompt += `\n- ${course.name} (${code}): EXACTLY ${course.count} session(s)`;

            const attendanceRecord = relevantAttendance.find(
              (a) => a.courseCode === code
            );
            if (attendanceRecord) {
              systemPrompt += `
              Hours Conducted: ${attendanceRecord.hoursConducted}
              Hours Absent: ${attendanceRecord.hoursAbsent}
              Current %: ${attendanceRecord.attendancePercentage}%
              
              PRECISE CALCULATION FOR THIS COURSE:
              Current: (${attendanceRecord.hoursConducted} - ${attendanceRecord.hoursAbsent})/${attendanceRecord.hoursConducted} × 100% = ${attendanceRecord.attendancePercentage}%
              New: (${attendanceRecord.hoursConducted} - ${attendanceRecord.hoursAbsent})/(${attendanceRecord.hoursConducted} + ${course.count}) × 100% = [calculate this]`;
            }
          });
        }

        let userPrompt = `Calculate attendance impact for ${dateDisplayText}. Use these EXACT session counts:`;

        Object.entries(courseSessionCount).forEach(([code, course]) => {
          userPrompt += ` ${course.name}: ${course.count} session(s),`;
        });

        userPrompt +=
          ". Show current%, new%, and drop%. Be precise in calculations.";

        if (isDateRange) {
          userPrompt += ` This is a cumulative calculation for ALL days in the range ${dateDisplayText}.`;
        }

        const payload = {
          model: modelToUse,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 800,
        };

        const response = await axios.post(this.groqApiUrl, payload, {
          headers: {
            Authorization: `Bearer ${this.groqApiKey}`,
            "Content-Type": "application/json",
          },
        });

        return response.data.choices[0].message.content;
      } catch (error) {
        if (
          error.response &&
          (error.response.status === 429 ||
            (error.response.data &&
              error.response.data.error &&
              error.response.data.error.code === "rate_limit_exceeded"))
        ) {
        }

        retries++;
        if (retries > this.maxRetries) {
          return "I couldn't calculate your attendance. Please try again in a few moments or with a different date.";
        }

        await this.sleep(delay);
        delay *= 2;
      }
    }

    return "I couldn't calculate your attendance after multiple attempts. Please try again later.";
  }

  convertTimeToMinutes(timeStr) {
    try {
      const [time, period] = timeStr.split(" ");
      let [hours, minutes] = time.split(":").map(Number);

      if (period === "PM" && hours !== 12) {
        hours += 12;
      } else if (period === "AM" && hours === 12) {
        hours = 0;
      }

      return hours * 60 + minutes;
    } catch (error) {
      return 0;
    }
  }

  findDateInCalendar(calendarData, day, month) {
    try {
      const monthMap = {
        january: "jan",
        february: "feb",
        march: "mar",
        april: "apr",
        may: "may",
        june: "jun",
        july: "jul",
        august: "aug",
        september: "sep",
        october: "oct",
        november: "nov",
        december: "dec",
      };

      const shortMonth = monthMap[month] || month;

      if (calendarData && calendarData.calendar) {
        for (const monthData of calendarData.calendar) {
          const monthName = monthData.month.toLowerCase();
          if (monthName.includes(shortMonth.toLowerCase())) {
            for (const dayData of monthData.days) {
              if (dayData.date === day || dayData.date === day.toString()) {
                return { ...dayData, month: monthData.month };
              }
            }
          }
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  findAllClassesForDayOrder(timetableData, dayOrder) {
    try {
      if (timetableData && timetableData.schedule) {
        const daySchedule = timetableData.schedule.find(
          (schedule) =>
            schedule.day === dayOrder ||
            schedule.dayOrder === `Day ${dayOrder}` ||
            schedule.dayOrder === dayOrder.toString()
        );

        if (daySchedule && daySchedule.table) {
          return daySchedule.table;
        }
      }
      return [];
    } catch (error) {
      return [];
    }
  }
}

module.exports = GroqAttendanceService;
