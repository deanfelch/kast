const bcrypt = require("bcrypt");
const db = require("../models/db");

exports.showLogin = (req, res) => {
  res.render("frontend/login", { error: null });
};

exports.showRegister = (req, res) => {
  res.render("frontend/register", { error: null });
};

exports.register = async (req, res) => {
  const { username, email, password } = req.body;
  const [existing] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
  if (existing.length > 0) {
    return res.render("frontend/register", { error: "Email already registered" });
  }
  const hash = await bcrypt.hash(password, 10);
  await db.execute("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [username, email, hash]);
  res.redirect("/login");
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const [users] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
  if (users.length === 0 || !(await bcrypt.compare(password, users[0].password))) {
    return res.render("frontend/login", { error: "Invalid credentials" });
  }
  req.session.user = { id: users[0].id, username: users[0].username };
  res.redirect("/record");
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
};
