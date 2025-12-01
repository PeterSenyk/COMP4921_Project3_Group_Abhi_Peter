const { isAuthenticated, getUserFromSession } = require("../../utils/auth");
const databaseService = require("../../services/database-service");

// Helper function to transform events to FullCalendar format
function transformEventsToFullCalendar(dbEvents) {
  return dbEvents.map((event) => ({
    id: event.event_id.toString(),
    title: event.title,
    start: event.start_at,
    end: event.end_at,
    color: event.colour || "#0000af",
    description: event.description || "",
    extendedProps: {
      event_id: event.event_id,
      user_id: event.user_id,
      colour: event.colour || "#0000af",
      description: event.description || "",
    },
  }));
}

module.exports = (app) => {
  // API endpoint for fetching events (used by FullCalendar for dynamic loading)
  app.get("/api/events", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.json([]);
    }

    try {
      // Optional: Filter by date range if provided (FullCalendar sends start/end params)
      const start = req.query.start ? new Date(req.query.start) : null;
      const end = req.query.end ? new Date(req.query.end) : null;

      let dbEvents;
      if (start && end) {
        // Use database-level filtering for better performance
        dbEvents = await databaseService.findEventsByUserIdAndDateRange(
          user.user_id,
          start,
          end
        );
      } else {
        // Get all future events for the user
        dbEvents = await databaseService.findEventsByUserId(user.user_id);
      }

      const events = transformEventsToFullCalendar(dbEvents);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // API endpoint for creating new events
  app.post("/api/events", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const { title, start, end, allDay, description, colour } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ error: "Event title is required" });
      }

      if (!start) {
        return res.status(400).json({ error: "Event start time is required" });
      }

      // Calculate end time - if not provided, default to 1 hour after start
      const startDate = new Date(start);
      const endDate = end
        ? new Date(end)
        : new Date(startDate.getTime() + 60 * 60 * 1000);

      const eventData = {
        user_id: user.user_id,
        title: title.trim(),
        start_at: startDate,
        end_at: endDate,
        description: description || null,
        colour: colour || "#0000af", // Use provided color or default to blue
      };

      const newEvent = await databaseService.createEvent(eventData);

      // Transform to FullCalendar format for response
      const responseEvent = {
        event_id: newEvent.event_id,
        user_id: newEvent.user_id,
        title: newEvent.title,
        start_at: newEvent.start_at,
        end_at: newEvent.end_at,
        colour: newEvent.colour,
        description: newEvent.description,
      };

      res.status(201).json(responseEvent);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // API endpoint for updating events (drag-and-drop, resize)
  app.put("/api/events/:id", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const eventId = parseInt(req.params.id);
      const { title, start_at, end_at, description, colour } = req.body;

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }

      // Verify the event exists and belongs to the user
      const existingEvent = await databaseService.findEvent(eventId);
      if (!existingEvent) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (existingEvent.user_id !== user.user_id) {
        return res
          .status(403)
          .json({ error: "You don't have permission to update this event" });
      }

      // Prepare update data
      const updateData = {};
      if (title !== undefined) updateData.title = title.trim();
      if (start_at !== undefined) updateData.start_at = new Date(start_at);
      if (end_at !== undefined) updateData.end_at = new Date(end_at);
      if (description !== undefined)
        updateData.description = description || null;
      if (colour !== undefined) updateData.colour = colour;

      const updatedEvent = await databaseService.updateEvent(
        eventId,
        updateData
      );

      // Transform to FullCalendar format for response
      const responseEvent = {
        event_id: updatedEvent.event_id,
        user_id: updatedEvent.user_id,
        title: updatedEvent.title,
        start_at: updatedEvent.start_at,
        end_at: updatedEvent.end_at,
        colour: updatedEvent.colour,
        description: updatedEvent.description,
      };

      res.json(responseEvent);
    } catch (error) {
      console.error("Error updating event:", error);
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  // API endpoint for soft deleting events (marks as deleted)
  app.delete("/api/events/:id", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const eventId = parseInt(req.params.id);

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }

      // Verify the event exists and belongs to the user (including deleted events for verification)
      const existingEvent = await databaseService.findEventIncludingDeleted(
        eventId
      );
      if (!existingEvent) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (existingEvent.user_id !== user.user_id) {
        return res
          .status(403)
          .json({ error: "You don't have permission to delete this event" });
      }

      // Check if already deleted
      if (existingEvent.deleted_at) {
        return res.status(400).json({ error: "Event is already deleted" });
      }

      await databaseService.deleteEvent(eventId);

      res.json({ success: true, message: "Event deleted successfully" });
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // API endpoint for restoring deleted events
  app.post("/api/events/:id/restore", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const eventId = parseInt(req.params.id);

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }

      // Verify the event exists and belongs to the user
      const existingEvent = await databaseService.findEventIncludingDeleted(
        eventId
      );
      if (!existingEvent) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (existingEvent.user_id !== user.user_id) {
        return res
          .status(403)
          .json({ error: "You don't have permission to restore this event" });
      }

      const restoredEvent = await databaseService.restoreEvent(eventId);

      res.json({
        success: true,
        message: "Event restored successfully",
        event: restoredEvent,
      });
    } catch (error) {
      console.error("Error restoring event:", error);
      if (
        error.message === "Event is not deleted" ||
        error.message.includes(
          "Cannot restore event deleted more than 30 days ago"
        )
      ) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to restore event" });
    }
  });

  // API endpoint for permanently deleting events (hard delete)
  app.delete("/api/events/:id/permanent", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const eventId = parseInt(req.params.id);

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }

      // Verify the event exists and belongs to the user
      const existingEvent = await databaseService.findEventIncludingDeleted(
        eventId
      );
      if (!existingEvent) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (existingEvent.user_id !== user.user_id) {
        return res.status(403).json({
          error: "You don't have permission to permanently delete this event",
        });
      }

      await databaseService.hardDeleteEvent(eventId);

      res.json({
        success: true,
        message: "Event permanently deleted",
      });
    } catch (error) {
      console.error("Error permanently deleting event:", error);
      if (
        error.message === "Event is not deleted" ||
        error.message.includes(
          "Cannot permanently delete event deleted less than 30 days ago"
        )
      ) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to permanently delete event" });
    }
  });

  // Calendar view route (unified for month/week/day)
  app.get("/calendar", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);
    let events = [];

    // Fetch events for the user if authenticated
    if (user && user.user_id) {
      try {
        // Get all future events for the user
        const dbEvents = await databaseService.findEventsByUserId(user.user_id);
        events = transformEventsToFullCalendar(dbEvents);
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    }

    res.render("calendar", {
      title: "Calendar",
      events: JSON.stringify(events), // Pass as JSON string for embedding in HTML
    });
  });
};
