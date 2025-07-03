// index.js (cleaned up Kast server)

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const mysql = require("mysql2/promise");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const upload = multer({ dest: "uploads/" });

app.use(cors({ origin: "https://kasting.space" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "kast-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 }, // 1 hour
  })
);

// Rate limiter for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts. Try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/admin/login", (req, res) => {
  res.render("login", { error: req.query.error === "1" });
});

app.post("/admin/login", loginLimiter, async (req, res) => {
  const { username, password, remember } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const success = username === process.env.ADMIN_USER && password === process.env.ADMIN_PASSWORD;

  await db.execute(
    "INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, ?)",
    [username, ip, success]
  );

  if (success) {
    req.session.loggedIn = true;
    req.session.cookie.maxAge = remember ? 1000 * 60 * 60 * 24 * 30 : null;
    return res.redirect("/admin/uploads");
  }

  res.redirect("/admin/login?error=1");
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

app.get("/admin/uploads", async (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin/login");

  const [rows] = await db.execute(
    "SELECT cid, filename, uploaded_at FROM uploads ORDER BY uploaded_at DESC LIMIT 100"
  );

  res.render("uploads", { uploads: rows });
});

app.get("/", (req, res) => {
  res.render("public");
});

// File upload endpoint
app.post("/upload", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const audioBuffer = req.file.buffer;

    // upload to pinata
    const pinataRes = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", audioBuffer, {
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
    });

    const cid = pinataRes.data.IpfsHash;

    // Save to MySQL
    await db.execute("INSERT INTO uploads (cid) VALUES (?)", [cid]);

    res.json({ cid });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});


app.listen(port, () => {
  console.log(`🎙️ Kast server started on port ${port}`);
});
