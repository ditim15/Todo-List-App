import { Router } from "express";
import rateLimit from 'express-rate-limit';
import { clearChat, getChat, sendChat, updateDraft } from "../controllers/ai.controller.js";

// Each chat message costs API requests, so sending is limited per account rather than
// per IP (students on one campus network share an IP). server.js mounts this router
// behind `authenticate`, so req.user is always set here.
const chatLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    keyGenerator: (req) => `user:${req.user.id}`,
    message: { message: "You've sent the assistant a lot of messages in the last few minutes. Try again soon, or add tasks with the form." }
});

const router = Router();

// Message ids are positive integers (SERIAL); anything else can't match a message.
router.param("id", (req, res, next, id) => {
    if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) {
        return res.status(404).json({ message: "Card not found" });
    }
    next();
});

router.get("/chat", getChat);
router.post("/chat", chatLimiter, sendChat);
router.delete("/chat", clearChat);
router.patch("/chat/messages/:id/drafts/:index", updateDraft);

export default router;
