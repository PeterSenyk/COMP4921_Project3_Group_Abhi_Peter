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
  res.render("landing", {
    title: "Welcome",
    message: "Hello World!",
  });
});

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

    // create user
    await databaseService.createUser(username, email, hashedPassword);

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
    return res.redirect("/dashboard");
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

    res.redirect("/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", {
      title: "Login",
      error: "An error occurred. Please try again.",
    });
  }
});

app.get("/dashboard", isAuthenticated, (req, res) => {
  res.render("dashboard", {
    title: "Dashboard",
  });
});

app.get("/posts", async (req, res) => {
  const posts = (await databaseService.getPosts()) || null;
  console.log(posts);
  let categories = [];
  if (req.session.authenticated) {
    try {
      categories = await databaseService.getCategories();
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }
  res.render("posts", {
    title: "Posts",
    posts: posts,
    categories: categories,
  });
});

app.get("/posts/:post_id", async (req, res) => {
  try {
    const post_id = parseInt(req.params.post_id, 10);
    if (Number.isNaN(post_id)) {
      return res.redirect("/posts");
    }
    // Check if this is a poll - polls don't have threads, redirect to polls page
    const isPoll = await databaseService.isPoll(post_id);
    if (isPoll) {
      return res.redirect(`/polls/${post_id}`);
    }
    // Regular post - go directly to threads view
    const post = await databaseService.getPost(post_id);
    if (!post) {
      return res.redirect("/posts");
    }
    // Increment views
    await databaseService.incrementPostViews(post_id);
    // Refresh post to get updated views
    const updatedPost = await databaseService.getPost(post_id);
    const currentUserId = req.session.authenticated
      ? req.session.user.id
      : null;
    const threadsTree = await databaseService.getThreadsTree(
      post_id,
      currentUserId
    );
    const totalLikes = await databaseService.calculateTotalLikesForPost(
      post_id
    );
    return res.render("threads", {
      title: `Threads for Post #${post_id}`,
      post: updatedPost,
      threads: threadsTree,
      post_id: post_id,
      totalLikes: totalLikes,
    });
  } catch (err) {
    console.error("Error rendering threads:", err);
    return res.status(500).render("threads", {
      title: "Threads",
      post: null,
      threads: [],
    });
  }
});

// Create post POST route
app.post("/posts", isAuthenticated, async (req, res) => {
  try {
    const { title, comment, category_id, isPoll, pollOptions } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "Comment/content is required" });
    }

    if (!category_id) {
      return res.status(400).json({ error: "Category is required" });
    }

    const catId = parseInt(category_id, 10);
    if (Number.isNaN(catId)) {
      return res.status(400).json({ error: "Invalid category ID" });
    }

    const user = req.session.user;

    // Create the post
    const post = await databaseService.createPost(
      title.trim(),
      comment.trim(),
      catId,
      Number(user.id)
    );

    // If this is a poll, create poll with options
    if (isPoll === true || isPoll === "true") {
      if (
        !pollOptions ||
        !Array.isArray(pollOptions) ||
        pollOptions.length < 2
      ) {
        return res.status(400).json({
          error: "Poll must have at least 2 options",
        });
      }

      // Filter and validate options
      const validOptions = pollOptions
        .map((opt) =>
          typeof opt === "string" ? opt.trim() : String(opt).trim()
        )
        .filter((opt) => opt.length > 0);

      if (validOptions.length < 2) {
        return res.status(400).json({
          error: "Poll must have at least 2 valid options",
        });
      }

      await databaseService.createPoll(post.post_id, validOptions);
    }

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Error creating post:", error);
    return res.status(500).json({
      error: "Failed to create post",
      message: error.message,
    });
  }
});

app.get("/posts/:post_id/threads", async (req, res) => {
  try {
    const post_id = parseInt(req.params.post_id, 10);
    if (Number.isNaN(post_id)) {
      return res.redirect("/posts");
    }
    const post = await databaseService.getPost(post_id);
    if (!post) {
      return res.redirect("/posts");
    }
    // Increment views
    await databaseService.incrementPostViews(post_id);
    // Refresh post to get updated views
    const updatedPost = await databaseService.getPost(post_id);
    const currentUserId = req.session.authenticated
      ? req.session.user.id
      : null;
    const threadsTree = await databaseService.getThreadsTree(
      post_id,
      currentUserId
    );
    const totalLikes = await databaseService.calculateTotalLikesForPost(
      post_id
    );
    return res.render("threads", {
      title: `Threads for Post #${post_id}`,
      post: updatedPost,
      threads: threadsTree,
      post_id: post_id,
      totalLikes: totalLikes,
    });
  } catch (err) {
    console.error("Error rendering threads:", err);
    return res.status(500).render("threads", {
      title: "Threads",
      post: null,
      threads: [],
    });
  }
});

