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
    const startTime = Date.now();

    console.log(`🎧 New recording session started: ${id}`);

    const timeout = setTimeout(() => {
      console.warn(`⚠️ Timeout: no 'done' signal received for ${id}`);
      writeStream.end();
    }, 2 * 60 * 1000); // 2 minutes max

    ws.on("message", (chunk) => {
      // 🧠 Check if it's a JSON "done" signal
      try {
        const signal = JSON.parse(chunk.toString());
        if (signal.done) {
          clearTimeout(timeout);
          writeStream.end(); // trigger upload
          return;
        }
      } catch (e) {
        // Not JSON? Must be binary chunk
        try {
          writeStream.write(chunk);
        } catch (err) {
          console.error("❌ Error writing audio chunk:", err.message);
        }
      }
    });

    // When recording is finalized:
    writeStream.on("finish", async () => {
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

        // Log in DB
        await db.execute("INSERT INTO uploads (cid, filename, user_id) VALUES (?, ?, ?)", [
          cid,
          `${id}.webm`,
          userId
        ]);

        const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
        console.log(`✅ Recording uploaded: ${cid} (${Math.round((Date.now() - startTime) / 1000)}s)`);

        // ✅ Send CID to client IF socket is still open
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            status: "complete",
            cid,
            url
          }));
          ws.close();
        } else {
          console.warn("⚠️ Cannot send CID: WebSocket already closed");
        }
      } catch (err) {
        console.error("❌ IPFS upload failed:", err.message);
      } finally {
        fs.unlink(filePath, () => {}); // Clean up
      }
    });

    ws.on("close", () => {
      clearTimeout(timeout);
    });

    ws.on("error", (err) => {
      console.error("❌ WebSocket error:", err.message);
      writeStream.end();
    });
  });
};
