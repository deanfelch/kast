const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();
const uploader = require("../controllers/uploadController");

router.post("/upload", upload.single("file"), uploader.uploadFile);

module.exports = router;
