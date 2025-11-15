module.exports = (app) => {
  app.get("/calendar-week", (req, res) => {
    // Optional: ?year=2025&month=11&day=15 (1-31)
    const today = new Date();
    const year = parseInt(req.query.year) || today.getFullYear();
    const month = parseInt(req.query.month) || today.getMonth() + 1; // 1-12
    const day = parseInt(req.query.day) || today.getDate();

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
        dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
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
      });
    }

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
      currentYear: year,
      currentMonth: month,
    });
  });
};
