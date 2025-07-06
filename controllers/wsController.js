const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const FormData = require("form-data");
const db = require("../models/db");

exports.handleWebSocket = (wss) => {
  wss.on("connection", (ws, req) => {
    const id = uuidv4();
    const tempDir = path.join(__dirname, "..", "temp");
    const filePath = path.join(tempDir, `${id}.webm`);
    const writeStream = fs.createWriteStream(filePath);

    ws.on("message", (chunk) => writeStream.write(chunk));
    ws.on("close", async () => {
      writeStream.end();
      try {
        const form = new FormData();
        form.append("file", fs.createReadStream(filePath));
        const pinataRes = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
          maxBodyLength: "Infinity",
          headers: {
            Authorization: `Bearer ${process.env.PINATA_JWT}`,
            ...form.getHeaders()
          }
        });

        const cid = pinataRes.data.IpfsHash;
        const userId = ws.userId || null;

        await db.execute("INSERT INTO uploads (cid, filename, user_id) VALUES (?, ?, ?)", [
          cid,
          `${id}.webm`,
          userId
        ]);

        console.log("✅ Live recording uploaded:", cid);

        // ✅ Send response back to client
        ws.send(JSON.stringify({
          status: "complete",
          cid,
          url: `https://gateway.pinata.cloud/ipfs/${cid}`,
          filename: `${id}.webm`
        }));

      } catch (err) {
        console.error("❌ Live recording upload failed:", err.message);
        ws.send(JSON.stringify({ status: "error", message: err.message }));
      } finally {
        fs.unlink(filePath, () => {});
      }
    });
  });
};
