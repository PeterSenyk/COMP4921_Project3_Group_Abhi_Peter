const { isAuthenticated, getUserFromSession } = require("../../utils/auth");
const databaseService = require("../../services/database-service");

module.exports = (app) => {
  // Route to view today's events
  app.get("/events/today", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.redirect("/login");
    }

    try {
      const events = await databaseService.findTodaysEvents(user.user_id);
      res.render("event-list", {
        title: "Today's Events",
        events: events,
        viewType: "today",
      });
    } catch (error) {
      console.error("Error fetching today's events:", error);
      res.render("event-list", {
        title: "Today's Events",
        events: [],
        viewType: "today",
        error: "Failed to load events",
      });
    }
  });

  // Route to view upcoming events
  app.get("/events/upcoming", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.redirect("/login");
    }

    try {
      const events = await databaseService.findUpcomingEvents(user.user_id);
      res.render("event-list", {
        title: "Upcoming Events",
        events: events,
        viewType: "upcoming",
      });
    } catch (error) {
      console.error("Error fetching upcoming events:", error);
      res.render("event-list", {
        title: "Upcoming Events",
        events: [],
        viewType: "upcoming",
        error: "Failed to load events",
      });
    }
  });

  // Route to view past events
  app.get("/events/past", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.redirect("/login");
    }

    try {
      const events = await databaseService.findPastEvents(user.user_id);
      res.render("event-list", {
        title: "Past Events",
        events: events,
        viewType: "past",
      });
    } catch (error) {
      console.error("Error fetching past events:", error);
      res.render("event-list", {
        title: "Past Events",
        events: [],
        viewType: "past",
        error: "Failed to load events",
      });
    }
  });
};
