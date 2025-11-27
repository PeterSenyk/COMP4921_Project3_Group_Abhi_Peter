module.exports = (app) => {
  app.get("/fullcallendartest", (req, res) => {
    res.render("fullcallendartest", {
      title: "FullCalendar End to End Test",
      message: "Welcome to the FullCalendar End to End Test",
    });
  });
};
