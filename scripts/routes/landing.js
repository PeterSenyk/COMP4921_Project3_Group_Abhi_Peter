module.exports = (app) => {
  app.get("/", (req, res) => {
    res.render("landing", {
      message: "Welcome to the app",
      title: "Calendar App",
    });
  });
};
