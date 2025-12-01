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
      // Only allow editing user's own events
      if (info.event.extendedProps.friend_username) {
        // Revert the change for friend events
        info.revert();
        alert("You cannot modify friend events");
        return;
      }
      // Prevent editing events where user has accepted invite but didn't create
      if (info.event.extendedProps.hasAcceptedInvite) {
        info.revert();
        alert(
          "You cannot modify events you were invited to. You can only reject the invite."
        );
        return;
      }
      updateEvent(info.event);
    },
    // Handle when an event is resized (duration changed)
    eventResize: function (info) {
      // Only allow editing user's own events
      if (info.event.extendedProps.friend_username) {
        // Revert the change for friend events
        info.revert();
        alert("You cannot modify friend events");
        return;
      }
      // Prevent editing events where user has accepted invite but didn't create
      if (info.event.extendedProps.hasAcceptedInvite) {
        info.revert();
        alert(
          "You cannot modify events you were invited to. You can only reject the invite."
        );
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

  // Function to load and display event invites in modal
  async function loadEventInvitesForModal(eventId) {
    const invitesContainer = document.getElementById("modalInvitedFriends");
    const invitesField = document.getElementById("modalInvitedFriendsField");

    if (!invitesContainer || !invitesField) return;

    try {
      const response = await fetch(`/api/events/${eventId}/invites`);
      if (!response.ok) {
        // If 403 or 404, hide the field (user doesn't own the event)
        if (response.status === 403 || response.status === 404) {
          invitesField.style.display = "none";
          return;
        }
        throw new Error("Failed to fetch event invites");
      }

      const invites = await response.json();

      if (invites.length === 0) {
        invitesField.style.display = "none";
        return;
      }

      // Show the field and render invites
      invitesField.style.display = "block";

      // Group invites by status
      const statusColors = {
        PENDING: "#ffc107", // Yellow
        ACCEPTED: "#28a745", // Green
        DECLINED: "#dc3545", // Red
        CANCELLED: "#6c757d", // Gray
      };

      const statusLabels = {
        PENDING: "Pending",
        ACCEPTED: "Accepted",
        DECLINED: "Declined",
        CANCELLED: "Cancelled",
      };

      const statusClass = (status) => {
        const statusLower = (status || "").toLowerCase();
        return statusLower === "pending"
          ? "pending"
          : statusLower === "accepted"
          ? "accepted"
          : statusLower === "declined"
          ? "declined"
          : statusLower === "cancelled"
          ? "cancelled"
          : "";
      };

      invitesContainer.innerHTML = `
        <div class="event-modal-invites-list">
          ${invites
            .map(
              (invite) => `
            <div class="event-modal-invite-item ${statusClass(invite.status)}">
              <div style="flex: 1">
                <div style="font-weight: 500; color: #333; font-size: 0.95rem">
                  ${
                    invite.invitedUser
                      ? invite.invitedUser.username
                      : "Unknown User"
                  }
                </div>
                ${
                  invite.invitedBy
                    ? `<div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem">Invited by: ${invite.invitedBy.username}</div>`
                    : ""
                }
              </div>
              <div style="margin-left: 1rem">
                <span class="event-modal-invite-status ${statusClass(
                  invite.status
                )}">
                  ${statusLabels[invite.status] || invite.status}
                </span>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    } catch (error) {
      console.error("Error loading event invites:", error);
      invitesField.style.display = "none";
    }
  }

  // Store current user invite info for the event
  let currentUserInvite = null;

  // Function to show event modal
  async function showEventModal(event) {
    currentEvent = event;
    currentUserInvite = null; // Reset
    const modal = document.getElementById("eventModal");
    const titleEl = document.getElementById("modalEventTitle");
    const startEl = document.getElementById("modalEventStart");
    const endEl = document.getElementById("modalEventEnd");
    const descriptionEl = document.getElementById("modalEventDescription");

    // Populate modal with event data
    const editBtn = document.getElementById("modalEditBtn");
    const deleteBtn = document.getElementById("modalDeleteBtn");
    const rejectBtn = document.getElementById("modalRejectBtn");
    const eventId = event.extendedProps.event_id || event.id;
    const eventUserId = event.extendedProps.user_id;

    // Check if user has an accepted invite for this event (but didn't create it)
    let userHasAcceptedInvite = false;
    if (eventId) {
      // Check if event has the hasAcceptedInvite flag (set by API if user has accepted invite)
      if (event.extendedProps.hasAcceptedInvite) {
        userHasAcceptedInvite = true;
        // Get the invite details using the invite_id from extendedProps
        const inviteId = event.extendedProps.invite_id;
        if (inviteId) {
          try {
            const response = await fetch(`/api/events/${eventId}/my-invite`);
            if (response.ok) {
              const data = await response.json();
              if (data.hasInvite && data.invite.status === "ACCEPTED") {
                currentUserInvite = data.invite;
              }
            }
          } catch (error) {
            console.error("Error fetching invite details:", error);
          }
        }
      }
    }

    if (event.extendedProps.friend_username) {
      // Friend's event - hide all action buttons
      titleEl.textContent =
        event.title + " (" + event.extendedProps.friend_username + ")";
      if (editBtn) editBtn.style.display = "none";
      if (deleteBtn) deleteBtn.style.display = "none";
      if (rejectBtn) rejectBtn.style.display = "none";
      // Hide invited friends section for friend events
      const invitesField = document.getElementById("modalInvitedFriendsField");
      if (invitesField) invitesField.style.display = "none";
    } else if (userHasAcceptedInvite && currentUserInvite) {
      // User has accepted invite but didn't create the event
      titleEl.textContent = event.title;
      // Hide edit/delete buttons
      if (editBtn) editBtn.style.display = "none";
      if (deleteBtn) deleteBtn.style.display = "none";
      // Show reject button
      if (rejectBtn) {
        rejectBtn.style.display = "inline-block";
        rejectBtn.dataset.inviteId = currentUserInvite.invite.invite_id;
      }
      // Hide invited friends section (they can't see who else is invited)
      const invitesField = document.getElementById("modalInvitedFriendsField");
      if (invitesField) invitesField.style.display = "none";
    } else {
      // User's own event
      titleEl.textContent = event.title;
      // Show edit/delete buttons for user's own events
      if (editBtn) editBtn.style.display = "inline-block";
      if (deleteBtn) deleteBtn.style.display = "inline-block";
      if (rejectBtn) rejectBtn.style.display = "none";
      // Load and show invited friends for user's own events
      if (eventId) {
        await loadEventInvitesForModal(parseInt(eventId));
      }
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
    // Reset invited friends section
    const invitesField = document.getElementById("modalInvitedFriendsField");
    const invitesContainer = document.getElementById("modalInvitedFriends");
    if (invitesField) invitesField.style.display = "none";
    if (invitesContainer) {
      invitesContainer.innerHTML =
        '<div style="font-size: 0.9rem; color: #666; font-style: italic">Loading...</div>';
    }
  };

  // Function to edit event from modal
  window.editEventFromModal = function (event) {
    if (!currentEvent) return;

    // Prevent event propagation
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Store the event before closing the modal
    const eventToEdit = currentEvent;

    // Close the event details modal
    closeEventModal();

    // Open the event edit modal (await the async function)
    showEventEditModal(eventToEdit).catch((error) => {
      console.error("Error opening edit modal:", error);
      alert("Failed to open edit form. Please try again.");
    });
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

  // Function to reject event invite from modal
  window.rejectEventInviteFromModal = function () {
    if (!currentEvent || !currentUserInvite) return;

    if (
      confirm(
        "Are you sure you want to reject this event invite? The event will be removed from your calendar."
      )
    ) {
      const inviteId = currentUserInvite.invite.invite_id;
      fetch(`/api/event-invites/${inviteId}/decline`, {
        method: "POST",
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            alert("Failed to reject invite: " + data.error);
          } else {
            // Remove event from calendar
            currentEvent.remove();
            closeEventModal();
            alert(
              "Event invite rejected. The event has been removed from your calendar."
            );
          }
        })
        .catch((error) => {
          console.error("Error rejecting invite:", error);
          alert("Failed to reject invite. Please try again.");
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

  // Load friends for event invite selection
  async function loadFriendsForInvite() {
    const container = document.getElementById("friendsSelectionContainer");
    try {
      const response = await fetch("/api/friends");
      if (!response.ok) {
        throw new Error("Failed to fetch friends");
      }
      const friends = await response.json();

      // Filter to only accepted friends
      const acceptedFriends = friends.filter((f) => f.status === "ACCEPTED");

      if (acceptedFriends.length === 0) {
        container.innerHTML =
          '<div style="font-size: 0.9rem; color: #666; font-style: italic">No friends to invite</div>';
        return;
      }

      // Render friend checkboxes
      container.innerHTML = acceptedFriends
        .map(
          (friend) => `
        <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; cursor: pointer; padding: 0.5rem; border-radius: 5px; transition: background-color 0.2s" 
               onmouseover="this.style.backgroundColor='#f5f5f5'" 
               onmouseout="this.style.backgroundColor='transparent'">
          <input
            type="checkbox"
            name="invitedFriend"
            value="${friend.user_id}"
            class="event-form-checkbox"
            style="margin: 0"
          />
          <span style="font-size: 0.9rem">${friend.username}</span>
        </label>
      `
        )
        .join("");
    } catch (error) {
      console.error("Error loading friends:", error);
      container.innerHTML =
        '<div style="font-size: 0.9rem; color: #dc3545">Failed to load friends</div>';
    }
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

    // Reset recurrence options
    document.getElementById("recurrenceType").value = "none";
    window.handleRecurrenceTypeChange();

    // Load friends for invite selection
    loadFriendsForInvite();

    if (event) {
      // Edit mode - pre-fill form with event data
      formTitle.textContent = "Edit Event";
      submitBtn.textContent = "Update Event";

      // Set event ID and mode
      form.dataset.eventId = event.id;
      form.dataset.mode = "edit";

      titleInput.value = event.title;
      startInput.value = formatDateForInput(event.start);
      endInput.value = formatDateForInput(event.end);
      descriptionInput.value = event.extendedProps.description || "";
      allDayInput.checked = event.allDay || false;

      // Set the color selection
      const eventColor = event.color || event.extendedProps.colour || "#0000af";
      selectColourOption(eventColor);
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

  // Function to show event edit modal
  async function showEventEditModal(event) {
    const editModal = document.getElementById("eventEditModal");
    const form = document.getElementById("eventEditForm");
    const eventId = event.extendedProps.event_id || event.id;

    // Reset form
    form.reset();
    clearEditFormErrors();

    // Reset color selection
    const colourOptions = document.querySelectorAll(
      "#editColourOptions .event-form-colour-option"
    );
    colourOptions.forEach((option) => {
      option.classList.remove("selected");
      const radio = option.querySelector('input[type="radio"]');
      if (radio) radio.checked = false;
    });

    // Reset recurrence options
    document.getElementById("editRecurrenceType").value = "none";
    handleEditRecurrenceTypeChange();

    // Load event data including recurrence and invites
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch event data");
      }
      const eventData = await response.json();

      // Pre-fill form with event data
      document.getElementById("editEventTitle").value =
        eventData.title || event.title;
      document.getElementById("editEventStart").value = formatDateForInput(
        new Date(eventData.start_at || event.start)
      );
      document.getElementById("editEventEnd").value = formatDateForInput(
        new Date(eventData.end_at || event.end)
      );
      document.getElementById("editEventDescription").value =
        eventData.description || event.extendedProps.description || "";
      document.getElementById("editEventAllDay").checked =
        event.allDay || false;

      // Set the color selection
      const eventColor =
        eventData.colour ||
        event.color ||
        event.extendedProps.colour ||
        "#0096c7";
      selectEditColourOption(eventColor);

      // Set recurrence if exists
      if (eventData.recurrence) {
        const recurrence = eventData.recurrence;
        if (recurrence.pattern === "DAILY") {
          document.getElementById("editRecurrenceType").value = "daily";
        } else if (recurrence.pattern === "WEEKLY") {
          document.getElementById("editRecurrenceType").value = "weekly";
          if (recurrence.weekdays && recurrence.weekdays.length > 0) {
            recurrence.weekdays.forEach((day) => {
              const checkbox = document.querySelector(
                `input[name="editRecurrenceWeekday"][value="${day}"]`
              );
              if (checkbox) checkbox.checked = true;
            });
          }
        } else if (recurrence.pattern === "MONTHLY") {
          document.getElementById("editRecurrenceType").value = "monthly";
          if (recurrence.monthDays && recurrence.monthDays.length > 0) {
            document.getElementById("editRecurrenceMonthDays").value =
              recurrence.monthDays.join(", ");
          }
        }
        if (recurrence.end_at) {
          const endDate = new Date(recurrence.end_at);
          document.getElementById("editRecurrenceEndDate").value = endDate
            .toISOString()
            .split("T")[0];
        }
        handleEditRecurrenceTypeChange();
      }

      // Load friends for invite selection
      await loadFriendsForEditInvite(eventId);

      // Store event ID in form
      form.dataset.eventId = eventId;

      // Show modal after data is loaded
      editModal.classList.add("show");
    } catch (error) {
      console.error("Error loading event data:", error);
      // Still show the modal even if there's an error, but with basic data
      document.getElementById("editEventTitle").value = event.title || "";
      document.getElementById("editEventStart").value = formatDateForInput(
        event.start
      );
      document.getElementById("editEventEnd").value = formatDateForInput(
        event.end
      );
      document.getElementById("editEventDescription").value =
        event.extendedProps.description || "";

      const eventColor = event.color || event.extendedProps.colour || "#0096c7";
      selectEditColourOption(eventColor);

      form.dataset.eventId = eventId;

      // Show modal even with error
      editModal.classList.add("show");
      alert(
        "Warning: Some event data may not have loaded correctly. Please verify the information."
      );
    }
  }

  // Function to close event edit modal
  window.closeEventEditModal = function () {
    const editModal = document.getElementById("eventEditModal");
    const form = document.getElementById("eventEditForm");
    editModal.classList.remove("show");
    form.reset();
    clearEditFormErrors();
    delete form.dataset.eventId;
  };

  // Function to clear edit form errors
  function clearEditFormErrors() {
    const errorElements = document.querySelectorAll(
      "#eventEditForm .event-form-error"
    );
    errorElements.forEach((el) => {
      el.classList.remove("show");
      el.textContent = "";
    });
  }

  // Function to show edit form error
  function showEditFormError(fieldId, message) {
    const errorEl = document.getElementById(fieldId + "Error");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("show");
    }
  }

  // Function to select colour option in edit form
  function selectEditColourOption(colour) {
    const colourOptions = document.querySelectorAll(
      "#editColourOptions .event-form-colour-option"
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

  // Function to handle recurrence type change in edit form
  window.handleEditRecurrenceTypeChange = function () {
    const recurrenceType = document.getElementById("editRecurrenceType").value;
    const weeklyOptions = document.getElementById(
      "editWeeklyRecurrenceOptions"
    );
    const monthlyOptions = document.getElementById(
      "editMonthlyRecurrenceOptions"
    );
    const endDateOptions = document.getElementById(
      "editRecurrenceEndDateOptions"
    );

    // Hide all options first
    weeklyOptions.style.display = "none";
    monthlyOptions.style.display = "none";
    endDateOptions.style.display = "none";

    // Show relevant options based on type
    if (recurrenceType === "weekly") {
      weeklyOptions.style.display = "block";
      endDateOptions.style.display = "block";
    } else if (recurrenceType === "monthly") {
      monthlyOptions.style.display = "block";
      endDateOptions.style.display = "block";
    } else if (recurrenceType === "daily") {
      endDateOptions.style.display = "block";
    }
  };

  // Function to load friends for edit invite selection
  async function loadFriendsForEditInvite(eventId) {
    const container = document.getElementById("editFriendsSelectionContainer");
    try {
      // Load friends list
      const friendsResponse = await fetch("/api/friends");
      if (!friendsResponse.ok) {
        throw new Error("Failed to load friends");
      }
      const friends = await friendsResponse.json();

      // Load existing invites for this event
      const invitesResponse = await fetch(`/api/events/${eventId}/invites`);
      let existingInviteUserIds = [];
      if (invitesResponse.ok) {
        const invites = await invitesResponse.json();
        existingInviteUserIds = invites.map(
          (invite) => invite.invitedUser.user_id
        );
      }

      if (friends.length === 0) {
        container.innerHTML =
          '<div style="font-size: 0.9rem; color: #666; font-style: italic">No friends to invite</div>';
        return;
      }

      container.innerHTML = friends
        .map(
          (friend) => `
        <label
          style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            margin-bottom: 0.5rem;
          "
        >
          <input
            type="checkbox"
            name="editInvitedFriend"
            value="${friend.user_id}"
            class="event-form-checkbox"
            ${existingInviteUserIds.includes(friend.user_id) ? "checked" : ""}
            style="margin: 0"
          />
          <span style="font-size: 0.9rem">${friend.username}</span>
        </label>
      `
        )
        .join("");
    } catch (error) {
      console.error("Error loading friends:", error);
      container.innerHTML =
        '<div style="font-size: 0.9rem; color: #dc3545">Failed to load friends</div>';
    }
  }

  // Function to handle edit form submission
  window.handleEventEditSubmit = function (e) {
    e.preventDefault();
    clearEditFormErrors();

    const form = document.getElementById("eventEditForm");
    const eventId = form.dataset.eventId;
    const submitBtn = document.getElementById("editFormSubmitBtn");

    if (!eventId) {
      alert("Event ID is missing. Please try again.");
      return;
    }

    // Get form values
    const title = document.getElementById("editEventTitle").value.trim();
    const start = document.getElementById("editEventStart").value;
    const end = document.getElementById("editEventEnd").value;
    const description = document
      .getElementById("editEventDescription")
      .value.trim();
    const allDay = document.getElementById("editEventAllDay").checked;

    // Get selected colour
    const colourRadio = document.querySelector(
      '#editColourOptions input[name="editColour"]:checked'
    );
    const colour = colourRadio ? colourRadio.value : "#0096c7";

    // Get recurrence data
    const recurrenceType = document.getElementById("editRecurrenceType").value;
    let recurrenceWeekdays = null;
    let recurrenceMonthDays = null;
    const recurrenceEndDate =
      document.getElementById("editRecurrenceEndDate").value || null;

    // Get selected friends for invites
    const friendCheckboxes = document.querySelectorAll(
      'input[name="editInvitedFriend"]:checked'
    );
    const invitedFriendIds = Array.from(friendCheckboxes).map((cb) =>
      parseInt(cb.value)
    );

    if (recurrenceType === "weekly") {
      const weekdayCheckboxes = document.querySelectorAll(
        'input[name="editRecurrenceWeekday"]:checked'
      );
      if (weekdayCheckboxes.length === 0) {
        alert(
          "Please select at least one day of the week for weekly recurrence"
        );
        return;
      }
      recurrenceWeekdays = Array.from(weekdayCheckboxes).map((cb) => cb.value);
    } else if (recurrenceType === "monthly") {
      const monthDaysInput = document
        .getElementById("editRecurrenceMonthDays")
        .value.trim();
      if (!monthDaysInput) {
        alert(
          "Please enter at least one day of the month for monthly recurrence"
        );
        return;
      }
      recurrenceMonthDays = monthDaysInput
        .split(",")
        .map((day) => day.trim())
        .filter((day) => {
          const dayNum = parseInt(day);
          return !isNaN(dayNum) && dayNum >= 1 && dayNum <= 31;
        });
      if (recurrenceMonthDays.length === 0) {
        alert("Please enter valid day numbers (1-31) for monthly recurrence");
        return;
      }
    }

    // Validation
    let hasErrors = false;
    if (!title) {
      showEditFormError("editTitle", "Title is required");
      hasErrors = true;
    }
    if (!start) {
      showEditFormError("editStart", "Start date and time is required");
      hasErrors = true;
    }
    if (!end) {
      showEditFormError("editEnd", "End date and time is required");
      hasErrors = true;
    }

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (endDate <= startDate) {
        showEditFormError("editEnd", "End time must be after start time");
        hasErrors = true;
      }
    }

    if (hasErrors) {
      return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";

    // Prepare event data
    const eventData = {
      title: title,
      start: start,
      end: end,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      description: description || null,
      allDay: allDay,
      colour: colour,
      recurrenceType: recurrenceType === "none" ? null : recurrenceType,
      recurrenceWeekdays: recurrenceWeekdays,
      recurrenceMonthDays: recurrenceMonthDays,
      recurrenceEndDate: recurrenceEndDate,
      invitedFriendIds: invitedFriendIds.length > 0 ? invitedFriendIds : null,
    };

    // Send PUT request to update event
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
          // Refresh calendar to show updated event
          window.calendar.refetchEvents();
          closeEventEditModal();
          alert("Event updated successfully!");
        }
      })
      .catch((error) => {
        console.error("Error updating event:", error);
        alert("Failed to update event. Please try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Update Event";
      });
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

  // Function to handle recurrence type change
  window.handleRecurrenceTypeChange = function () {
    const recurrenceType = document.getElementById("recurrenceType").value;
    const weeklyOptions = document.getElementById("weeklyRecurrenceOptions");
    const monthlyOptions = document.getElementById("monthlyRecurrenceOptions");
    const endDateOptions = document.getElementById("recurrenceEndDateOptions");

    // Hide all options first
    weeklyOptions.style.display = "none";
    monthlyOptions.style.display = "none";
    endDateOptions.style.display = "none";

    // Show relevant options based on type
    if (recurrenceType === "weekly") {
      weeklyOptions.style.display = "block";
      endDateOptions.style.display = "block";
    } else if (recurrenceType === "monthly") {
      monthlyOptions.style.display = "block";
      endDateOptions.style.display = "block";
    } else if (recurrenceType === "daily") {
      endDateOptions.style.display = "block";
    }
  };

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

    // Get recurrence data
    const recurrenceType = document.getElementById("recurrenceType").value;
    let recurrenceWeekdays = null;
    let recurrenceMonthDays = null;
    const recurrenceEndDate =
      document.getElementById("recurrenceEndDate").value || null;

    // Get selected friends for invites
    const friendCheckboxes = document.querySelectorAll(
      'input[name="invitedFriend"]:checked'
    );
    const invitedFriendIds = Array.from(friendCheckboxes).map((cb) =>
      parseInt(cb.value)
    );

    if (recurrenceType === "weekly") {
      const weekdayCheckboxes = document.querySelectorAll(
        'input[name="recurrenceWeekday"]:checked'
      );
      if (weekdayCheckboxes.length === 0) {
        alert(
          "Please select at least one day of the week for weekly recurrence"
        );
        return;
      }
      recurrenceWeekdays = Array.from(weekdayCheckboxes).map((cb) => cb.value);
    } else if (recurrenceType === "monthly") {
      const monthDaysInput = document
        .getElementById("recurrenceMonthDays")
        .value.trim();
      if (!monthDaysInput) {
        alert(
          "Please enter at least one day of the month for monthly recurrence"
        );
        return;
      }
      recurrenceMonthDays = monthDaysInput
        .split(",")
        .map((day) => day.trim())
        .filter((day) => {
          const dayNum = parseInt(day);
          return !isNaN(dayNum) && dayNum >= 1 && dayNum <= 31;
        });
      if (recurrenceMonthDays.length === 0) {
        alert("Please enter valid day numbers (1-31) for monthly recurrence");
        return;
      }
    }

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
      recurrenceType: recurrenceType,
      recurrenceWeekdays: recurrenceWeekdays,
      recurrenceMonthDays: recurrenceMonthDays,
      recurrenceEndDate: recurrenceEndDate,
      invitedFriendIds: invitedFriendIds.length > 0 ? invitedFriendIds : null,
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
            // If it's a recurring event, refetch all events to show all occurrences
            // Otherwise, just add the single event
            if (recurrenceType && recurrenceType !== "none") {
              window.calendar.refetchEvents();
            } else {
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
            }
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
