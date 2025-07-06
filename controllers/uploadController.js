const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const db = require("../models/db");

exports.uploadFile = async (req, res) => {
  if (!req.session.user) return res.status(401).send("Unauthorized");

  const file = req.file;
  if (!file) return res.status(400).send("No file uploaded");

  const tempPath = path.join(__dirname, "..", "temp", file.originalname);
  fs.writeFileSync(tempPath, file.buffer);

  const form = new FormData();
  form.append("file", fs.createReadStream(tempPath));

  try {
    const response = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
      maxBodyLength: "Infinity",
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
        ...form.getHeaders()
      }
    });

    const cid = response.data.IpfsHash;
    await db.execute("INSERT INTO uploads (cid, filename, user_id) VALUES (?, ?, ?)", [
      cid,
      file.originalname,
      req.session.user.id
    ]);

    res.status(200).json({ cid });
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).send("Upload failed");
  } finally {
    fs.unlinkSync(tempPath);
  }
};
