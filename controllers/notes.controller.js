import crypto from 'crypto';
import pool from '../db/pool.js';

// Notes: folders (nested, optionally tied to a task), notes (rich-text documents from
// the editor, stored as Tiptap JSON), and attachments (images and PDFs, stored in the
// database). Every query is scoped to req.user.id, so one user can never read or
// change another user's notes. See db/init.sql for the tables.

export const MAX_FOLDER_DEPTH = 5;            // top-level folder = depth 1
export const NAME_MAX = 100;
export const TITLE_MAX = 200;
export const CONTENT_MAX_BYTES = 1_000_000;   // a note's JSON document
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const USER_ATTACHMENT_QUOTA_BYTES = 200 * 1024 * 1024;
// Background colours a folder can have (Folder settings). Keys, not hex values: the
// client maps each to light- and dark-theme colours (client/src/components/notes/folderColors.js).
export const FOLDER_COLORS = ['sage', 'sky', 'lavender', 'rose', 'peach', 'butter', 'clay', 'slate'];
const SIGNED_URL_HOURS = 6;
// Attachments a note's document no longer refers to are deleted on save once they're
// this old; younger ones are kept so undo in the editor can still bring them back.
const ORPHAN_GRACE = '1 day';

// Allowed upload types and the bytes each file must start with. Checked against the
// file itself, so a renamed .html can't be served as an "image". SVG is deliberately
// not allowed (it can carry scripts).
const FILE_TYPES = {
    'image/png': (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/gif': (b) => b.length > 6 && (b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a'),
    'image/webp': (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
    'application/pdf': (b) => b.length > 5 && b.subarray(0, 5).toString('ascii') === '%PDF-',
};

// ---------- Small helpers ----------

function cleanName(value, max) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// A positive int id from a body field, null for null/undefined, or false if invalid.
function optionalId(value) {
    if (value === null || value === undefined || value === '') return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : false;
}

// The plain text of an editor document, for previews.
function documentText(node) {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'text' && typeof node.text === 'string') return node.text;
    if (!Array.isArray(node.content)) return '';
    const parts = node.content.map(documentText);
    // Block nodes are separated by a space so words from adjacent paragraphs don't merge.
    return parts.join(node.type === 'paragraph' || node.type === 'heading' ? '' : ' ').replace(/\s+/g, ' ');
}

// Every attachment id the document refers to (image and file nodes).
function referencedAttachments(node, ids = new Set()) {
    if (!node || typeof node !== 'object') return ids;
    const id = Number(node.attrs?.attachmentId);
    if ((node.type === 'image' || node.type === 'fileAttachment') && Number.isInteger(id)) ids.add(id);
    if (Array.isArray(node.content)) node.content.forEach((child) => referencedAttachments(child, ids));
    return ids;
}

// Gives every image/file node in the document a fresh signed link for its attachment.
// Links expire, so they're refreshed each time a note is loaded.
function withFreshLinks(node, urls) {
    if (!node || typeof node !== 'object') return node;
    const copy = { ...node };
    const url = urls.get(Number(node.attrs?.attachmentId));
    if (url && node.type === 'image') copy.attrs = { ...node.attrs, src: url };
    if (url && node.type === 'fileAttachment') copy.attrs = { ...node.attrs, href: url };
    if (Array.isArray(node.content)) copy.content = node.content.map((child) => withFreshLinks(child, urls));
    return copy;
}

function signature(id, exp) {
    return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`note-attachment:${id}:${exp}`).digest('base64url');
}

// A link to an attachment's file that works without the access token until it expires.
function signedUrl(id) {
    const hour = 60 * 60;
    // Rounded to the hour so the same link is reused for a while (browser caching).
    const exp = (Math.floor(Date.now() / 1000 / hour) + SIGNED_URL_HOURS) * hour;
    return `/notes/attachments/${id}/file?exp=${exp}&sig=${signature(id, exp)}`;
}

function attachmentJson(row) {
    return { id: row.id, filename: row.filename, mime_type: row.mime_type, size_bytes: row.size_bytes, url: signedUrl(row.id) };
}

