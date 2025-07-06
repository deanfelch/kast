require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const { handleWebSocket } = require("./controllers/wsController");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

handleWebSocket(wss);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: "secretkey", resave: false, saveUninitialized: false }));

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
