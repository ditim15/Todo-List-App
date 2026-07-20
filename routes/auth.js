import { Router } from "express";
import { registerUser, loginUser, refreshAccessToken } from "../controllers/auth.controller.js";
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: "Too many requests, please try again later" }
});

const router = Router();

router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/refresh", refreshAccessToken);

export default router;