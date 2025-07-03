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
  const error = req.query.error === "1";
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Kast Admin Login</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          body {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background-color: #121212;
            color: #f1f1f1;
          }
          .login-box {
            width: 100%;
            max-width: 400px;
            padding: 2rem;
            border-radius: 8px;
            background-color: #1e1e1e;
            box-shadow: 0 0 24px rgba(0,0,0,0.4);
          }
          label, .form-text {
            color: #ccc;
          }
          .form-control {
            background-color: #2a2a2a;
            color: #f1f1f1;
            border: 1px solid #444;
          }
        </style>
      </head>
      <body>
        <div class="login-box">
          <h2 class="mb-4 text-center">🔐 Kast Admin Login</h2>
          ${error ? `<div class="alert alert-danger" role="alert">Invalid credentials. Please try again.</div>` : ""}
          <form method="POST" action="/admin/login">
            <div class="mb-3">
              <label for="username" class="form-label">Username</label>
              <input type="text" class="form-control" id="username" name="username" required>
            </div>
            <div class="mb-3">
              <label for="password" class="form-label">Password</label>
              <input type="password" class="form-control" id="password" name="password" required>
            </div>
            <div class="form-check mb-3">
              <input class="form-check-input" type="checkbox" name="remember" id="remember">
              <label class="form-check-label" for="remember">Remember me</label>
            </div>
            <button type="submit" class="btn btn-primary w-100">Login</button>
          </form>
        </div>
      </body>
    </html>
  `);
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

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Kast Admin</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        body {
          background-color: #121212;
          color: #f1f1f1;
          padding: 2rem;
        }
        .table {
          color: #fff;
        }
        .table th, .table td {
          border-color: #444;
        }
        .table-light {
          background-color: #2a2a2a;
          color: #ccc;
        }
        code {
          font-size: 0.85rem;
          word-break: break-word;
        }
        a.btn {
          margin-top: 1rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1 class="mb-4">🎙️ Kast Admin - Uploads</h1>
        <table class="table table-bordered table-striped">
          <thead class="table-light">
            <tr>
              <th>CID</th>
              <th>Filename</th>
              <th>Uploaded At</th>
              <th>Play</th>
            </tr>
          </thead>
          <tbody>
  `;

  for (const row of rows) {
    html += `
      <tr>
        <td><code>${row.cid}</code></td>
        <td>${row.filename}</td>
        <td>${new Date(row.uploaded_at).toLocaleString()}</td>
        <td><audio controls src="https://gateway.pinata.cloud/ipfs/${row.cid}"></audio></td>
      </tr>
    `;
  }

  html += `
          </tbody>
        </table>
        <a href="/admin/logout" class="btn btn-outline-light">Logout</a>
      </div>
    </body>
    </html>
  `;

  res.send(html);
});

// File upload endpoint
app.post("/upload", upload.single("audio"), async (req, res) => {
  const filePath = path.join(__dirname, req.file.path);
  const { originalname } = req.file;

  try {
    const result = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        file: req.file,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
      });

    const cid = result.data.IpfsHash;
    await db.execute(
      "INSERT INTO uploads (cid, filename) VALUES (?, ?)",
      [cid, originalname]
    );

    res.json({ cid });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("Upload failed.");
  }
});

app.listen(port, () => {
  console.log(`🎙️ Kast server started on port ${port}`);
});
