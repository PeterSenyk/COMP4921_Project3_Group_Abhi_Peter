const { bcrypt, databaseService } = require("../requirements");

module.exports = (app) => {
  // Login GET route - show login form
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

      const isValidPassword = await bcrypt.compare(
        password,
        user.password_hash
      );

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
};
