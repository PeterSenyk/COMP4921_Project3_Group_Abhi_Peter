// Calendar initialization and event handling
// This file is loaded as a client-side script
// eventsData should be defined in the page before this script loads

document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.getElementById("calendar");
  // eventsData should be defined globally from the EJS template
  const eventsData = window.initialEventsData || [];

  // Make calendar global so it can be accessed from friends sidebar
  window.calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    // Use eventSources array to support multiple event sources (user events + friend events)
    eventSources: [
      {
        // User's own events
        id: "user-events",
        events: function (fetchInfo, successCallback, failureCallback) {
          // Fetch user's events from API endpoint (supports date range filtering)
          fetch(
            "/api/events?start=" +
              fetchInfo.startStr +
              "&end=" +
              fetchInfo.endStr
          )
            .then((response) => response.json())
            .then((data) => {
              successCallback(data);
            })
            .catch((error) => {
              console.error("Error fetching user events:", error);
              // Fallback to initial events if API fails
              successCallback(eventsData);
              failureCallback(error);
            });
        },
        editable: true, // User can edit their own events
        color: "#0000af", // Default blue color for user events
      },
    ],
    eventClick: function (info) {
      // Show modal with event details
      showEventModal(info.event);
      info.jsEvent.preventDefault();
    },
    // Customize event rendering to differentiate friend events
    eventDidMount: function (info) {
      // Add visual distinction for friend events
      if (info.event.extendedProps.friend_username) {
        info.el.classList.add("friend-event");
        info.el.style.opacity = "0.8";
        // Get the gray color from the event (should be set by event source or override)
        const grayColor =
          info.event.backgroundColor ||
          info.event.borderColor ||
          info.event.color ||
          "#dee2e6";
        // Apply gray color to the event background
        info.event.setProp("color", grayColor);
        info.event.setProp("backgroundColor", grayColor);
        info.event.setProp("borderColor", grayColor);
        // Thick colored border matching the gray color
        info.el.style.borderLeft = "6px solid " + grayColor;
        info.el.style.borderLeftColor = grayColor;
        info.el.style.backgroundColor = grayColor;
        info.el.title =
          info.event.title +
          " (" +
          info.event.extendedProps.friend_username +
          ")";
      }
    },
    eventDisplay: "block",
    height: "auto",
    navLinks: true, // Allow clicking day/week names to navigate
    dayMaxEvents: true, // Allow "more" link when too many events
    moreLinkClick: "popover", // Show popover when clicking "more" link
    editable: true, // Enable drag-and-drop for events
    selectable: true, // Enable time slot selection
    selectMirror: true, // Show selection feedback
    slotMinTime: "00:00:00",
    slotMaxTime: "24:00:00",
    allDaySlot: true,
    nowIndicator: true, // Show current time indicator
    scrollTime: "08:00:00", // Scroll to 8am by default (for week/day views)
    // Handle when an event is dropped (moved to a new date/time)
    eventDrop: function (info) {
      // Only allow editing user's own events, not friend events
      if (info.event.extendedProps.friend_username) {
        // Revert the change for friend events
        info.revert();
        alert("You cannot modify friend events");
        return;
      }
      updateEvent(info.event);
    },
    // Handle when an event is resized (duration changed)
    eventResize: function (info) {
      // Only allow editing user's own events, not friend events
      if (info.event.extendedProps.friend_username) {
        // Revert the change for friend events
        info.revert();
        alert("You cannot modify friend events");
        return;
      }
      updateEvent(info.event);
    },
    // Handle when a time slot is selected (for creating new events)
    select: function (selectInfo) {
      // Show form modal for creating new event
      showEventFormModal(null, selectInfo);
      window.calendar.unselect(); // Clear selection
    },
  });

  window.calendar.render();

  // Store current event for modal operations
  let currentEvent = null;

  // Function to show event modal
  function showEventModal(event) {
    currentEvent = event;
    const modal = document.getElementById("eventModal");
    const titleEl = document.getElementById("modalEventTitle");
    const startEl = document.getElementById("modalEventStart");
    const endEl = document.getElementById("modalEventEnd");
    const descriptionEl = document.getElementById("modalEventDescription");

    // Populate modal with event data
    // Show friend name if it's a friend's event
    const editBtn = document.getElementById("modalEditBtn");
    const deleteBtn = document.getElementById("modalDeleteBtn");

    if (event.extendedProps.friend_username) {
      titleEl.textContent =
        event.title + " (" + event.extendedProps.friend_username + ")";
      // Hide edit/delete buttons for friend events
      if (editBtn) editBtn.style.display = "none";
      if (deleteBtn) deleteBtn.style.display = "none";
    } else {
      titleEl.textContent = event.title;
      // Show edit/delete buttons for user's own events
      if (editBtn) editBtn.style.display = "inline-block";
      if (deleteBtn) deleteBtn.style.display = "inline-block";
    }
    startEl.textContent = event.start.toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (event.end) {
      endEl.textContent = event.end.toLocaleString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } else {
      endEl.textContent = "No end time";
    }

    const description = event.extendedProps.description || "";
    if (description) {
      descriptionEl.textContent = description;
      descriptionEl.style.fontStyle = "normal";
    } else {
      descriptionEl.textContent = "No description provided";
      descriptionEl.style.fontStyle = "italic";
    }

    // Show modal
    modal.classList.add("show");
  }

  // Function to close event modal
  window.closeEventModal = function () {
    const modal = document.getElementById("eventModal");
    modal.classList.remove("show");
    currentEvent = null;
  };

  // Function to edit event from modal
  window.editEventFromModal = function () {
    if (currentEvent) {
      closeEventModal();
      showEventFormModal(currentEvent);
    }
  };

  // Function to delete event from modal
  window.deleteEventFromModal = function () {
    if (!currentEvent) return;

    if (confirm("Are you sure you want to delete this event?")) {
      fetch("/api/events/" + currentEvent.id, {
        method: "DELETE",
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            alert("Failed to delete event: " + data.error);
          } else {
            // Remove event from calendar
            currentEvent.remove();
            closeEventModal();
          }
        })
        .catch((error) => {
          console.error("Error deleting event:", error);
          alert("Failed to delete event. Please try again.");
        });
    }
  };

  // Close modal when clicking outside (event details modal)
  window.addEventListener("click", function (event) {
    const modal = document.getElementById("eventModal");
    if (event.target === modal) {
      closeEventModal();
    }
  });

  // Function to update event when dragged or resized
  function updateEvent(event) {
    const eventData = {
      event_id: event.extendedProps.event_id,
      title: event.title,
      start_at: event.start.toISOString(),
      end_at: event.end ? event.end.toISOString() : event.start.toISOString(),
    };

    fetch("/api/events/" + event.id, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventData),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          console.error("Error updating event:", data.error);
          alert("Failed to update event: " + data.error);
          // Revert the event change
          window.calendar.refetchEvents();
        } else {
          console.log("Event updated successfully");
        }
      })
      .catch((error) => {
        console.error("Error updating event:", error);
        alert("Failed to update event. Please try again.");
        // Revert the event change
        calendar.refetchEvents();
      });
  }

  // Function to select a colour option
  function selectColourOption(colour) {
    const colourOptions = document.querySelectorAll(
      ".event-form-colour-option"
    );
    colourOptions.forEach((option) => {
      option.classList.remove("selected");
      const radio = option.querySelector('input[type="radio"]');
      if (radio && radio.value === colour) {
        radio.checked = true;
        option.classList.add("selected");
      }
    });
  }

  // Helper function to format date for datetime-local input
  function formatDateForInput(date) {
    if (!date) return "";
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // Function to show event form modal (for create or edit)
  function showEventFormModal(event, selectInfo) {
    const formModal = document.getElementById("eventFormModal");
    const form = document.getElementById("eventForm");
    const formTitle = document.getElementById("formModalTitle");
    const submitBtn = document.getElementById("formSubmitBtn");
    const titleInput = document.getElementById("eventTitle");
    const startInput = document.getElementById("eventStart");
    const endInput = document.getElementById("eventEnd");
    const descriptionInput = document.getElementById("eventDescription");
    const allDayInput = document.getElementById("eventAllDay");

    // Reset form
    form.reset();
    clearFormErrors();

    // Reset color selection
    const colourOptions = document.querySelectorAll(
      ".event-form-colour-option"
    );
    colourOptions.forEach((option) => {
      option.classList.remove("selected");
      const radio = option.querySelector('input[type="radio"]');
      if (radio) radio.checked = false;
    });

    if (event) {
      // Edit mode - pre-fill form with event data
      formTitle.textContent = "Edit Event";
      submitBtn.textContent = "Update Event";
      titleInput.value = event.title;
      startInput.value = formatDateForInput(event.start);
      endInput.value = formatDateForInput(event.end);
      descriptionInput.value = event.extendedProps.description || "";
      allDayInput.checked = event.allDay || false;

      // Set the color selection
      const eventColor = event.color || event.extendedProps.colour || "#0000af";
      selectColourOption(eventColor);

      form.dataset.eventId = event.id;
      form.dataset.mode = "edit";
    } else if (selectInfo) {
      // Create mode - pre-fill with selected time slot
      formTitle.textContent = "Create Event";
      submitBtn.textContent = "Create Event";
      startInput.value = formatDateForInput(selectInfo.start);
      endInput.value = formatDateForInput(selectInfo.end);
      allDayInput.checked = selectInfo.allDay || false;
      // Default to blue color for new events
      selectColourOption("#0000af");

      form.dataset.mode = "create";
      delete form.dataset.eventId;
    } else {
      // Create mode - empty form
      formTitle.textContent = "Create Event";
      submitBtn.textContent = "Create Event";
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      startInput.value = formatDateForInput(now);
      endInput.value = formatDateForInput(oneHourLater);

      // Default to blue color for new events
      selectColourOption("#0000af");

      form.dataset.mode = "create";
      delete form.dataset.eventId;
    }

    // Show modal
    formModal.classList.add("show");
  }

  // Function to close event form modal
  window.closeEventFormModal = function () {
    const formModal = document.getElementById("eventFormModal");
    const form = document.getElementById("eventForm");
    formModal.classList.remove("show");
    form.reset();
    clearFormErrors();
    delete form.dataset.eventId;
    delete form.dataset.mode;
  };

  // Function to clear form errors
  function clearFormErrors() {
    const errorElements = document.querySelectorAll(".event-form-error");
    errorElements.forEach((el) => {
      el.classList.remove("show");
      el.textContent = "";
    });
  }

  // Function to show form error
  function showFormError(fieldId, message) {
    const errorEl = document.getElementById(fieldId + "Error");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("show");
    }
  }

  // Function to handle form submission
  window.handleEventFormSubmit = function (e) {
    e.preventDefault();
    clearFormErrors();

    const form = document.getElementById("eventForm");
    const mode = form.dataset.mode || "create";
    const submitBtn = document.getElementById("formSubmitBtn");

    // Get form values
    const title = document.getElementById("eventTitle").value.trim();
    const start = document.getElementById("eventStart").value;
    const end = document.getElementById("eventEnd").value;
    const description = document
      .getElementById("eventDescription")
      .value.trim();
    const allDay = document.getElementById("eventAllDay").checked;

    // Get selected colour
    const colourRadio = document.querySelector('input[name="colour"]:checked');
    const colour = colourRadio ? colourRadio.value : "#0000af"; // Default to blue

    // Validation
    let hasErrors = false;
    if (!title) {
      showFormError("title", "Title is required");
      hasErrors = true;
    }
    if (!start) {
      showFormError("start", "Start date and time is required");
      hasErrors = true;
    }
    if (!end) {
      showFormError("end", "End date and time is required");
      hasErrors = true;
    }

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (endDate <= startDate) {
        showFormError("end", "End time must be after start time");
        hasErrors = true;
      }
    }

    if (hasErrors) {
      return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = mode === "edit" ? "Updating..." : "Creating...";

    // Prepare event data
    const eventData = {
      title: title,
      start: start,
      end: end,
      description: description || null,
      allDay: allDay,
      colour: colour,
    };

    if (mode === "edit") {
      // Update existing event
      const eventId = form.dataset.eventId;
      eventData.event_id = parseInt(eventId);
      eventData.start_at = new Date(start).toISOString();
      eventData.end_at = new Date(end).toISOString();

      fetch("/api/events/" + eventId, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventData),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            alert("Failed to update event: " + data.error);
            submitBtn.disabled = false;
            submitBtn.textContent = "Update Event";
          } else {
            // Update event in calendar
            const calendarEvent = window.calendar.getEventById(eventId);
            if (calendarEvent) {
              calendarEvent.setProp("title", data.title);
              calendarEvent.setStart(new Date(data.start_at));
              calendarEvent.setEnd(new Date(data.end_at));
              calendarEvent.setProp("color", data.colour || "#0000af");
              calendarEvent.setExtendedProp("description", data.description);
            }
            closeEventFormModal();
            alert("Event updated successfully!");
          }
        })
        .catch((error) => {
          console.error("Error updating event:", error);
          alert("Failed to update event. Please try again.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Update Event";
        });
    } else {
      // Create new event
      fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventData),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            alert("Failed to create event: " + data.error);
            submitBtn.disabled = false;
            submitBtn.textContent = "Create Event";
          } else {
            // Add the new event to the calendar
            window.calendar.addEvent({
              id: data.event_id.toString(),
              title: data.title,
              start: data.start_at,
              end: data.end_at,
              color: data.colour || "#0000af",
              description: data.description,
              extendedProps: {
                event_id: data.event_id,
                user_id: data.user_id,
                description: data.description,
              },
            });
            closeEventFormModal();
            alert("Event created successfully!");
          }
        })
        .catch((error) => {
          console.error("Error creating event:", error);
          alert("Failed to create event. Please try again.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Event";
        });
    }
  };

  // Close form modal when clicking outside
  window.addEventListener("click", function (event) {
    const formModal = document.getElementById("eventFormModal");
    if (event.target === formModal) {
      closeEventFormModal();
    }
  });

  // Add click handlers for colour options (using event delegation)
  document.addEventListener("click", function (e) {
    const colourOption = e.target.closest(".event-form-colour-option");
    if (colourOption) {
      // Remove selected class from all options
      const allOptions = document.querySelectorAll(".event-form-colour-option");
      allOptions.forEach((opt) => opt.classList.remove("selected"));
      // Add selected class to clicked option
      colourOption.classList.add("selected");
      // Check the radio button
      const radio = colourOption.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    }
  });
});
