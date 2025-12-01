const { isAuthenticated, getUserFromSession } = require("../../utils/auth");
const databaseService = require("../../services/database-service");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Helper function to transform events to FullCalendar format
// Optionally includes invite information
function transformEventsToFullCalendar(dbEvents, userInvitesMap = null) {
  return dbEvents.map((event) => {
    const eventData = {
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
    };

    // If user has an accepted invite for this event (and didn't create it), mark it
    if (userInvitesMap && userInvitesMap[event.event_id]) {
      const invite = userInvitesMap[event.event_id];
      if (invite.status === "ACCEPTED") {
        eventData.extendedProps.hasAcceptedInvite = true;
        eventData.extendedProps.invite_id = invite.invite_id;
      }
    }

    return eventData;
  });
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

      // Get user's invites for all events to mark which ones they were invited to
      // Only mark events where user has accepted invite AND is not the creator
      const eventIds = dbEvents.map((e) => e.event_id);
      if (eventIds.length > 0) {
        const userInvites = await prisma.eventInvite.findMany({
          where: {
            invited_user_id: user.user_id,
            event_id: { in: eventIds },
            status: "ACCEPTED",
          },
          select: {
            invite_id: true,
            event_id: true,
            status: true,
          },
        });

        // Create a map of event_id -> invite for quick lookup
        // Only include events where user is NOT the creator
        const userInvitesMap = {};
        userInvites.forEach((invite) => {
          // Check if this event was created by the user
          const event = dbEvents.find((e) => e.event_id === invite.event_id);
          if (event && event.user_id !== user.user_id) {
            // User has accepted invite but didn't create the event
            userInvitesMap[invite.event_id] = invite;
          }
        });

        const events = transformEventsToFullCalendar(dbEvents, userInvitesMap);
        res.json(events);
      } else {
        const events = transformEventsToFullCalendar(dbEvents);
        res.json(events);
      }
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
      const {
        title,
        start,
        end,
        allDay,
        description,
        colour,
        recurrenceType,
        recurrenceWeekdays,
        recurrenceMonthDays,
        recurrenceEndDate,
      } = req.body;

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

      // Handle recurrence if specified
      if (recurrenceType && recurrenceType !== "none") {
        const recurrence = {
          pattern: recurrenceType.toUpperCase(), // DAILY, WEEKLY, MONTHLY
          start_at: startDate,
          end_at: recurrenceEndDate ? new Date(recurrenceEndDate) : null,
        };

        if (
          recurrenceType === "weekly" &&
          recurrenceWeekdays &&
          recurrenceWeekdays.length > 0
        ) {
          // Map weekday strings to enum values
          recurrence.weekdays = recurrenceWeekdays.map((wd) =>
            wd.toUpperCase()
          );
        } else if (
          recurrenceType === "monthly" &&
          recurrenceMonthDays &&
          recurrenceMonthDays.length > 0
        ) {
          // Ensure month days are valid (1-31)
          recurrence.monthDays = recurrenceMonthDays
            .map((day) => parseInt(day))
            .filter((day) => day >= 1 && day <= 31);
        }

        eventData.recurrence = recurrence;
      }

      const newEvent = await databaseService.createEvent(eventData);

      // Send invites to friends if specified
      const invitedFriendIds = req.body.invitedFriendIds;
      if (
        invitedFriendIds &&
        Array.isArray(invitedFriendIds) &&
        invitedFriendIds.length > 0
      ) {
        try {
          await databaseService.createEventInvites(
            newEvent.event_id,
            invitedFriendIds.map((id) => parseInt(id)),
            user.user_id
          );
        } catch (error) {
          console.error("Error creating event invites:", error);
          // Don't fail the event creation if invites fail
        }
      }

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

  // API endpoint for getting a single event
  app.get("/api/events/:id", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const eventId = parseInt(req.params.id);

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }

      const event = await databaseService.findEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Check if user has permission (owner or has accepted invite)
      if (event.user_id !== user.user_id) {
        // Check if user has an accepted invite
        const invite = await databaseService.getUserEventInvite(
          user.user_id,
          eventId
        );
        if (!invite || invite.status !== "ACCEPTED") {
          return res
            .status(403)
            .json({ error: "You don't have permission to view this event" });
        }
      }

      res.json(event);
    } catch (error) {
      console.error("Error fetching event:", error);
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  // API endpoint for updating events (full edit from form)
  app.put("/api/events/:id", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const eventId = parseInt(req.params.id);
      const {
        title,
        start_at,
        end_at,
        start,
        end,
        description,
        colour,
        recurrenceType,
        recurrenceWeekdays,
        recurrenceMonthDays,
        recurrenceEndDate,
        invitedFriendIds,
      } = req.body;

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

      // Use start_at/end_at if provided, otherwise use start/end
      const startDate = start_at
        ? new Date(start_at)
        : start
        ? new Date(start)
        : null;
      const endDate = end_at ? new Date(end_at) : end ? new Date(end) : null;

      if (!startDate) {
        return res.status(400).json({ error: "Event start time is required" });
      }

      // Prepare update data
      const updateData = {};
      if (title !== undefined && title !== null)
        updateData.title = title.trim();
      if (startDate) updateData.start_at = startDate;
      if (endDate) updateData.end_at = endDate;
      if (description !== undefined)
        updateData.description = description || null;
      if (colour !== undefined) updateData.colour = colour;

      // Handle recurrence updates
      if (
        recurrenceType &&
        recurrenceType !== "none" &&
        recurrenceType !== null
      ) {
        const recurrence = {
          pattern: recurrenceType.toUpperCase(), // DAILY, WEEKLY, MONTHLY
          start_at: startDate,
          end_at: recurrenceEndDate ? new Date(recurrenceEndDate) : null,
        };

        if (
          recurrenceType === "weekly" &&
          recurrenceWeekdays &&
          recurrenceWeekdays.length > 0
        ) {
          recurrence.weekdays = recurrenceWeekdays.map((wd) =>
            wd.toUpperCase()
          );
        } else if (
          recurrenceType === "monthly" &&
          recurrenceMonthDays &&
          recurrenceMonthDays.length > 0
        ) {
          recurrence.monthDays = recurrenceMonthDays
            .map((day) => parseInt(day))
            .filter((day) => day >= 1 && day <= 31);
        }

        updateData.recurrence = recurrence;
      } else if (recurrenceType === "none" || recurrenceType === null) {
        // If recurrenceType is "none" or null, remove recurrence
        updateData.recurrence = null;
      }

      const updatedEvent = await databaseService.updateEvent(
        eventId,
        updateData
      );

      // Handle event invites update
      if (invitedFriendIds !== undefined) {
        // Delete existing invites and create new ones
        // Note: This is a simple approach - you might want to be smarter about this
        try {
          // Get existing invites
          const existingInvites = await databaseService.getEventInvites(
            eventId
          );
          // For now, we'll just add new invites if provided
          // A more sophisticated approach would compare and update
          if (
            invitedFriendIds &&
            Array.isArray(invitedFriendIds) &&
            invitedFriendIds.length > 0
          ) {
            await databaseService.createEventInvites(
              eventId,
              invitedFriendIds.map((id) => parseInt(id)),
              user.user_id
            );
          }
        } catch (error) {
          console.error("Error updating event invites:", error);
          // Don't fail the event update if invites fail
        }
      }

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

  // API endpoint for getting event invites for current user
  app.get("/api/event-invites", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const status = req.query.status || null; // PENDING, ACCEPTED, DECLINED, or null for all
      const invites = await databaseService.getEventInvitesForUser(
        user.user_id,
        status
      );
      res.json(invites);
    } catch (error) {
      console.error("Error fetching event invites:", error);
      res.status(500).json({ error: "Failed to fetch event invites" });
    }
  });

  // API endpoint for getting invites for a specific event
  app.get("/api/events/:id/invites", isAuthenticated, async (req, res) => {
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
      const event = await databaseService.findEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (event.user_id !== user.user_id) {
        return res.status(403).json({
          error: "You don't have permission to view this event's invites",
        });
      }

      const invites = await databaseService.getEventInvites(eventId);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching event invites:", error);
      res.status(500).json({ error: "Failed to fetch event invites" });
    }
  });

  // API endpoint for getting user's invite status for a specific event
  app.get("/api/events/:id/my-invite", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);

    if (!user || !user.user_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const eventId = parseInt(req.params.id);

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }

      // Check if user has an invite for this event
      const invite = await databaseService.getUserEventInvite(
        user.user_id,
        eventId
      );

      if (!invite) {
        return res.json({ hasInvite: false });
      }

      res.json({
        hasInvite: true,
        invite: {
          invite_id: invite.invite_id,
          status: invite.status,
          event: invite.event,
          invitedBy: invite.invitedBy,
        },
      });
    } catch (error) {
      console.error("Error fetching user invite:", error);
      res.status(500).json({ error: "Failed to fetch user invite" });
    }
  });

  // API endpoint for getting pending invites count
  app.get(
    "/api/event-invites/pending-count",
    isAuthenticated,
    async (req, res) => {
      const user = getUserFromSession(req);

      if (!user || !user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      try {
        const count = await databaseService.getPendingEventInvitesCount(
          user.user_id
        );
        res.json({ count });
      } catch (error) {
        console.error("Error fetching pending invites count:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch pending invites count" });
      }
    }
  );

  // API endpoint for accepting an event invite
  app.post(
    "/api/event-invites/:id/accept",
    isAuthenticated,
    async (req, res) => {
      const user = getUserFromSession(req);

      if (!user || !user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      try {
        const inviteId = parseInt(req.params.id);

        if (!inviteId || isNaN(inviteId)) {
          return res.status(400).json({ error: "Invalid invite ID" });
        }

        const updatedInvite = await databaseService.updateEventInviteStatus(
          inviteId,
          user.user_id,
          "ACCEPTED"
        );

        res.json({
          success: true,
          message: "Event invite accepted",
          invite: updatedInvite,
        });
      } catch (error) {
        console.error("Error accepting event invite:", error);
        if (
          error.message === "Invite not found" ||
          error.message === "You are not authorized to update this invite" ||
          error.message === "Invite has already been responded to"
        ) {
          return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: "Failed to accept event invite" });
      }
    }
  );

  // API endpoint for declining an event invite
  app.post(
    "/api/event-invites/:id/decline",
    isAuthenticated,
    async (req, res) => {
      const user = getUserFromSession(req);

      if (!user || !user.user_id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      try {
        const inviteId = parseInt(req.params.id);

        if (!inviteId || isNaN(inviteId)) {
          return res.status(400).json({ error: "Invalid invite ID" });
        }

        const updatedInvite = await databaseService.updateEventInviteStatus(
          inviteId,
          user.user_id,
          "DECLINED"
        );

        res.json({
          success: true,
          message: "Event invite declined",
          invite: updatedInvite,
        });
      } catch (error) {
        console.error("Error declining event invite:", error);
        if (
          error.message === "Invite not found" ||
          error.message === "You are not authorized to update this invite" ||
          error.message === "Invite has already been responded to"
        ) {
          return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: "Failed to decline event invite" });
      }
    }
  );

  // Calendar view route (unified for month/week/day)
  app.get("/calendar", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);
    let events = [];
    let pendingInvitesCount = 0;

    // Fetch events for the user if authenticated
    if (user && user.user_id) {
      try {
        // Get all future events for the user
        const dbEvents = await databaseService.findEventsByUserId(user.user_id);
        events = transformEventsToFullCalendar(dbEvents);

        // Get pending invites count
        pendingInvitesCount = await databaseService.getPendingEventInvitesCount(
          user.user_id
        );
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    }

    res.render("calendar", {
      title: "Calendar",
      events: JSON.stringify(events), // Pass as JSON string for embedding in HTML
      pendingInvitesCount: pendingInvitesCount,
    });
  });
};
