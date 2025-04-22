// backend/routes/upload.routes.js
import express from "express";
import multer from "multer";
import { handleUpload } from "../controllers/upload.controller.js";

const router = express.Router();

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "text/plain"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PDF or TXT files are allowed"));
  }
});

router.post("/", upload.single("file"), handleUpload);

export default router;
