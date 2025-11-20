const names = require("../../api/names.json");
const databaseService = require("../../services/database-service");
const { getUserFromSession, isAuthenticated } = require("../../utils/auth");


module.exports = (app) => {
  app.get("/event-list", isAuthenticated, async (req, res) => {
    const user = getUserFromSession(req);
    console.log(user);
    const events = await databaseService.findEventsByUserId(user.user_id) || [];
    console.log(events);
    res.render("event-list", { events, title: "Event List" });
  });

  
};

