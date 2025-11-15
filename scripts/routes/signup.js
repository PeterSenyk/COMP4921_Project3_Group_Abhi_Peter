const { bcrypt, joi, databaseService } = require("../requirements");
const { saltRounds } = require("../../services/mongo");

module.exports = (app) => {
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
    }

    try {
      // check if username already exists
      const existingUser = await databaseService.checkUserExists(
        username,
        email
      );
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
};
