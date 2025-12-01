module.exports = (app) => {
  app.get("/", (req, res) => {
    res.render("landing", {
      message: "Welcome to the COMP4921 Project 3 Calendar App",
      title: "Calendar App",
    });
  });
};
