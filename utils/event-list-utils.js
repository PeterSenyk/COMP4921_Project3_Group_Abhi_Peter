// Calculate and display duration for each event
function calculateEventDurations(events) {
  if (!events || events.length === 0) {
    return;
  }

  events.forEach(function (event) {
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    const duration = end - start;
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    const durationElement = document.getElementById(
      "duration-" + event.event_id
    );
    if (durationElement) {
      if (hours > 0) {
        durationElement.textContent = hours + "h " + minutes + "m";
      } else {
        durationElement.textContent = minutes + "m";
      }
    }
  });
}

// Initialize event durations when DOM is ready
function initEventDurations(events) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      calculateEventDurations(events);
    });
  } else {
    // DOM is already loaded
    calculateEventDurations(events);
  }
}

// Auto-initialize from data attribute when script loads
(function () {
  function autoInit() {
    const eventsList = document.querySelector(".events-list[data-events]");
    if (eventsList) {
      try {
        const eventsData = JSON.parse(eventsList.getAttribute("data-events"));
        if (eventsData && eventsData.length > 0) {
          initEventDurations(eventsData);
        }
      } catch (e) {
        console.error("Error parsing events data:", e);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})();

function editEvent(eventId) {
  // Redirect to calendar and trigger edit (you may need to implement this)
  window.location.href = "/calendar?edit=" + eventId;
}

async function deleteEvent(eventId) {
  if (!confirm("Are you sure you want to delete this event?")) {
    return;
  }

  try {
    const response = await fetch(`/api/events/${eventId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (response.ok) {
      // Remove the event card from the DOM
      const eventCard = document
        .querySelector(`[onclick*="deleteEvent(${eventId})"]`)
        .closest(".event-card");
      if (eventCard) {
        eventCard.style.opacity = "0";
        eventCard.style.transform = "translateX(-20px)";
        setTimeout(() => {
          eventCard.remove();
          // Reload if no events left
          const eventsList = document.querySelector(".events-list");
          if (eventsList && eventsList.children.length === 0) {
            window.location.reload();
          }
        }, 300);
      }
    } else {
      alert(data.error || "Failed to delete event");
    }
  } catch (error) {
    console.error("Error deleting event:", error);
    alert("An error occurred while deleting the event");
  }
}

// Make functions available globally for onclick handlers
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
