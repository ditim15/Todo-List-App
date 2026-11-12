import { Router } from "express";
import {
    registerUser,
    loginUser,
    verifyEmail,
    resendVerification,
    refreshAccessToken,
    logoutUser,
} from "../controllers/auth.controller.js";
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { message: "Too many requests, please try again later" }
});

// Each resend sends an email, so it's limited more tightly (the controller also enforces
// a per-account cooldown).
const resendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: "Too many verification emails requested. Please try again later." }
});

// Refresh and logout happen without the user doing anything (an access token expires,
// several tabs are open), so they get a looser limit of their own. It's still low
// enough to stop someone guessing refresh tokens.
const sessionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "Too many requests, please try again later" }
});

const router = Router();

router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/verify-email", authLimiter, verifyEmail);
router.post("/resend-verification", resendLimiter, resendVerification);
router.post("/refresh", sessionLimiter, refreshAccessToken);
router.post("/logout", sessionLimiter, logoutUser);

export default router;
