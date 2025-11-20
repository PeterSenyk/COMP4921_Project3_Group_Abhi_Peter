const names = require("../../api/names.json");
const { isAuthenticated, getUserFromSession } = require("../../utils/auth");
const databaseService = require("../../services/database-service");

module.exports = (app) => {
  app.get("/calendar-week", isAuthenticated, async (req, res) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1; // 1-12
    const day = today.getDate();
    const user = getUserFromSession(req);

    const monthName = names.monthNames[month - 1];
    const dayName = names.dayNames[(day % 7) - 1];
    // console.log(monthName, day);

    // Get the week starting from Sunday (0 = Sunday)
    const date = new Date(year, month - 1, day); // month is 0-indexed
    const currentDayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    // Calculate Sunday of current week
    const sundayDate = new Date(date);
    sundayDate.setDate(date.getDate() - currentDayOfWeek);

    // Generate array of 7 days (Sunday to Saturday)
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(sundayDate);
      dayDate.setDate(sundayDate.getDate() + i);
      weekDays.push({
        date: dayDate,
        dayOfMonth: dayDate.getDate(),
        dayName: names.dayNamesShort[i],
        isToday: dayDate.toDateString() === today.toDateString(),
      });
    }

    // Generate time slots from 12 AM to 11 PM
    const timeSlots = [];
    for (let hour = 0; hour <= 23; hour++) {
      const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const ampm = hour >= 12 ? "PM" : "AM";
      timeSlots.push({
        hour24: hour,
        hour12,
        ampm,
        display: `${hour12} ${ampm}`,
        events: [], // Initialize empty events array for each time slot
      });
    }

    // Fetch events for the current week if user is authenticated
    let events = [];
    // console.log("User ID: ", user.user_id);
    if (user.user_id) {
      try {
        const startOfWeek = new Date(sundayDate);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(sundayDate);
        endOfWeek.setDate(sundayDate.getDate() + 7);
        endOfWeek.setHours(23, 59, 59, 999);

        events = await databaseService.findEventsByUserIdAndDate(
          req.session.userId,
          startOfWeek
        );

        // Filter events to only include those within the week range
        events = events.filter((event) => {
          const eventStart = new Date(event.start_at);
          return eventStart >= startOfWeek && eventStart < endOfWeek;
        });

        // Group events by time slot and day
        events.forEach((event) => {
          const eventStart = new Date(event.start_at);
          const eventHour = eventStart.getHours();
          const eventDay = eventStart.getDay();
          const eventDayName = names.dayNamesShort[eventDay];
          console.log("eventDayName: ", eventDayName);

          // Find the corresponding time slot
          const timeSlot = timeSlots.find((ts) => ts.hour24 === eventHour);
          if (timeSlot) {
            if (!timeSlot.events) {
              timeSlot.events = [];
            }
            timeSlot.events.push({
              ...event,
              dayOfWeek: eventDay,
              dayName: eventDayName,
            });
          }
        });
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    }

    timeSlots.forEach(timeSlot => {
      if (timeSlot.events.length > 0) {
        console.log("timeSlot: ", timeSlot);
      }
    });
  

    // Get timezone offset (GMT-08 for example)
    // getTimezoneOffset() returns minutes, positive when behind UTC
    // For GMT-08 (PST), it returns 480, so we divide by 60 and negate to get -8
    const timezoneOffset = -date.getTimezoneOffset() / 60; // Convert minutes to hours
    const offsetStr = Math.abs(timezoneOffset).toString().padStart(2, "0");
    const timezoneString = `GMT${timezoneOffset >= 0 ? "+" : "-"}${offsetStr}`;

    res.render("calendar-week", {
      title: "Calendar Week",
      weekDays,
      timeSlots,
      timezoneString,
      year,
      month,
      day,
      monthName,
      dayName
    });
  });
};
