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

app.get("/", (req, res) => res.send("🎙️ Kast backend is running"));
app.listen(3000, () => console.log("🎙️ Kast server started on port 3000"));
