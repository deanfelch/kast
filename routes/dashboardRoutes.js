const express = require("express");
const router = express.Router();
const db = require("../models/db");

// Middleware to protect route
function ensureLoggedIn(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// Dashboard view: list of conversations
router.get("/dashboard", ensureLoggedIn, async (req, res) => {
  const userId = req.session.user.id;

  const [conversations] = await db.execute(`
    SELECT c.id, c.title, c.created_at, COUNT(u.id) as kast_count
    FROM conversations c
    LEFT JOIN uploads u ON c.id = u.conversation_id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `, [userId]);

  res.render("frontend/dashboard", {
    user: req.session.user,
    conversations
  });
});

// View a specific conversation
router.get("/conversation/:id", ensureLoggedIn, async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.session.user.id;

  const [kasts] = await db.execute(`
    SELECT 
        u.id,
        u.cid,
        u.title,
        u.filename,
        u.uploaded_at,
        u.user_id,
        us.username
    FROM uploads u
    LEFT JOIN users us ON u.user_id = us.id
    WHERE u.conversation_id = ? AND u.user_id = ?
    ORDER BY u.uploaded_at DESC
    `, [conversationId, req.session.user.id]);

  res.render("frontend/conversation", {
    user: req.session.user,
    conversationId,
    kasts
  });
});

// Update conversation title
router.post("/conversations/:id/title", ensureLoggedIn, async (req, res) => {
  const conversationId = req.params.id;
  const { title } = req.body;
  const userId = req.session.user.id;

  try {
    // Optional: verify ownership
    const [rows] = await db.execute(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
      [conversationId, userId]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await db.execute(
      "UPDATE conversations SET title = ? WHERE id = ?",
      [title, conversationId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating title:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;