const FOLDER_COLUMNS = 'f.id, f.parent_id, f.name, f.todo_id, f.color, f.created_at, f.updated_at,'
    + ' t.title AS task_title, t.due_date AS task_due_date, t.completed AS task_completed,'
    + ' t.priority AS task_priority, t.category AS task_category';

async function getOwnedFolder(userId, folderId) {
    const result = await pool.query(
        `SELECT ${FOLDER_COLUMNS} FROM note_folders f LEFT JOIN todos t ON t.todo_id = f.todo_id`
        + ' WHERE f.id = $1 AND f.user_id = $2',
        [folderId, userId]
    );
    return result.rows[0] ?? null;
}

// Depth of a folder: 1 for top level, 2 for its children, and so on.
async function folderDepth(folderId) {
    const result = await pool.query(
        'WITH RECURSIVE up AS ('
        + ' SELECT id, parent_id, 1 AS depth FROM note_folders WHERE id = $1'
        + ' UNION ALL SELECT f.id, f.parent_id, up.depth + 1 FROM note_folders f JOIN up ON f.id = up.parent_id'
        + ') SELECT MAX(depth) AS depth FROM up',
        [folderId]
    );
    return Number(result.rows[0].depth);
}

// Ids in a folder's subtree (including itself) and how many levels it spans.
async function folderSubtree(folderId) {
    const result = await pool.query(
        'WITH RECURSIVE down AS ('
        + ' SELECT id, 1 AS level FROM note_folders WHERE id = $1'
        + ' UNION ALL SELECT f.id, down.level + 1 FROM note_folders f JOIN down ON f.parent_id = down.id'
        + ') SELECT id, level FROM down',
        [folderId]
    );
    return {
        ids: new Set(result.rows.map((r) => r.id)),
        height: Math.max(...result.rows.map((r) => r.level)),
    };
}

// ---------- Tree and recent notes ----------

// Everything needed to draw the sidebar: all folders (with their task, if any) and all
// notes without their bodies.
const getTree = async (req, res, next) => {
    try {
        const folders = await pool.query(
            `SELECT ${FOLDER_COLUMNS} FROM note_folders f LEFT JOIN todos t ON t.todo_id = f.todo_id`
            + ' WHERE f.user_id = $1 ORDER BY lower(f.name), f.id',
            [req.user.id]
        );
        const notes = await pool.query(
            'SELECT id, folder_id, title, left(content_text, 160) AS preview, created_at, updated_at'
            + ' FROM notes WHERE user_id = $1 ORDER BY updated_at DESC, id DESC',
            [req.user.id]
        );
        res.status(200).json({ folders: folders.rows, notes: notes.rows });
    } catch (err) {
        next(err);
    }
};

// The latest edited notes, for the dashboard's Notes panel.
const getRecentNotes = async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
        const notes = await pool.query(
            'SELECT n.id, n.folder_id, n.title, left(n.content_text, 120) AS preview, n.updated_at,'
            + ' f.name AS folder_name, f.todo_id'
            + ' FROM notes n LEFT JOIN note_folders f ON f.id = n.folder_id'
            + ' WHERE n.user_id = $1 ORDER BY n.updated_at DESC, n.id DESC LIMIT $2',
            [req.user.id, limit]
        );
        const count = await pool.query('SELECT COUNT(*)::int AS total FROM notes WHERE user_id = $1', [req.user.id]);
        res.status(200).json({ notes: notes.rows, total: count.rows[0].total });
    } catch (err) {
        next(err);
    }
};

// ---------- Folders ----------

