const { isAuthenticated, getUserFromSession } = require("../../utils/auth");


module.exports = (app) => {
  app.get("/profile", isAuthenticated, async (req, res) => {

    const user = getUserFromSession(req);
    if (!user) {
      return res.redirect("/login");
    }

    // console.log(user);



    res.render("profile", {
      title: "Profile",
      message: "Profile View",
      user: user,
    });
  });
};