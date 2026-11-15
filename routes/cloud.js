import { Router } from "express";
import rateLimit from 'express-rate-limit';
import {
    disableBackup,
    disconnect,
    enableBackup,
    finishConnect,
    folderBackups,
    listConnections,
    startConnect,
    syncNow,
} from "../controllers/cloud.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// The provider redirects the browser here, so there's no access token: the OAuth state
// identifies the user. Limited per IP.
const callbackLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });
router.get("/:provider/callback", callbackLimiter, finishConnect);

router.use(authenticate);

// Starting sign-ins and "Back up now" call the provider, so they're limited per account.
// Skipped in tests, where every test's user is id 1 again and connects several times.
const perUser = (max, message) => rateLimit({
    windowMs: 10 * 60 * 1000,
    max,
    keyGenerator: (req) => `user:${req.user.id}`,
    skip: () => process.env.NODE_ENV === 'test',
    message: { message },
});
const connectLimiter = perUser(10, 'Too many sign-in attempts. Try again in a few minutes.');
const syncLimiter = perUser(10, "You've backed up a lot in the last few minutes. Backups also run on their own after you edit.");

router.get("/", listConnections);
router.post("/:provider/connect", connectLimiter, startConnect);
router.delete("/:provider", disconnect);

router.get("/folders/:folderId", folderBackups);
router.put("/folders/:folderId/:provider", enableBackup);
router.delete("/folders/:folderId/:provider", disableBackup);
router.post("/folders/:folderId/:provider/sync", syncLimiter, syncNow);

export default router;
