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



// routes
require("./scripts/routes/landing")(app);
require("./scripts/routes/signup")(app);
require("./scripts/routes/login")(app);
require("./scripts/routes/calendar-month")(app);
require("./scripts/routes/calendar-week")(app);
require("./scripts/routes/event-list")(app);





app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

