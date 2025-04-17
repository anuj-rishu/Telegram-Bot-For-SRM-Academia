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
        const displayDate = `${day} ${month.charAt(0).toUpperCase() + month.slice(1)}`;
  
        dateInfo = this.findDateInCalendar(calendarData, day, month);
        
        // Check if date is a holiday or weekend
        if (dateInfo) {
          // Holiday check: dayOrder is "-" or holiday property exists
          if (dateInfo.dayOrder === "-" || dateInfo.holiday) {
            const holidayName = dateInfo.holiday ? ` (${dateInfo.holiday})` : "";
            const holidayMsg = `${displayDate} is a holiday${holidayName}. No classes are scheduled, so your attendance won't be affected.`;
            
            // Save the query to database
            try {
              await AttendanceQuery.create({
                telegramId: userId.toString(),
                question: question,
                response: holidayMsg
              });
            } catch (dbError) {
              console.error("Failed to save attendance query to database:", dbError.message);
            }
            
            return holidayMsg;
          }
          
          // No day order assigned (could be weekend)
          if (!dateInfo.dayOrder) {
            const noClassesMsg = `${displayDate} has no scheduled classes. Your attendance won't be affected.`;
            
            // Save the query to database
            try {
              await AttendanceQuery.create({
                telegramId: userId.toString(),
                question: question,
                response: noClassesMsg
              });
            } catch (dbError) {
              console.error("Failed to save attendance query to database:", dbError.message);
            }
            
            return noClassesMsg;
          }
          
          // Valid day with day order
          if (dateInfo.dayOrder && dateInfo.dayOrder !== "-") {
            const dayOrderNum = parseInt(dateInfo.dayOrder);
            scheduledClasses = this.findAllClassesForDayOrder(
              timetableData,
              dayOrderNum
            );
            
            // Check if there are no classes on this day order
            if (scheduledClasses.length === 0) {
              const noClassesMsg = `No classes are scheduled on ${displayDate} (Day Order: ${dateInfo.dayOrder}). Your attendance won't be affected.`;
              
              // Save the query to database
              try {
                await AttendanceQuery.create({
                  telegramId: userId.toString(),
                  question: question,
                  response: noClassesMsg
                });
              } catch (dbError) {
                console.error("Failed to save attendance query to database:", dbError.message);
              }
              
              return noClassesMsg;
            }
            
            slotToClassesMap = this.groupClassesBySlot(scheduledClasses);
            scheduledClasses.forEach((classInfo) => {
              courseCodes.add(classInfo.code);
            });
          }
        } else {
          // Date not found in calendar
          const invalidDateMsg = `I couldn't find ${displayDate} in the academic calendar. Please check if this is a valid college working day.`;
          
          // Save the query to database
          try {
            await AttendanceQuery.create({
              telegramId: userId.toString(),
              question: question,
              response: invalidDateMsg
            });
          } catch (dbError) {
            console.error("Failed to save attendance query to database:", dbError.message);
          }
          
          return invalidDateMsg;
        }
      }
  
      // Continue with processing for valid class days
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
      
      // Save the question and response to the database
      try {
        await AttendanceQuery.create({
          telegramId: userId.toString(),
          question: question,
          response: formattedResponse
        });
      } catch (dbError) {
        console.error("Failed to save attendance query to database:", dbError.message);
      }
  
      return formattedResponse;
    } catch (error) {
      throw new Error(
        `Failed to process attendance question: ${error.message}`
      );
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

        let systemPrompt = `You are an attendance calculator for SRM University.

      ### IMPORTANT: READ CAREFULLY
      For each course, you MUST:
      1. Only calculate for the EXACT number of sessions scheduled for the specific date
      2. For example, if DevOps has 1 session and Software Engineering has 2 sessions, calculate accordingly
      3. Use these exact calculations:
         - Current attendance = (Hours Conducted - Hours Absent) / Hours Conducted × 100%
         - New attendance = (Hours Conducted - Hours Absent) / (Hours Conducted + Sessions on date) × 100%
      
      ### CALCULATION EXAMPLES:
      - If current attendance = 84.21% (32 classes attended out of 38 conducted)
        And if there is 1 session scheduled:
        New attendance = 32/(38+1) × 100% = 32/39 × 100% = 82.05%
      
      - If current attendance = 84.85% (28 classes attended out of 33 conducted)
        And if there are 2 sessions scheduled:
        New attendance = 28/(33+2) × 100% = 28/35 × 100% = 80.00%

      ### RESPONSE FORMAT:
      - Date: ${
        dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : "the specified date"
      }, Day Order: ${dateInfo?.dayOrder || "N/A"}
      - Course: [name] ([code])
        Current: [current]% → After missing [exact # of sessions scheduled] session(s): [new]% (Drop: [drop]%)
        [Add "DETENTION RISK" only if new attendance is below 75%]`;

        if (
          dateInfo &&
          dateInfo.dayOrder !== "-" &&
          scheduledClasses.length > 0
        ) {
          systemPrompt += `\n\n### SCHEDULED COURSES (EXACT SESSION COUNTS FOR ${
            dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : "today"
          }):`;

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

        const dateText = dateMatch
          ? `${dateMatch[1]} ${dateMatch[2]}`
          : "the specified date";
        let userPrompt = `Calculate attendance impact for ${dateText}. Use these EXACT session counts:`;

        Object.entries(courseSessionCount).forEach(([code, course]) => {
          userPrompt += ` ${course.name}: ${course.count} session(s),`;
        });

        userPrompt +=
          ". Show current%, new%, and drop%. Be precise in calculations.";

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
          // Rate limit handling
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