// Create thread POST route
app.post("/posts/:post_id/threads", isAuthenticated, async (req, res) => {
  try {
    const post_id = parseInt(req.params.post_id, 10);
    if (Number.isNaN(post_id)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    const { comment, parent_thread_id } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "Comment is required" });
    }

    const user = req.session.user;
    const parentThreadId = parent_thread_id
      ? parseInt(parent_thread_id, 10)
      : null;

    await databaseService.createThread(
      comment.trim(),
      post_id,
      Number(user.id),
      parentThreadId
    );

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Error creating thread:", error);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      error: "Failed to create thread",
      message: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});
// Polls routes
app.get("/polls", async (req, res) => {
  try {
    const polls = await databaseService.getPolls();
    // Enrich with post data for display
    const items = await Promise.all(
      polls.map(async (p) => ({
        poll: p,
        post: await databaseService.getPost(p.post_id).catch(() => null),
      }))
    );
    return res.render("polls", {
      title: "View Polls",
      polls: items,
    });
  } catch (err) {
    console.error("Error fetching polls:", err);
    return res.status(500).render("polls", { title: "Polls", polls: [] });
  }
});

app.get("/polls/:post_id", async (req, res) => {
  try {
    const post_id = parseInt(req.params.post_id, 10);
    if (Number.isNaN(post_id)) {
      return res.redirect("/polls");
    }
    const [poll, post] = await Promise.all([
      databaseService.getPoll(post_id),
      databaseService.getPost(post_id),
    ]);
    if (!poll || !post) {
      return res.redirect("/polls");
    }

    // Get user's vote if authenticated
    let userVote = null;
    if (req.session.authenticated) {
      userVote = await databaseService.getUserVote(
        poll.poll_id, // poll_id is the primary key
        req.session.user.id
      );
    }

    // Calculate total votes
    const totalVotes = poll.options.reduce(
      (sum, option) => sum + (option.votes || 0),
      0
    );

    return res.render("polls", {
      title: `Poll: ${post.title}`,
      poll: poll,
      post: post,
      userVote: userVote,
      totalVotes: totalVotes,
    });
  } catch (err) {
    console.error("Error fetching poll:", err);
    return res
      .status(500)
      .render("polls", { title: "Poll", poll: null, post: null });
  }
});

// Vote on poll route
app.post("/polls/:post_id/vote", isAuthenticated, async (req, res) => {
  try {
    const post_id = parseInt(req.params.post_id, 10);
    if (Number.isNaN(post_id)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    const { option_id } = req.body;
    if (!option_id) {
      return res.status(400).json({ error: "Option ID is required" });
    }

    const optionId = parseInt(option_id, 10);
    if (Number.isNaN(optionId)) {
      return res.status(400).json({ error: "Invalid option ID" });
    }

    // Get poll to validate
    const poll = await databaseService.getPoll(post_id);
    if (!poll) {
      return res.status(404).json({ error: "Poll not found" });
    }

    // Verify option belongs to this poll
    const option = poll.options.find((opt) => opt.option_id === optionId);
    if (!option) {
      return res.status(400).json({ error: "Invalid option for this poll" });
    }

    const user_id = req.session.user.id;

    // Submit vote
    const updatedPoll = await databaseService.submitVote(
      poll.poll_id,
      optionId,
      user_id
    );

    // Calculate total votes
    const totalVotes = updatedPoll.options.reduce(
      (sum, opt) => sum + (opt.votes || 0),
      0
    );

    return res.json({
      success: true,
      poll: updatedPoll,
      totalVotes: totalVotes,
    });
  } catch (error) {
    console.error("Error submitting vote:", error);
    return res.status(500).json({ error: "Failed to submit vote" });
  }
});

// Categories routes
app.get("/categories", async (req, res) => {
  try {
    const categories = await databaseService.getCategories();
    res.render("categories", {
      title: "Categories",
      categories: categories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).render("categories", {
      title: "Categories",
      categories: [],
    });
  }
});

app.post("/categories", isAuthenticated, async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const user = req.session.user;
    await databaseService.createCategory(title.trim(), Number(user.id));
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Error creating category:", error);
    return res.status(500).json({ error: "Failed to create category" });
  }
});

