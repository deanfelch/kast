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
            background-color: #f8f9fa;
          }
          .login-box {
            width: 100%;
            max-width: 400px;
            padding: 2rem;
            border: 1px solid #ddd;
            border-radius: 8px;
            background-color: white;
            box-shadow: 0 0 12px rgba(0,0,0,0.05);
          }
        </style>
      </head>
      <body>
        <div class="login-box">
          <h2 class="mb-4 text-center">🔐 Kast Admin Login</h2>
          <form method="POST" action="/admin/login">
            <div class="mb-3">
              <label for="username" class="form-label">Username</label>
              <input type="text" class="form-control" id="username" name="username" required>
            </div>
            <div class="mb-3">
              <label for="password" class="form-label">Password</label>
              <input type="password" class="form-control" id="password" name="password" required>
            </div>
            <button type="submit" class="btn btn-primary w-100">Login</button>
          </form>
        </div>
      </body>
    </html>
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
<!DOCTYPE html>
<html>
  <head>
    <title>Kast Admin</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
      body { padding: 2rem; }
      code { font-size: 0.9rem; word-break: break-all; }
      audio { width: 180px; }
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
      <td>
        <audio controls src="https://gateway.pinata.cloud/ipfs/${row.cid}"></audio>
      </td>
    </tr>
  `;
}

html += `
        </tbody>
      </table>
      <a href="/admin/logout" class="btn btn-outline-secondary">Logout</a>
    </div>
  </body>
</html>
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
