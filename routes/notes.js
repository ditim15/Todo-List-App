import { Router } from "express";
import express from "express";
import {
    getTree,
    getRecentNotes,
    createFolder,
    updateFolder,
    deleteFolder,
    folderForTask,
    getNote,
    createNote,
    updateNote,
    deleteNote,
    uploadAttachment,
    deleteAttachment,
    serveAttachment,
    ATTACHMENT_MAX_BYTES,
} from "../controllers/notes.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { markUserDirty } from "../services/cloud/sync.js";

const router = Router();

// Ids are positive integers; anything else can't match, so it's a 404 rather than a
// Postgres "invalid input syntax" 500.
router.param("id", (req, res, next, id) => {
    if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) {
        return res.status(404).json({ message: "Not found" });
    }
    next();
});

// Uploads arrive as the raw file body (any Content-Type; the controller checks the
// type against the file's bytes). Errors get a readable message instead of a 500.
const rawFile = express.raw({ type: () => true, limit: ATTACHMENT_MAX_BYTES });
function readFile(req, res, next) {
    rawFile(req, res, (err) => {
        if (!err) return next();
        const tooBig = err.type === 'entity.too.large';
        res.status(tooBig ? 413 : 400).json({
            message: tooBig ? `Files can be up to ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB` : "Couldn't read the file",
        });
    });
}

// Signed link, no access token (used by <img> tags and "open PDF" in a new tab).
router.get("/attachments/:id/file", serveAttachment);

router.use(authenticate);

// Any successful change to notes, folders or attachments flags the user's cloud
// backups, which the background worker then syncs (services/cloud/sync.js).
router.use((req, res, next) => {
    if (req.method !== 'GET') {
        res.on('finish', () => {
            if (res.statusCode < 400) {
                markUserDirty(req.user.id).catch((err) => console.warn('[cloud] could not flag backups:', err.message));
            }
        });
    }
    next();
});

router.get("/tree", getTree);
router.get("/recent", getRecentNotes);

router.post("/folders", createFolder);
router.put("/folders/:id", updateFolder);
router.delete("/folders/:id", deleteFolder);
router.post("/task-folders", folderForTask);

router.delete("/attachments/:id", deleteAttachment);

router.post("/", createNote);
router.get("/:id", getNote);
router.put("/:id", updateNote);
router.delete("/:id", deleteNote);
router.post("/:id/attachments", readFile, uploadAttachment);

export default router;
