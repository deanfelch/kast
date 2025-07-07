const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();
const uploader = require("../controllers/uploadController");

router.post("/upload", upload.single("file"), uploader.uploadFile);

router.post("/kasts/:id/title", async (req, res) => {
  const userId = req.session.user?.id;
  const { id } = req.params;
  const { title } = req.body;

  if (!userId) return res.status(401).json({ success: false, message: "Not logged in" });

  try {
    const [result] = await db.execute(
      "UPDATE uploads SET title = ? WHERE id = ? AND user_id = ?",
      [title, id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating title:", err.message);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
