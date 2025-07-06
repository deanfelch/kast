const express = require("express");
const router = express.Router();
const admin = require("../controllers/adminController");

router.get("/", admin.showLogin);
router.post("/login", admin.login);
router.get("/logout", admin.logout);
router.get("/uploads", admin.uploads);

module.exports = router;
