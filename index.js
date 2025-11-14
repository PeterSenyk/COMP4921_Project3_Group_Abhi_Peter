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


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});