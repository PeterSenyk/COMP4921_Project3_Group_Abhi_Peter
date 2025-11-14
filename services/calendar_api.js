// Google Calendar API service
const { google } = require("googleapis");
const { getClient, setCredentials, refreshAccessToken } = require("./OAuth");

/**
 * Get an authenticated Calendar API client
 * @param {Object} tokens - OAuth tokens (optional, uses stored credentials if not provided)
 * @returns {google.calendar_v3.Calendar} Calendar API client
 */
function getCalendarClient(tokens = null) {
  const auth = getClient();

  // Set credentials if provided
  if (tokens) {
    setCredentials(tokens);
  }

  return google.calendar({ version: "v3", auth });
}

/**
 * List events from a calendar
 * @param {string} calendarId - Calendar ID (default: 'primary')
 * @param {Object} options - Query options (timeMin, timeMax, maxResults, etc.)
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<Array>} Array of events
 */
async function listEvents(calendarId = "primary", options = {}, tokens = null) {
  try {
    const calendar = getCalendarClient(tokens);

    const params = {
      calendarId,
      timeMin: options.timeMin || new Date().toISOString(),
      maxResults: options.maxResults || 10,
      singleEvents: true,
      orderBy: "startTime",
    };

    if (options.timeMax) {
      params.timeMax = options.timeMax;
    }

    const response = await calendar.events.list(params);
    return response.data.items || [];
  } catch (error) {
    console.error("Error listing events:", error);
    throw error;
  }
}

/**
 * Get a specific event by ID
 * @param {string} eventId - Event ID
 * @param {string} calendarId - Calendar ID (default: 'primary')
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<Object>} Event object
 */
async function getEvent(eventId, calendarId = "primary", tokens = null) {
  try {
    const calendar = getCalendarClient(tokens);

    const response = await calendar.events.get({
      calendarId,
      eventId,
    });

    return response.data;
  } catch (error) {
    console.error("Error getting event:", error);
    throw error;
  }
}

/**
 * Create a new event
 * @param {Object} eventData - Event data (summary, description, start, end, etc.)
 * @param {string} calendarId - Calendar ID (default: 'primary')
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<Object>} Created event object
 */
async function createEvent(eventData, calendarId = "primary", tokens = null) {
  try {
    const calendar = getCalendarClient(tokens);

    const event = {
      summary: eventData.summary,
      description: eventData.description || "",
      start: {
        dateTime: eventData.start,
        timeZone: eventData.timeZone || "UTC",
      },
      end: {
        dateTime: eventData.end,
        timeZone: eventData.timeZone || "UTC",
      },
    };

    // Add attendees if provided
    if (eventData.attendees && Array.isArray(eventData.attendees)) {
      event.attendees = eventData.attendees.map((email) => ({ email }));
    }

    // Add location if provided
    if (eventData.location) {
      event.location = eventData.location;
    }

    const response = await calendar.events.insert({
      calendarId,
      resource: event,
    });

    return response.data;
  } catch (error) {
    console.error("Error creating event:", error);
    throw error;
  }
}

/**
 * Update an existing event
 * @param {string} eventId - Event ID
 * @param {Object} eventData - Updated event data
 * @param {string} calendarId - Calendar ID (default: 'primary')
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<Object>} Updated event object
 */
async function updateEvent(
  eventId,
  eventData,
  calendarId = "primary",
  tokens = null
) {
  try {
    const calendar = getCalendarClient(tokens);

    // First, get the existing event
    const existingEvent = await getEvent(eventId, calendarId, tokens);

    // Merge updates
    const updatedEvent = {
      ...existingEvent,
      summary: eventData.summary || existingEvent.summary,
      description:
        eventData.description !== undefined
          ? eventData.description
          : existingEvent.description,
    };

    if (eventData.start) {
      updatedEvent.start = {
        dateTime: eventData.start,
        timeZone: eventData.timeZone || existingEvent.start.timeZone || "UTC",
      };
    }

    if (eventData.end) {
      updatedEvent.end = {
        dateTime: eventData.end,
        timeZone: eventData.timeZone || existingEvent.end.timeZone || "UTC",
      };
    }

    if (eventData.location !== undefined) {
      updatedEvent.location = eventData.location;
    }

    if (eventData.attendees) {
      updatedEvent.attendees = eventData.attendees.map((email) => ({ email }));
    }

    const response = await calendar.events.update({
      calendarId,
      eventId,
      resource: updatedEvent,
    });

    return response.data;
  } catch (error) {
    console.error("Error updating event:", error);
    throw error;
  }
}

