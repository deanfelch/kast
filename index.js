
require("dotenv").config();
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

// MySQL connection
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

// Views setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware for auth
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ROUTES
app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/record");
  res.redirect("/login");
});

// ==== USER VIEWS ====

app.get("/register", (req, res) => {
  res.render("frontend/register", { error: null });
});

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.render("frontend/register", { error: "All fields are required." });

  try {
    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
      [username, email, hash]
    );
    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.render("frontend/register", { error: "Username or email already exists." });
  }
});

app.get("/login", (req, res) => {
  res.render("frontend/login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.render("frontend/login", { error: "Email and password required." });

  try {
    const [rows] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
    if (!rows.length)
      return res.render("frontend/login", { error: "Invalid credentials." });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.render("frontend/login", { error: "Invalid credentials." });

    req.session.user = { id: user.id, username: user.username };
    res.redirect("/record");
  } catch (err) {
    console.error(err);
    res.render("frontend/login", { error: "Something went wrong." });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/record", requireAuth, (req, res) => {
  res.render("frontend/record", { user: req.session.user });
});

// ==== ADMIN VIEWS ====

app.get("/admin/login", (req, res) => {
  res.render("admin/login", { error: null });
});

app.post("/admin/login", (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect("/admin/uploads");
  }
  res.render("admin/login", { error: "Incorrect password" });
});

app.get("/admin/uploads", async (req, res) => {
  if (!req.session.isAdmin) return res.redirect("/admin/login");
  try {
    const [uploads] = await db.execute("SELECT * FROM uploads ORDER BY id DESC");
    res.render("admin/uploads", { uploads });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

// ==== AUDIO UPLOAD ====

app.post("/upload", fileUpload.single("audio"), async (req, res) => {
  try {
    if (!req.file || !req.session.user) {
      return res.status(401).json({ error: "Unauthorized or no file" });
    }

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
    await db.execute("INSERT INTO uploads (cid, user_id) VALUES (?, ?)", [
      cid,
      req.session.user.id,
    ]);
    res.json({ cid });
  } catch (err) {
    console.error("Upload error:", err.response?.data || err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

app.get("/latest-cid", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT cid FROM uploads ORDER BY id DESC LIMIT 1");
    if (rows.length) res.json({ cid: rows[0].cid });
    else res.status(404).json({ error: "No uploads found" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
const server = app.listen(port, () =>
  console.log(`🎙️ Kast server started on port ${port}`)
);

// ==== WebSocket Live Audio ====

const wss = new WebSocketServer({ server, path: "/ws-record" });

wss.on("connection", (ws, req) => {
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

      const pinataRes = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        form,
        {
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${process.env.PINATA_JWT}`,
          },
        }
      );

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