const createFolder = async (req, res, next) => {
    try {
        const name = cleanName(req.body?.name, NAME_MAX);
        const parentId = optionalId(req.body?.parent_id);
        if (!name) return res.status(400).json({ message: 'Give the folder a name' });
        if (parentId === false) return res.status(400).json({ message: 'Invalid parent folder' });
        const color = req.body?.color === undefined ? null : folderColor(req.body.color);
        if (color === false) return res.status(400).json({ message: 'Pick one of the folder colours' });

        if (parentId) {
            if (!(await getOwnedFolder(req.user.id, parentId))) {
                return res.status(404).json({ message: 'Folder not found' });
            }
            if (await folderDepth(parentId) >= MAX_FOLDER_DEPTH) {
                return res.status(400).json({ message: `Folders can be nested up to ${MAX_FOLDER_DEPTH} levels deep` });
            }
        }

        const created = await pool.query(
            'INSERT INTO note_folders (user_id, parent_id, name, color) VALUES ($1, $2, $3, $4) RETURNING id',
            [req.user.id, parentId, name, color]
        );
        res.status(201).json({ folder: await getOwnedFolder(req.user.id, created.rows[0].id) });
    } catch (err) {
        next(err);
    }
};

// A colour from the request body: a palette key, null to clear it, or false if invalid.
function folderColor(value) {
    if (value === null || value === '') return null;
    return FOLDER_COLORS.includes(value) ? value : false;
}

// Rename, move and/or restyle a folder. `parent_id: null` moves it to the top level;
// `color: null` goes back to the default look.
const updateFolder = async (req, res, next) => {
    try {
        const folder = await getOwnedFolder(req.user.id, req.params.id);
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        let name = folder.name;
        if (req.body?.name !== undefined) {
            name = cleanName(req.body.name, NAME_MAX);
            if (!name) return res.status(400).json({ message: 'Give the folder a name' });
        }

        let parentId = folder.parent_id;
        if (req.body?.parent_id !== undefined) {
            parentId = optionalId(req.body.parent_id);
            if (parentId === false) return res.status(400).json({ message: 'Invalid parent folder' });
            if (parentId !== folder.parent_id && parentId !== null) {
                if (!(await getOwnedFolder(req.user.id, parentId))) {
                    return res.status(404).json({ message: 'Folder not found' });
                }
                const subtree = await folderSubtree(folder.id);
                if (subtree.ids.has(parentId)) {
                    return res.status(400).json({ message: "A folder can't be moved inside itself" });
                }
                if (await folderDepth(parentId) + subtree.height > MAX_FOLDER_DEPTH) {
                    return res.status(400).json({ message: `Folders can be nested up to ${MAX_FOLDER_DEPTH} levels deep` });
                }
            }
        }

        let color = folder.color;
        if (req.body?.color !== undefined) {
            color = folderColor(req.body.color);
            if (color === false) return res.status(400).json({ message: 'Pick one of the folder colours' });
        }

        await pool.query(
            'UPDATE note_folders SET name = $1, parent_id = $2, color = $3, updated_at = NOW() WHERE id = $4 AND user_id = $5',
            [name, parentId, color, folder.id, req.user.id]
        );
        res.status(200).json({ folder: await getOwnedFolder(req.user.id, folder.id) });
    } catch (err) {
        next(err);
    }
};

