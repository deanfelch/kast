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
    SELECT * FROM uploads
    WHERE conversation_id = ? AND user_id = ?
    ORDER BY uploaded_at ASC
  `, [conversationId, userId]);

  res.render("frontend/conversation", {
    user: req.session.user,
    conversationId,
    kasts
  });
});

module.exports = router;