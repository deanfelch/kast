const db = require("../models/db");

exports.showLogin = (req, res) => {
  res.render("admin/login", { error: null });
};

exports.login = (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.admin = true;
    res.redirect("/admin/uploads");
  } else {
    res.render("admin/login", { error: "Invalid credentials" });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect("/admin"));
};

exports.uploads = async (req, res) => {
  if (!req.session.admin) return res.redirect("/admin");
  try {
    const [rows] = await db.execute(
      `SELECT uploads.*, users.username FROM uploads
       LEFT JOIN users ON uploads.user_id = users.id
       ORDER BY uploaded_at DESC`
    );
    res.render("admin/uploads", { uploads: rows });
  } catch (err) {
    res.status(500).send("Database error");
  }
};
