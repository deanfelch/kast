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

app.use("/admin", (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(403).send("Access denied");
  }
  next();
});

app.get("/admin/uploads", async (req, res) => {
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
