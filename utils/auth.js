function getUserFromSession(req) {
  // Store and get auth info (userId) from the session
  if (req.session && req.session.user) {
    return req.session.user;
  }
  return null;
}

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect("/login");
  }
}


module.exports = {
  getUserFromSession,
  isAuthenticated
};
