require("dotenv").config();
const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const { parse } = require("cookie");

const sessionMiddleware = require("./middleware/session");
const { handleWebSocket } = require("./controllers/wsController");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const uploadRoutes = require("./routes/uploadRoutes");

const app = express();
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true }); // ✅ disables auto-upgrade

// Wrap session middleware for WS
const wrap = (middleware) => (req, res, next) => middleware(req, {}, next);

// Handle WebSocket upgrade (attach session)
server.on("upgrade", (req, socket, head) => {
  wrap(sessionMiddleware)(req, {}, () => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
});

handleWebSocket(wss); // Attach your controller

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(sessionMiddleware);

// Route middleware
app.use("/", authRoutes);
app.use("/admin", adminRoutes);
app.use("/", uploadRoutes);

// Gate to record page
app.get("/record", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("frontend/record", { user: req.session.user });
});

// Redirect root
app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/record");
  res.redirect("/login");
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