// Deletes the folder, its subfolders and every note (and attachment) inside them.
const deleteFolder = async (req, res, next) => {
    try {
        const deleted = await pool.query(
            'DELETE FROM note_folders WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (deleted.rows.length === 0) return res.status(404).json({ message: 'Folder not found' });
        res.status(200).json({ message: 'Folder deleted' });
    } catch (err) {
        next(err);
    }
};

// "Import" a task into Notes: returns the task's notes folder, creating it (named after
// the task, at the top level) the first time.
const folderForTask = async (req, res, next) => {
    try {
        const todoId = optionalId(req.body?.todo_id);
        if (!todoId) return res.status(400).json({ message: 'Choose a task' });

        const todo = await pool.query('SELECT todo_id, title FROM todos WHERE todo_id = $1 AND user_id = $2', [todoId, req.user.id]);
        if (todo.rows.length === 0) return res.status(404).json({ message: 'Task not found' });

        const created = await pool.query(
            'INSERT INTO note_folders (user_id, todo_id, name) VALUES ($1, $2, $3)'
            + ' ON CONFLICT (todo_id) WHERE todo_id IS NOT NULL DO NOTHING RETURNING id',
            [req.user.id, todoId, cleanName(todo.rows[0].title, NAME_MAX) || 'Task notes']
        );
        const id = created.rows[0]?.id
            ?? (await pool.query('SELECT id FROM note_folders WHERE todo_id = $1 AND user_id = $2', [todoId, req.user.id])).rows[0].id;

        res.status(created.rows.length > 0 ? 201 : 200).json({
            folder: await getOwnedFolder(req.user.id, id),
            created: created.rows.length > 0,
        });
    } catch (err) {
        next(err);
    }
};

// ---------- Notes ----------

async function noteJson(userId, noteId) {
    const result = await pool.query(
        'SELECT id, folder_id, title, content, created_at, updated_at FROM notes WHERE id = $1 AND user_id = $2',
        [noteId, userId]
    );
    const note = result.rows[0];
    if (!note) return null;

    const attachments = await pool.query(
        'SELECT id, filename, mime_type, size_bytes FROM note_attachments WHERE note_id = $1 ORDER BY id',
        [note.id]
    );
    const list = attachments.rows.map(attachmentJson);
    const urls = new Map(list.map((a) => [a.id, a.url]));
    return { ...note, content: withFreshLinks(note.content, urls), attachments: list };
}

const getNote = async (req, res, next) => {
    try {
        const note = await noteJson(req.user.id, req.params.id);
        if (!note) return res.status(404).json({ message: 'Note not found' });
        res.status(200).json({ note });
    } catch (err) {
        next(err);
    }
};

const createNote = async (req, res, next) => {
    try {
        const folderId = optionalId(req.body?.folder_id);
        if (folderId === false) return res.status(400).json({ message: 'Invalid folder' });
        if (folderId && !(await getOwnedFolder(req.user.id, folderId))) {
            return res.status(404).json({ message: 'Folder not found' });
        }
        const title = cleanName(req.body?.title, TITLE_MAX) || 'Untitled note';

        const created = await pool.query(
            'INSERT INTO notes (user_id, folder_id, title) VALUES ($1, $2, $3) RETURNING id',
            [req.user.id, folderId, title]
        );
        res.status(201).json({ note: await noteJson(req.user.id, created.rows[0].id) });
    } catch (err) {
        next(err);
    }
};

// Saves any of: title, content (the editor document), folder_id (move; null = top level).
const updateNote = async (req, res, next) => {
    try {
        const existing = await pool.query('SELECT id, folder_id, title FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        const note = existing.rows[0];
        if (!note) return res.status(404).json({ message: 'Note not found' });

        const sets = [];
        const values = [];
        const set = (column, value) => {
            values.push(value);
            sets.push(`${column} = $${values.length}`);
        };

        if (req.body?.title !== undefined) {
            set('title', cleanName(req.body.title, TITLE_MAX) || 'Untitled note');
        }

        if (req.body?.folder_id !== undefined) {
            const folderId = optionalId(req.body.folder_id);
            if (folderId === false) return res.status(400).json({ message: 'Invalid folder' });
            if (folderId && !(await getOwnedFolder(req.user.id, folderId))) {
                return res.status(404).json({ message: 'Folder not found' });
            }
            set('folder_id', folderId);
        }

        let referenced = null;
        if (req.body?.content !== undefined) {
            const content = req.body.content;
            if (!content || typeof content !== 'object' || content.type !== 'doc' || !Array.isArray(content.content ?? [])) {
                return res.status(400).json({ message: 'Invalid note content' });
            }
            const json = JSON.stringify(content);
            if (Buffer.byteLength(json) > CONTENT_MAX_BYTES) {
                return res.status(413).json({ message: 'This note is too long to save. Split it into two notes.' });
            }
            set('content', json);
            set('content_text', documentText(content).trim().slice(0, 100000));
            referenced = [...referencedAttachments(content)];
        }

        if (sets.length > 0) {
            values.push(note.id, req.user.id);
            await pool.query(
                `UPDATE notes SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
                values
            );
        }

        if (referenced) {
            await pool.query(
                'DELETE FROM note_attachments WHERE note_id = $1 AND NOT (id = ANY($2::int[]))'
                + ` AND created_at < NOW() - INTERVAL '${ORPHAN_GRACE}'`,
                [note.id, referenced]
            );
        }

        res.status(200).json({ note: await noteJson(req.user.id, note.id) });
    } catch (err) {
        next(err);
    }
};

const deleteNote = async (req, res, next) => {
    try {
        const deleted = await pool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
        if (deleted.rows.length === 0) return res.status(404).json({ message: 'Note not found' });
        res.status(200).json({ message: 'Note deleted' });
    } catch (err) {
        next(err);
    }
};

// ---------- Attachments ----------

// Upload one file as the raw request body (see routes/notes.js). The browser sends its
// type in Content-Type and the original name, URL-encoded, in X-Filename.
const uploadAttachment = async (req, res, next) => {
    try {
        const note = await pool.query('SELECT id FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        if (note.rows.length === 0) return res.status(404).json({ message: 'Note not found' });

        const data = Buffer.isBuffer(req.body) ? req.body : null;
        const mimeType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!data || data.length === 0) return res.status(400).json({ message: 'The file is empty' });
        if (!FILE_TYPES[mimeType]) {
            return res.status(415).json({ message: 'You can attach images (PNG, JPEG, GIF, WebP) and PDFs' });
        }
        if (!FILE_TYPES[mimeType](data)) {
            return res.status(415).json({ message: "That file doesn't look like the type it says it is" });
        }

        let filename = 'file';
        try {
            filename = decodeURIComponent(req.get('x-filename') || '');
        } catch {
            filename = '';
        }
        // No paths or control characters; keep it short.
        filename = filename.replace(/[\\/\u0000-\u001f\u007f]/g, '').trim().slice(0, 255) || (mimeType === 'application/pdf' ? 'document.pdf' : 'image');

        const used = await pool.query('SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used FROM note_attachments WHERE user_id = $1', [req.user.id]);
        if (Number(used.rows[0].used) + data.length > USER_ATTACHMENT_QUOTA_BYTES) {
            return res.status(413).json({ message: `You've used your ${USER_ATTACHMENT_QUOTA_BYTES / 1024 / 1024} MB of attachment space. Remove some files to add more.` });
        }

        const created = await pool.query(
            'INSERT INTO note_attachments (user_id, note_id, filename, mime_type, size_bytes, data)'
            + ' VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, filename, mime_type, size_bytes',
            [req.user.id, req.params.id, filename, mimeType, data.length, data]
        );
        res.status(201).json({ attachment: attachmentJson(created.rows[0]) });
    } catch (err) {
        next(err);
    }
};

const deleteAttachment = async (req, res, next) => {
    try {
        const deleted = await pool.query('DELETE FROM note_attachments WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
        if (deleted.rows.length === 0) return res.status(404).json({ message: 'Attachment not found' });
        res.status(200).json({ message: 'Attachment deleted' });
    } catch (err) {
        next(err);
    }
};

// Serves a file from a signed link (no access token; <img> and new tabs can't send one).
const serveAttachment = async (req, res, next) => {
    try {
        const exp = Number(req.query.exp);
        const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
        const expected = signature(req.params.id, exp);
        const valid = Number.isInteger(exp) && exp * 1000 > Date.now()
            && sig.length === expected.length
            && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
        if (!valid) return res.status(403).json({ message: 'This link has expired. Reopen the note to get a new one.' });

        const result = await pool.query('SELECT filename, mime_type, size_bytes, data FROM note_attachments WHERE id = $1', [req.params.id]);
        const file = result.rows[0];
        if (!file) return res.status(404).json({ message: 'Attachment not found' });

        res.set({
            'Content-Type': file.mime_type,
            'Content-Length': String(file.size_bytes),
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
            'Cache-Control': `private, max-age=${Math.max(0, exp - Math.floor(Date.now() / 1000))}`,
            // The app is on another origin than the API, so allow it to embed the file.
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'X-Content-Type-Options': 'nosniff',
        });
        // Only types checked by their bytes are ever stored, so nothing here can run as a
        // page. The default CSP stops the browser's PDF viewer, so PDFs drop it.
        if (file.mime_type === 'application/pdf') res.removeHeader('Content-Security-Policy');
        res.status(200).send(file.data);
    } catch (err) {
        next(err);
    }
};

export {
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
};
