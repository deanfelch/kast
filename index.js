require("dotenv").config();

const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
});

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");
const app = express();

app.use(cors({
  origin: "*",  // or "*" for development
}));

const upload = multer();

const session = require("express-session");

app.use(session({
  secret: process.env.SESSION_SECRET || "kast-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));

app.get("/admin/login", (req, res) => {
  res.send(`
    <h1>Login</h1>
    <form method="POST" action="/admin/login">
      <input type="text" name="username" placeholder="Username"/><br/>
      <input type="password" name="password" placeholder="Password"/><br/>
      <button type="submit">Login</button>
    </form>
  `);
});

app.post("/admin/login", express.urlencoded({ extended: true }), (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.loggedIn = true;
    return res.redirect("/admin/uploads");
  }
  res.send("Invalid credentials. <a href='/admin/login'>Try again</a>");
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

app.post("/upload", upload.single("file"), async (req, res) => {
  const data = new FormData();
  data.append("file", req.file.buffer, {
    filename: req.file.originalname,
  });

  try {
    const pinataRes = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      data,
      {
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
          ...data.getHeaders(),
        },
      }
    );
    res.json(pinataRes.data);
    await db.execute(
      "INSERT INTO uploads (cid, filename) VALUES (?, ?)",
      [pinataRes.data.IpfsHash, req.file.originalname]
    );
  } catch (err) {
    res.status(500).json({ error: "Pinning failed", details: err.message });
  }
});


app.get("/admin/uploads", async (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/admin/login");
  }
  
  try {
    const [rows] = await db.execute(
      "SELECT cid, filename, uploaded_at FROM uploads ORDER BY uploaded_at DESC LIMIT 100"
    );

    // Simple HTML for now
    let html = `
      <html><head><title>Kast Admin</title></head><body>
      <h1>Uploaded Files</h1>
      <table border="1" cellpadding="5">
        <tr><th>CID</th><th>Filename</th><th>Uploaded At</th><th>Play</th></tr>
    `;

    for (const row of rows) {
      html += `<tr>
        <td><code>${row.cid}</code></td>
        <td>${row.filename}</td>
        <td>${new Date(row.uploaded_at).toLocaleString()}</td>
        <td><audio controls src="https://gateway.pinata.cloud/ipfs/${row.cid}"></audio></td>
      </tr>`;
    }

    html += `</table></body></html>`;
    res.send(html);

  } catch (err) {
    console.error("Error loading uploads:", err);
    res.status(500).send("Error loading uploads");
  }
});

app.get("/", (req, res) => res.send("🎙️ Kast backend is running"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🎙️ Kast server started on port ${PORT}`));
