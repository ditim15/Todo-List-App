import pool from '../db/pool.js';
import { AiUnavailableError, isAiConfigured } from '../services/ai.js';
import { EDIT_TEXT_MAX_CHARS, FIND_MAX_CHARS, runNotesChat } from '../services/notesAi.js';
import {
    claimUserMessage,
    dailyBudgetUsd,
    recordUsage,
    releaseUserMessage,
    spentTodayUsd,
    userDailyMessageLimit,
} from '../services/aiBudget.js';

// POST /ai/notes: the notes assistant (services/notesAi.js). The conversation isn't
// stored on the server; the client sends the recent messages back with each new one,
// and these caps keep what it can send (and so what each message costs) small.
export const MESSAGE_MAX_CHARS = 2000;
export const HISTORY_MAX_MESSAGES = 10;
export const HISTORY_ITEM_MAX_CHARS = 4000;
export const HISTORY_MAX_CHARS = 16_000;
const LIST_NOTES_LIMIT = 30;

const UNAVAILABLE_MESSAGE = 'The assistant is unavailable right now. Your notes are unaffected.';
const BUDGET_REACHED_MESSAGE = 'The assistant is resting until tomorrow. Your notes are unaffected.';

function optionalNoteId(value) {
    if (value === null || value === undefined) return null;
    return Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : false;
}

