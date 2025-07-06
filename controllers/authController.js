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
  await db.execute(
    "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
    [username, email, hash]
  );
  res.redirect("/login");
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
    const user = rows[0];

    if (!user || !user.password) {
      return res.render("frontend/login", { error: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render("frontend/login", { error: "Invalid email or password." });
    }

    req.session.user = { id: user.id, username: user.username };
    return res.redirect("/record"); // Eventually reroute to dashboard

  } catch (err) {
    console.error("❌ Login error:", err);
    return res.render("frontend/login", { error: "An unexpected error occurred." });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
};