app.get("/categories/:cat_id", async (req, res) => {
  try {
    const cat_id = parseInt(req.params.cat_id, 10);
    if (Number.isNaN(cat_id)) {
      return res.redirect("/categories");
    }
    const posts = await databaseService.getPostsByCategory(cat_id);
    let categories = [];
    if (req.session.authenticated) {
      try {
        categories = await databaseService.getCategories();
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    }
    res.render("posts", {
      title: "Posts",
      posts: posts,
      categories: categories,
    });
  } catch (error) {
    console.error("Error fetching posts by category:", error);
    res.status(500).render("posts", {
      title: "Posts",
      posts: [],
      categories: [],
    });
  }
});

// My Content - list user's categories, posts, and threads
app.get("/my-content", isAuthenticated, async (req, res) => {
  try {
    const userId = Number(req.session.user.id);
    console.log("[my-content] userId:", userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      console.error(
        "[my-content] Invalid userId in session:",
        req.session.user
      );
      return res.status(400).render("my-content", {
        title: "My Content",
        categories: [],
        posts: [],
        threads: [],
      });
    }
    let categories = [];
    let posts = [];
    let threads = [];
    try {
      categories = await databaseService.getUserCategories(userId);
    } catch (e) {
      console.error(
        "[my-content] getUserCategories failed:",
        e && e.stack ? e.stack : e
      );
    }
    try {
      posts = await databaseService.getUserPosts(userId);
    } catch (e) {
      console.error(
        "[my-content] getUserPosts failed:",
        e && e.stack ? e.stack : e
      );
    }
    try {
      threads = await databaseService.getUserThreads(userId);
    } catch (e) {
      console.error(
        "[my-content] getUserThreads failed:",
        e && e.stack ? e.stack : e
      );
    }
    console.log("[my-content] counts:", {
      categories: categories.length,
      posts: posts.length,
      threads: threads.length,
    });
    res.render("my-content", {
      title: "My Content",
      categories,
      posts,
      threads,
    });
  } catch (error) {
    console.error(
      "Error loading my content:",
      error && error.stack ? error.stack : error
    );
    res.status(500).render("my-content", {
      title: "My Content",
      categories: [],
      posts: [],
      threads: [],
    });
  }
});

// Delete routes with ownership verification handled in service
app.delete("/categories/:cat_id", isAuthenticated, async (req, res) => {
  try {
    const catId = parseInt(req.params.cat_id, 10);
    if (Number.isNaN(catId))
      return res.status(400).json({ error: "Invalid id" });
    const success = await databaseService.deleteCategory(
      catId,
      req.session.user.id
    );
    if (!success) return res.status(403).json({ error: "Not allowed" });
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

app.delete("/posts/:post_id", isAuthenticated, async (req, res) => {
  try {
    const postId = parseInt(req.params.post_id, 10);
    if (Number.isNaN(postId))
      return res.status(400).json({ error: "Invalid id" });
    const success = await databaseService.deletePost(
      postId,
      req.session.user.id
    );
    if (!success) return res.status(403).json({ error: "Not allowed" });
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete post" });
  }
});

// Profile image upload route
const upload = multer({ storage: multer.memoryStorage() });
app.post(
  "/profile/upload-image",
  isAuthenticated,
  upload.single("profileImage"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const userId = req.session.user.id;
      const imageUrl = await cloudinaryService.uploadProfileImage(
        req.file.buffer,
        userId
      );

      await databaseService.updateUserProfileImage(userId, imageUrl);

      // Update session with new profile image
      req.session.user.profile_image_url = imageUrl;

      return res.json({ success: true, imageUrl });
    } catch (error) {
      console.error("Error uploading profile image:", error);
      return res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

// Like/Unlike thread route
app.post("/threads/:thread_id/like", isAuthenticated, async (req, res) => {
  try {
    const thread_id = parseInt(req.params.thread_id, 10);
    if (Number.isNaN(thread_id)) {
      return res.status(400).json({ error: "Invalid thread ID" });
    }

    const user_id = req.session.user.id;

    // Check if already liked
    const existingLike = await databaseService.getUserThreadLike(
      thread_id,
      user_id
    );
    const wasLiked = !!existingLike;

    const updatedThread = await databaseService.toggleThreadLike(
      thread_id,
      user_id
    );

    return res.json({
      success: true,
      likes: updatedThread.likes,
      isLiked: !wasLiked, // Flipped because we just toggled it
    });
  } catch (error) {
    console.error("Error toggling like:", error);
    return res.status(500).json({ error: "Failed to toggle like" });
  }
});

// Edit thread route
app.put("/threads/:thread_id", isAuthenticated, async (req, res) => {
  try {
    const thread_id = parseInt(req.params.thread_id, 10);
    if (Number.isNaN(thread_id)) {
      return res.status(400).json({ error: "Invalid thread ID" });
    }

    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "Comment is required" });
    }

    const user_id = req.session.user.id;

    try {
      await databaseService.updateThread(thread_id, comment.trim(), user_id);
      return res.json({ success: true });
    } catch (error) {
      if (error.message.includes("Unauthorized")) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
  } catch (error) {
    console.error("Error updating thread:", error);
    return res.status(500).json({ error: "Failed to update thread" });
  }
});

// Update delete thread route to support thread owner deleting any comment
app.delete("/threads/:thread_id", isAuthenticated, async (req, res) => {
  try {
    const threadId = parseInt(req.params.thread_id, 10);
    if (Number.isNaN(threadId))
      return res.status(400).json({ error: "Invalid id" });
    const success = await databaseService.deleteThreadWithAuth(
      threadId,
      req.session.user.id
    );
    if (!success) return res.status(403).json({ error: "Not allowed" });
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete thread" });
  }
});

// Stats page route
app.get("/stats", async (req, res) => {
  try {
    const popularThreads = await databaseService.getMostPopularThreads(20);
    return res.render("stats", {
      title: "Statistics",
      popularThreads: popularThreads,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return res.status(500).render("stats", {
      title: "Statistics",
      popularThreads: [],
    });
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/*", (req, res) => {
  res.status(404).render("404", {
    title: "404 Not Found",
  });
});

// start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