// Checks the request body. Returns { error } or the cleaned fields.
export function parseNotesChatBody(body) {
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return { error: 'Type a message first' };
    if (message.length > MESSAGE_MAX_CHARS) return { error: `Keep messages under ${MESSAGE_MAX_CHARS} characters` };

    const noteId = optionalNoteId(body.note_id);
    if (noteId === false) return { error: 'Invalid note' };

    const raw = body.history ?? [];
    if (!Array.isArray(raw)) return { error: 'Invalid conversation' };
    if (raw.length > HISTORY_MAX_MESSAGES) return { error: `Send at most the last ${HISTORY_MAX_MESSAGES} messages` };
    const history = [];
    let total = 0;
    for (const item of raw) {
        if (!item || (item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string' || !item.content.trim()) {
            return { error: 'Invalid conversation' };
        }
        if (item.content.length > HISTORY_ITEM_MAX_CHARS) return { error: 'A message in the conversation is too long' };
        total += item.content.length;
        history.push({ role: item.role, content: item.content });
    }
    if (total > HISTORY_MAX_CHARS) return { error: 'The conversation is too long; start a new one' };
    // The API needs the conversation to start with the student.
    while (history.length > 0 && history[0].role !== 'user') history.shift();

    return { message, noteId, history };
}

// A note's plain text for the model, with its folder's name.
async function loadNote(userId, noteId) {
    const result = await pool.query(
        'SELECT n.id, n.title, n.content_text, f.name AS folder FROM notes n'
        + ' LEFT JOIN note_folders f ON f.id = n.folder_id WHERE n.id = $1 AND n.user_id = $2',
        [noteId, userId]
    );
    const row = result.rows[0];
    return row ? { id: row.id, title: row.title, folder: row.folder, text: row.content_text } : null;
}

async function listNotes(userId, search) {
    const values = [userId, LIST_NOTES_LIMIT];
    let where = 'n.user_id = $1';
    if (search && search.trim()) {
        values.push(`%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
        where += ` AND (n.title ILIKE $3 OR n.content_text ILIKE $3 OR f.name ILIKE $3)`;
    }
    const result = await pool.query(
        'SELECT n.id, n.title, f.name AS folder, left(n.content_text, 80) AS preview FROM notes n'
        + ` LEFT JOIN note_folders f ON f.id = n.folder_id WHERE ${where}`
        + ' ORDER BY n.updated_at DESC, n.id DESC LIMIT $2',
        values
    );
    return result.rows;
}

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

function countOccurrences(haystack, needle) {
    let count = 0;
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count += 1;
    return count;
}

// Checks a propose_note_edit call against the note as saved. Returns { error } (sent
// back to the model so it can fix the call) or { edit } (shown to the student).
export async function validateEdit(userId, input) {
    const note = Number.isInteger(input.note_id) ? await loadNote(userId, input.note_id) : null;
    if (!note) return { error: 'no note with that id' };
    if (input.action !== 'append' && input.action !== 'replace') return { error: 'action must be append or replace' };

    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) return { error: 'text is empty' };
    if (text.length > EDIT_TEXT_MAX_CHARS) return { error: `text is longer than ${EDIT_TEXT_MAX_CHARS} characters; split it up or shorten it` };

    if (input.action === 'append') {
        return { edit: { note_id: note.id, note_title: note.title, action: 'append', find: null, text } };
    }

    const find = typeof input.find === 'string' ? collapse(input.find) : '';
    if (!find) return { error: 'replace needs the exact text to find' };
    if (find.length > FIND_MAX_CHARS) return { error: `find is longer than ${FIND_MAX_CHARS} characters; pick a shorter passage` };
    if (/[\r\n]/.test(text)) return { error: 'replacement text must be one line; use append to add new paragraphs' };
    const occurrences = countOccurrences(collapse(note.text), find);
    if (occurrences === 0) return { error: "that text isn't in the note; copy it exactly from one paragraph or list item" };
    if (occurrences > 1) return { error: `that text appears ${occurrences} times; include more surrounding words so it's unique` };
    return { edit: { note_id: note.id, note_title: note.title, action: 'replace', find, text } };
}

// GET /ai/notes -> { available, remaining_today, daily_limit }, for the panel to show
// before the first message.
export const notesStatus = async (req, res, next) => {
    try {
        const result = await pool.query(
            "SELECT messages FROM ai_usage WHERE user_id = $1 AND day = (NOW() AT TIME ZONE 'UTC')::date",
            [req.user.id]
        );
        const limit = userDailyMessageLimit();
        res.status(200).json({
            available: isAiConfigured(),
            daily_limit: limit,
            remaining_today: Math.max(limit - (result.rows[0]?.messages ?? 0), 0),
        });
    } catch (err) {
        next(err);
    }
};

// POST /ai/notes { message, history?, note_id? } -> { reply: { content, edits, limited },
// remaining_today }.
export const sendNotesChat = async (req, res, next) => {
    let claimed = false;
    try {
        const input = parseNotesChatBody(req.body ?? {});
        if (input.error) return res.status(400).json({ message: input.error });

        const openNote = input.noteId ? await loadNote(req.user.id, input.noteId) : null;
        if (input.noteId && !openNote) return res.status(404).json({ message: 'Note not found' });

        if (!isAiConfigured()) return res.status(503).json({ message: UNAVAILABLE_MESSAGE });
        if ((await spentTodayUsd()) >= dailyBudgetUsd()) {
            console.warn('[ai] daily budget reached; assistant paused until tomorrow (UTC)');
            return res.status(503).json({ message: BUDGET_REACHED_MESSAGE, code: 'AI_DAILY_BUDGET' });
        }
        const used = await claimUserMessage(req.user.id);
        if (!used) {
            return res.status(429).json({
                message: `You've used today's ${userDailyMessageLimit()} assistant messages. They reset tomorrow.`,
                code: 'AI_USER_DAILY_LIMIT',
            });
        }
        claimed = true;

        const reply = await runNotesChat({
            history: input.history,
            message: input.message,
            openNote,
            listNotes: (search) => listNotes(req.user.id, search),
            readNote: (id) => loadNote(req.user.id, id),
            validateEdit: (raw) => validateEdit(req.user.id, raw),
            onUsage: recordUsage,
        });
        claimed = false;

        res.status(200).json({
            reply: { role: 'assistant', content: reply.text, edits: reply.edits, limited: reply.limited },
            remaining_today: Math.max(userDailyMessageLimit() - used, 0),
        });
    } catch (err) {
        if (claimed) {
            await releaseUserMessage(req.user.id).catch((releaseErr) => {
                console.error('[ai] could not give back a failed message:', releaseErr.message);
            });
        }
        if (err instanceof AiUnavailableError) {
            console.warn(`[ai] unavailable: ${err.message}`);
            return res.status(503).json({ message: UNAVAILABLE_MESSAGE });
        }
        next(err);
    }
};
