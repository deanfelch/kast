// middleware/session.js
const session = require("express-session");

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "secretkey",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set to true in production with HTTPS
    maxAge: 1000 * 60 * 60 // 1 hour
  }
});

module.exports = sessionMiddleware;