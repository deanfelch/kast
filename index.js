// index.js (with user registration/login)

// Load environment variables
require("dotenv").config();

// Core dependencies and middleware
const express = require("express");
const session = require("express-session");
const fileUpload = require("multer")();
const path = require("path");
const mysql = require("mysql2/promise");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const bcrypt = require("bcrypt");
const FormData = require("form-data");
const { WebSocketServer } = require("ws");

const app = express();
const port = process.env.PORT || 3000;

// MySQL database connection pool
const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

// Middleware setup
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "kast_secret",
    resave: false,
    saveUninitialized: false,
  })
);

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware to protect authenticated routes
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// Public home page
app.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect("/record");
  }
  res.redirect("/login-user");
});


// Recording page (requires login)
app.get("/record", requireAuth, (req, res) => {
  res.render("record", { user: req.session.user });
});

// ======================
// User Registration/Login
// ======================

// Registration form
app.get("/register", (req, res) => {
  res.render("register-user", { error: null });
});

// Handle registration
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.render("register", { error: "All fields are required." });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
      [username, email, hash]
    );
    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.render("register", { error: "Username or email already exists." });
  }
});

// Login form
app.get("/login-user", (req, res) => {
  res.render("login-user", { error: null });
});

// Handle login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render("login-user", { error: "Email and password required." });
  }
  try {
    const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.render("login-user", { error: "Invalid credentials." });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.render("login-user", { error: "Invalid credentials." });
    }
    req.session.user = { id: user.id, username: user.username };
    res.redirect("/record");
  } catch (err) {
    console.error(err);
    res.render("login-user", { error: "Something went wrong." });
  }
});

// Handle logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ======================
// Admin Dashboard
// ======================

// Admin login form
app.get("/admin/login", (req, res) => {
  res.render("admin-login", { error: null });
});

// Handle admin login (password only)
app.post("/admin/login", async (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.authenticated = true;
    return res.redirect("/admin/uploads");
  }
  res.render("admin-login", { error: "Incorrect password" });
});

// Admin view of all uploads
app.get("/admin/uploads", async (req, res) => {
  if (!req.session.authenticated) return res.redirect("/admin/login");
  try {
    const [rows] = await db.execute("SELECT * FROM uploads ORDER BY id DESC");
    res.render("uploads", { uploads: rows });
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).send("Database error");
  }
});

// ======================
// Audio Upload Endpoint
// ======================

app.post("/upload", fileUpload.single("audio"), async (req, res) => {
  try {
    if (!req.file || !req.session.user) return res.status(401).json({ error: "Unauthorized or no file" });

    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    // Upload to Pinata
    const pinataRes = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
      }
    );

    const cid = pinataRes.data.IpfsHash;
    await db.execute("INSERT INTO uploads (cid, user_id) VALUES (?, ?)", [cid, req.session.user.id]);
    res.json({ cid });
  } catch (err) {
    console.error("Upload error:", err.response?.data || err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// Get the latest CID for polling
app.get("/latest-cid", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT cid FROM uploads ORDER BY id DESC LIMIT 1");
    if (rows.length > 0) {
      res.json({ cid: rows[0].cid });
    } else {
      res.status(404).json({ error: "No uploads found" });
    }
  } catch (err) {
    console.error("Error fetching latest CID:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start Express server
const server = app.listen(port, () => {
  console.log(`🎙️ Kast server started on port ${port}`);
});

// ======================
// WebSocket for Live Audio
// ======================

const wss = new WebSocketServer({ server, path: "/ws-record" });

wss.on("connection", (ws, req) => {
  const tempId = crypto.randomUUID();
  const filePath = `uploads/${tempId}.webm`;
  const writeStream = fs.createWriteStream(filePath);

  // Write incoming audio chunks
  ws.on("message", (chunk) => {
    writeStream.write(chunk);
  });

  // Finalize and upload on close
  ws.on("close", async () => {
    writeStream.end();
    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(filePath));

      const pinataRes = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
      });

      const cid = pinataRes.data.IpfsHash;
      const userId = req.session?.user?.id || null;
      await db.execute("INSERT INTO uploads (cid, user_id) VALUES (?, ?)", [cid, userId]);
      console.log(`✅ Live recording uploaded: ${cid}`);
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error("❌ Live recording upload failed:", err.message || err);
    }
  });
});
