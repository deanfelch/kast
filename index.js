// index.js (Cleaned Version)
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const fileUpload = require("multer")();
const path = require("path");
const mysql = require("mysql2/promise");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const FormData = require("form-data");
const { WebSocketServer } = require("ws");

const app = express();
const port = process.env.PORT || 3000;

// DB setup
const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

// Middleware
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

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Routes
app.get("/", (req, res) => {
  res.render("public");
});

app.get("/record", (req, res) => {
  res.render("record");
});

app.get("/admin/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/admin/login", async (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.authenticated = true;
    return res.redirect("/admin/uploads");
  }
  res.render("login", { error: "Incorrect password" });
});

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

app.post("/upload", fileUpload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

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
    await db.execute("INSERT INTO uploads (cid) VALUES (?)", [cid]);
    res.json({ cid });
  } catch (err) {
    console.error("Upload error:", err.response?.data || err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// Server start (only once)
const server = app.listen(port, () => {
  console.log(`🎙️ Kast server started on port ${port}`);
});

// WebSocket Server for live recording
const wss = new WebSocketServer({ server, path: "/ws-record" });

wss.on("connection", (ws) => {
  const tempId = crypto.randomUUID();
  const filePath = `uploads/${tempId}.webm`;
  const writeStream = fs.createWriteStream(filePath);

  ws.on("message", (chunk) => {
    writeStream.write(chunk);
  });

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
      await db.execute("INSERT INTO uploads (cid) VALUES (?)", [cid]);
      console.log(`✅ Live recording uploaded: ${cid}`);
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error("❌ Live recording upload failed:", err.message || err);
    }
  });
});