/**
 * Delete an event
 * @param {string} eventId - Event ID
 * @param {string} calendarId - Calendar ID (default: 'primary')
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<void>}
 */
async function deleteEvent(eventId, calendarId = "primary", tokens = null) {
  try {
    const calendar = getCalendarClient(tokens);

    await calendar.events.delete({
      calendarId,
      eventId,
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    throw error;
  }
}

/**
 * List all calendars for the user
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<Array>} Array of calendar objects
 */
async function listCalendars(tokens = null) {
  try {
    const calendar = getCalendarClient(tokens);

    const response = await calendar.calendarList.list();
    return response.data.items || [];
  } catch (error) {
    console.error("Error listing calendars:", error);
    throw error;
  }
}

/**
 * Get a specific calendar by ID
 * @param {string} calendarId - Calendar ID
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<Object>} Calendar object
 */
async function getCalendar(calendarId, tokens = null) {
  try {
    const calendar = getCalendarClient(tokens);

    const response = await calendar.calendars.get({
      calendarId,
    });

    return response.data;
  } catch (error) {
    console.error("Error getting calendar:", error);
    throw error;
  }
}

/**
 * Create a new calendar
 * @param {Object} calendarData - Calendar data (summary, description, timeZone, etc.)
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<Object>} Created calendar object
 */
async function createCalendar(calendarData, tokens = null) {
  try {
    const calendar = getCalendarClient(tokens);

    const calendarResource = {
      summary: calendarData.summary,
      description: calendarData.description || "",
      timeZone: calendarData.timeZone || "UTC",
    };

    // Add location if provided
    if (calendarData.location) {
      calendarResource.location = calendarData.location;
    }

    const response = await calendar.calendars.insert({
      requestBody: calendarResource,
    });

    return response.data;
  } catch (error) {
    console.error("Error creating calendar:", error);
    throw error;
  }
}

/**
 * Update an existing calendar
 * @param {string} calendarId - Calendar ID
 * @param {Object} calendarData - Updated calendar data
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<Object>} Updated calendar object
 */
async function updateCalendar(calendarId, calendarData, tokens = null) {
  try {
    const calendar = getCalendarClient(tokens);

    // First, get the existing calendar
    const existingCalendar = await getCalendar(calendarId, tokens);

    // Merge updates
    const updatedCalendar = {
      ...existingCalendar,
      summary: calendarData.summary || existingCalendar.summary,
      description:
        calendarData.description !== undefined
          ? calendarData.description
          : existingCalendar.description,
      timeZone: calendarData.timeZone || existingCalendar.timeZone,
    };

    if (calendarData.location !== undefined) {
      updatedCalendar.location = calendarData.location;
    }

    const response = await calendar.calendars.update({
      calendarId,
      requestBody: updatedCalendar,
    });

    return response.data;
  } catch (error) {
    console.error("Error updating calendar:", error);
    throw error;
  }
}

/**
 * Delete a calendar
 * @param {string} calendarId - Calendar ID
 * @param {Object} tokens - OAuth tokens (optional)
 * @returns {Promise<void>}
 */
async function deleteCalendar(calendarId, tokens = null) {
  try {
    const calendar = getCalendarClient(tokens);

    await calendar.calendars.delete({
      calendarId,
    });
  } catch (error) {
    console.error("Error deleting calendar:", error);
    throw error;
  }
}

module.exports = {
  getCalendarClient,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  listCalendars,
  getCalendar,
  createCalendar,
  updateCalendar,
  deleteCalendar,
};
