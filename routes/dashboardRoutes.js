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
  SELECT 
    c.id,
    c.title,
    c.created_at,
    COUNT(u.id) as kast_count,
    c.created_by,
    creator.username AS owner_username,
    MAX(u.uploaded_at) AS last_kast
  FROM conversations c
  LEFT JOIN uploads u ON c.id = u.conversation_id
  LEFT JOIN users creator ON c.created_by = creator.id
  WHERE EXISTS (
    SELECT 1 FROM conversation_users cu WHERE cu.conversation_id = c.id AND cu.user_id = ?
  )
  GROUP BY c.id
  ORDER BY c.created_at DESC
`, [userId]);

  res.render("frontend/dashboard", {
    user: req.session.user,
    conversations
  });
});

router.post("/conversations/new", ensureLoggedIn, async (req, res) => {
  const userId = req.session.user.id;

  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });
  const title = `New ${weekday} Conversation`;

  try {
    // Insert new conversation
    const [result] = await db.execute(
      `INSERT INTO conversations (title, created_by) VALUES (?, ?)`,
      [title, userId]
    );

    const conversationId = result.insertId;

    // Add creator to conversation_users
    await db.execute(
      `INSERT INTO conversation_users (conversation_id, user_id) VALUES (?, ?)`,
      [conversationId, userId]
    );

    res.redirect(`/conversation/${conversationId}`);
  } catch (err) {
    console.error("❌ Failed to create new conversation:", err);
    res.status(500).send("Failed to create new conversation");
  }
});


// View a specific conversation
router.get("/conversation/:id", ensureLoggedIn, async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.session.user.id;

  // Get conversation metadata including creator
  const [[conversation]] = await db.execute(`
    SELECT c.id, c.title, c.created_by, u.username AS creator_username
    FROM conversations c
    LEFT JOIN users u ON c.created_by = u.id
    WHERE c.id = ?
  `, [conversationId]);

  if (!conversation) {
    return res.status(404).send("Conversation not found");
  }

  // Fetch shared users (excluding creator)
  const [sharedUsers] = await db.execute(`
    SELECT u.username
    FROM conversation_users cu
    JOIN users u ON cu.user_id = u.id
    WHERE cu.conversation_id = ? AND cu.user_id != ?
  `, [conversationId, conversation.created_by]);

  // Fetch only the current user's uploads in this conversation
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
  `, [conversationId, userId]);

  res.render("frontend/conversation", {
    user: req.session.user,
    conversation,
    sharedUsers,
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