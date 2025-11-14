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
const cloudinaryService = require("./services/cloudinary-service");

const port = process.env.PORT || 3000;

const { mongoStore, expirytime, saltRounds } = require("./services/mongo");

// middleware
const app = express();
const node_session_secret = process.env.NODE_SESSION_SECRET;
app.use(
  session({
    secret: node_session_secret,
    saveUninitialized: false,
    resave: true,
    store: mongoStore,
    cookie: {
      maxAge: expirytime,
    },
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use("/", (req, res, next) => {
  app.locals.isAuthenticated = req.session.authenticated;
  app.locals.currentUser = req.session.user;
  app.locals.currentURL = req.url;
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect("/login");
  }
}

// routes 

app.get("/", (req, res) => {
  res.render("landing", { message: "Welcome to the app",
    title: "Calendar App",
   });
});

// app.js or routes file
app.get('/calendar-month', (req, res) => {
  // Optional: ?year=2025&month=11 (1–12)
  const today = new Date();
  const year = parseInt(req.query.year) || today.getFullYear();
  const month = (parseInt(req.query.month) || (today.getMonth() + 1)) - 1; // 0–11

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
      isCurrentMonth: true
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

  res.render('calendar-month', {
    year,
    month: month + 1, // for display
    weeks,
    title: "Calendar",
    message: "Welcome to the calendar",
  });
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});