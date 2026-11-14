import { Router } from "express";
import rateLimit from 'express-rate-limit';
import { submitContact } from "../controllers/contact.controller.js";

// Each submission sends an email, so keep it tight: plenty for a real person, useless
// for flooding the support inbox.
const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { message: "You've sent a few messages already. Please try again in an hour." }
});

const router = Router();

router.post("/", contactLimiter, submitContact);

export default router;
