const { isAuthenticated, getUserFromSession } = require("../../utils/auth");
const databaseService = require("../../services/database-service");

module.exports = (app) => {
  // Route to view deleted events (trash bin)
  app.get("/deleted-events", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.redirect("/login");
    }

    try {
      const deletedEvents = await databaseService.findDeletedEvents(
        user.user_id
      );

      // Calculate days since deletion and determine if restorable
      const eventsWithStatus = deletedEvents.map((event) => {
        const deletedDate = new Date(event.deleted_at);
        const now = new Date();
        const daysSinceDeletion = Math.floor(
          (now - deletedDate) / (1000 * 60 * 60 * 24)
        );
        const isRestorable = daysSinceDeletion < 30;

        return {
          ...event,
          daysSinceDeletion,
          isRestorable,
        };
      });

      res.render("deleted-events", {
        title: "Deleted Events",
        deletedEvents: eventsWithStatus,
      });
    } catch (error) {
      console.error("Error fetching deleted events:", error);
      res.render("deleted-events", {
        title: "Deleted Events",
        deletedEvents: [],
        error: "Failed to load deleted events",
      });
    }
  });
};
