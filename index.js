const {
  express,
  session,
  MongotoStore,
  bcrypt,
  ejs,
  url,
  multer,
  path,
  joi,
  databaseService,
} = require("./scripts/requirements");
require("dotenv").config();
// Initialize the app
const app = express();
const cloudinaryService = require("./services/cloudinary-service");
const port = process.env.PORT || 3000;
const { mongoStore, expirytime, saltRounds } = require("./services/mongo.js");

// Configure view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.NODE_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: mongoStore,
    cookie: { maxAge: expirytime },
  })
);

// Middleware to check if user is authenticated
app.use("/", (req, res, next) => {
  app.locals.isAuthenticated = req.session.authenticated;
  app.locals.currentUser = req.session.user;
  app.locals.currentURL = req.url;
  next();
});

const { getAuthUrl, getTokens, setCredentials } = require("./services/OAuth");
const calendarAPI = require("./services/calendar_api");

// Google Calendar OAuth
app.get("/auth/google", (req, res) => {
  const authUrl = getAuthUrl();
  res.redirect(authUrl);
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.redirect("/?error=no_code");
    }

    const tokens = await getTokens(code);

    // Store tokens in session
    req.session.googleTokens = tokens;
    req.session.authenticated = true;

    res.redirect("/calendar");
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.redirect("/?error=auth_failed");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    res.redirect("/");
  });
});

// Routes
// Landing page
app.get("/", (req, res) => {
  res.render("landing", {
    message: "Welcome to the app",
    title: "Calendar App",
  });
});

// Calendar page
app.get("/calendar", async (req, res) => {
  try {
    // Check if user has Google tokens
    if (!req.session.googleTokens) {
      return res.redirect("/auth/google");
    }

    // Get events from Google Calendar
    const events = await calendarAPI.listEvents(
      "primary",
      {
        maxResults: 10,
      },
      req.session.googleTokens
    );

    res.render("calendar", {
      message: "Welcome to the app",
      title: "Calendar App",
      events: events,
    });
  } catch (error) {
    console.error("Error loading calendar:", error);
    res.render("calendar", {
      message: "Error loading calendar",
      title: "Calendar App",
      events: [],
      error: error.message,
    });
  }
});

// API Routes for Calendar Operations

// Get all events
app.get("/api/events", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { timeMin, timeMax, maxResults } = req.query;
    const events = await calendarAPI.listEvents(
      "primary",
      {
        timeMin,
        timeMax,
        maxResults: maxResults ? parseInt(maxResults) : 10,
      },
      req.session.googleTokens
    );

    res.json({ events });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific event
app.get("/api/events/:eventId", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const event = await calendarAPI.getEvent(
      req.params.eventId,
      "primary",
      req.session.googleTokens
    );
    res.json({ event });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new event
app.post("/api/events", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { summary, description, start, end, timeZone, location, attendees } =
      req.body;

    if (!summary || !start || !end) {
      return res
        .status(400)
        .json({ error: "Missing required fields: summary, start, end" });
    }

    const event = await calendarAPI.createEvent(
      {
        summary,
        description,
        start,
        end,
        timeZone: timeZone || "UTC",
        location,
        attendees,
      },
      "primary",
      req.session.googleTokens
    );

    res.status(201).json({ event });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update an event
app.put("/api/events/:eventId", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { summary, description, start, end, timeZone, location, attendees } =
      req.body;

    const event = await calendarAPI.updateEvent(
      req.params.eventId,
      {
        summary,
        description,
        start,
        end,
        timeZone,
        location,
        attendees,
      },
      "primary",
      req.session.googleTokens
    );

    res.json({ event });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete an event
app.delete("/api/events/:eventId", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    await calendarAPI.deleteEvent(
      req.params.eventId,
      "primary",
      req.session.googleTokens
    );
    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ error: error.message });
  }
});

// API Routes for Calendar Management

// Get all calendars
app.get("/api/calendars", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const calendars = await calendarAPI.listCalendars(req.session.googleTokens);
    res.json({ calendars });
  } catch (error) {
    console.error("Error fetching calendars:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific calendar
app.get("/api/calendars/:calendarId", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const calendar = await calendarAPI.getCalendar(
      req.params.calendarId,
      req.session.googleTokens
    );
    res.json({ calendar });
  } catch (error) {
    console.error("Error fetching calendar:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new calendar
app.post("/api/calendars", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { summary, description, timeZone, location } = req.body;

    if (!summary) {
      return res.status(400).json({ error: "Missing required field: summary" });
    }

    const calendar = await calendarAPI.createCalendar(
      {
        summary,
        description,
        timeZone: timeZone || "UTC",
        location,
      },
      req.session.googleTokens
    );

    res.status(201).json({ calendar });
  } catch (error) {
    console.error("Error creating calendar:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update a calendar
app.put("/api/calendars/:calendarId", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { summary, description, timeZone, location } = req.body;

    const calendar = await calendarAPI.updateCalendar(
      req.params.calendarId,
      {
        summary,
        description,
        timeZone,
        location,
      },
      req.session.googleTokens
    );

    res.json({ calendar });
  } catch (error) {
    console.error("Error updating calendar:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a calendar
app.delete("/api/calendars/:calendarId", async (req, res) => {
  try {
    if (!req.session.googleTokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    await calendarAPI.deleteCalendar(
      req.params.calendarId,
      req.session.googleTokens
    );
    res.json({ message: "Calendar deleted successfully" });
  } catch (error) {
    console.error("Error deleting calendar:", error);
    res.status(500).json({ error: error.message });
  }
});

// Login page
app.get("/login", (req, res) => {
  res.render("login", { message: "Welcome to the app" });
});

// Signup page
app.get("/signup", (req, res) => {
  res.render("signup", { message: "Welcome to the app" });
});

// Start the server
app.listen(process.env.PORT, () => {
  console.log("Server is running on port 3000");
});
