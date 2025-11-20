const MongotoStore = require("connect-mongo"); // import connect-mongo for session storage in MongoDB

// Environment variables
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

// Session expiry time (7 days)
const expirytime = 7 * 24 * 1000 * 60 * 60; // 7 days in milliseconds
const saltRounds = 12; // bcrypt salt rounds

// Session store using MongoDB (only for sessions, not user data)
var mongoStore = MongotoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

module.exports = {
  mongoStore,
  expirytime,
  saltRounds,
};
