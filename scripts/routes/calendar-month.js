const names = require("../../api/names.json");
const { isAuthenticated } = require("../../utils/auth");

module.exports = (app) => {
  app.get("/calendar-month", isAuthenticated,  (req, res) => {
    // Optional: ?year=2025&month=11 (1–12)
    const today = new Date();
    const year = parseInt(req.query.year) || today.getFullYear();
    const month = (parseInt(req.query.month) || today.getMonth() + 1) - 1; // 0–11

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay(); // 0=Sun, 1=Mon, ...

    const days = [];

    // Days from previous month to fill first week
    for (let i = 0; i < startWeekday; i++) {
      days.push({ date: null, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        date: new Date(year, month, d),
        isCurrentMonth: true,
      });
    }

    // Pad to complete weeks (7 columns)
    while (days.length % 7 !== 0) {
      days.push({ date: null, isCurrentMonth: false });
    }

    // Chunk into weeks [ [7 days], [7 days], ... ]
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    res.render("calendar-month", {
      year,
      month: month + 1, // for display
      weeks,
      title: "Calendar",
      message: "Welcome to the calendar",
    });
  });
};
