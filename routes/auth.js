import { Router } from "express";
import {
    registerUser,
    loginUser,
    verifyEmail,
    resendVerification,
    refreshAccessToken,
    logoutUser,
    forgotPassword,
    resetPassword,
    deleteAccount,
} from "../controllers/auth.controller.js";
import rateLimit from 'express-rate-limit';
import { requireAppHeader } from "../middleware/requireAppHeader.js";
import { authenticate } from "../middleware/authenticate.js";

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { message: "Too many requests, please try again later" }
});

// Resend-verification and forgot-password each send an email, so they share a tighter
// limit (the controllers also enforce a per-account cooldown).
const resendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: "Too many emails requested. Please try again later." }
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
// These read the refresh-token cookie, so they need the CSRF header too.
router.post("/refresh", sessionLimiter, requireAppHeader, refreshAccessToken);
router.post("/logout", sessionLimiter, requireAppHeader, logoutUser);

router.post("/forgot-password", resendLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
// Re-checks the password, so it gets the login limit against guessing.
router.delete("/account", authLimiter, authenticate, deleteAccount);

export default router;
