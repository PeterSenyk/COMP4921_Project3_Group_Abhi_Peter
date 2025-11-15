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
    store: mongoStore || undefined, // Use memory store if MongoDB not available
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
  res.render("landing", {
    message: "Welcome to the app",
    title: "Calendar App",
  });
});

// Signup page and login page
// Signup GET route - show signup form
app.get("/signup", (req, res) => {
  res.render("signup", {
    title: "Sign Up",
    error: null,
    success: null,
  });
});

// Signup POST route - handle signup
app.post("/signup", async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  if (!username || !email || !password || !confirmPassword) {
    return res.render("signup", {
      title: "Sign Up",
      error: "All fields are required",
    });
  }

  if (password.trim() !== confirmPassword.trim()) {
    return res.render("signup", {
      title: "Sign Up",
      error: "Passwords do not match",
      username,
      email,
    });
  }

  const loginSchema = joi.object({
    username: joi.string().alphanum().min(3).max(30).required(),
    password: joi
      .string()
      .min(10) // minimum length of 10 characters
      .pattern(/[A-Z]/, "uppercase") // at least one uppercase letter
      .pattern(/[a-z]/, "lowercase") // at least one lowercase letter
      .pattern(/\d/, "digit") // at least one digit
      .pattern(/[\W_]/, "special character") // at least one special character
      .required(), // password is requiredjoi.string().alphanum().min(10).max(30).required()
    email: joi.string().email().required(),
    confirmPassword: joi.string().required(),
  });

  const validation = loginSchema.validate({
    username,
    password,
    email,
    confirmPassword,
  });
  if (validation.error) {
    return res.render("signup", {
      title: "Sign Up",
      error: validation.error.details[0].message,
    });
    return;
  }

  try {
    // check if username already exists
    const existingUser = await databaseService.checkUserExists(username, email);
    if (existingUser) {
      return res.render("signup", {
        title: "Sign Up",
        error: "Username or email already exists",
      });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = {
      username,
      email,
      password_hash: hashedPassword,
    };

    // create user
    await databaseService.createUser(user);

    // redirect to login
    return res.render("login", {
      title: "Login",
      success: "Account created successfully",
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.render("signup", {
      title: "Sign Up",
      error: "An error occurred. Please try again.",
    });
  }
});

app.get("/login", (req, res) => {
  if (req.session.authenticated) {
    console.log("Already authenticated, redirecting to dashboard");
    return res.redirect("/calendar-month");
  }
  res.render("login", {
    title: "Login",
    error: null,
  });
});

// Login POST route - handle login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render("login", {
      title: "Login",
      error: "Username and password are required",
    });
  }

  try {
    const user = await databaseService.findUser(username.trim());
    // console.log(user);
    if (!user) {
      return res.render("login", {
        title: "Login",
        error: "Invalid username or password",
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.render("login", {
        title: "Login",
        error: "Invalid username or password",
      });
    }

    // Set session
    req.session.authenticated = true;
    req.session.user = {
      id: user.user_id,
      username: user.username,
      email: user.email,
      profile_image_url: user.profile_image_url || null,
    };

    res.redirect("/calendar-month");
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", {
      title: "Login",
      error: "An error occurred. Please try again.",
    });
  }
});

// app.js or routes file
app.get("/calendar-month", (req, res) => {
  // Optional: ?year=2025&month=11 (1–12)
  const today = new Date();
  const year = parseInt(req.query.year) || today.getFullYear();
  const month = (parseInt(req.query.month) || today.getMonth() + 1) - 1; // 0–11

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
      isCurrentMonth: true,
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

  res.render("calendar-month", {
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
