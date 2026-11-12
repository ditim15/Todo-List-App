import pool from '../db/pool.js';
import { AiUnavailableError, isAiConfigured, runChat } from '../services/ai.js';
import { DATE_PATTERN, isValidTimeZone, parseTodoFields } from '../utils/validation.js';

const MESSAGE_MAX_LENGTH = 2000;
// Matches todos.title VARCHAR(255).
const TITLE_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 1000;
// How much of the conversation the model sees each turn, and how much is kept.
const HISTORY_FOR_MODEL = 20;
const MESSAGES_KEPT_PER_USER = 200;
const OPEN_TASKS_LIMIT = 50;
const DRAFT_STATUSES = ['pending', 'added', 'dismissed'];
const UNAVAILABLE_MESSAGE = 'The assistant is unavailable right now. You can still add tasks with the form.';

// Validates a task draft (from the model, or the card the user edited) with the same
// rules as POST /todos. Returns { error } or { draft } in the shape createTodo takes.
export function toDraft(raw, timezone = 'UTC') {
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) {
        return { error: 'Title is required' };
    }
    if (title.length > TITLE_MAX_LENGTH) {
        return { error: `Title must be ${TITLE_MAX_LENGTH} characters or fewer` };
    }
    const description = typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim().slice(0, DESCRIPTION_MAX_LENGTH)
        : null;

    const fields = parseTodoFields({ ...raw, reminder_timezone: timezone });
    if (fields.error) {
        return { error: fields.error };
    }

    return {
        draft: {
            title,
            description,
            due_date: fields.dueDate,
            priority: fields.priority,
            category: fields.category,
            reminder_days_before: fields.reminder?.daysBefore ?? null,
            reminder_time: fields.reminder?.time ?? null,
        },
    };
}

// Checks the POST /ai/chat body. Returns { error } or the cleaned fields.
function parseChatBody(body) {
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
        return { error: 'Type a message first' };
    }
    if (message.length > MESSAGE_MAX_LENGTH) {
        return { error: `Keep messages under ${MESSAGE_MAX_LENGTH} characters` };
    }
    if (typeof body.today !== 'string' || !DATE_PATTERN.test(body.today)) {
        return { error: 'today must be in YYYY-MM-DD format' };
    }
    if (typeof body.timezone !== 'string' || body.timezone.length > 64 || !isValidTimeZone(body.timezone)) {
        return { error: 'Unknown timezone' };
    }
    return { message, today: body.today, timezone: body.timezone };
}

const STATUS_FOR_MODEL = { pending: 'not added yet', added: 'added by the student', dismissed: 'dismissed' };

// A stored message as the model sees it: task cards are summarised after the text so
// the model knows what it already proposed and what the student did with it.
function toModelMessage(row) {
    if (row.role !== 'assistant' || row.drafts.length === 0) {
        return { role: row.role, content: row.content };
    }
    const cards = row.drafts
        .map((d) => `"${d.title}"${d.due_date ? ` due ${d.due_date}` : ''} (${STATUS_FOR_MODEL[d.status] ?? d.status})`)
        .join('; ');
    return { role: 'assistant', content: `${row.content}\n\n[Task cards shown: ${cards}]` };
}

// The student's open tasks for the list_open_tasks tool. Only title, due date, list and
// priority leave the server.
async function findOpenTasks(userId, search) {
    const values = [userId, OPEN_TASKS_LIMIT];
    let where = 'user_id = $1 AND NOT completed';
    if (search && search.trim()) {
        values.push(`%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
        where += ` AND title ILIKE $${values.length}`;
    }
    const result = await pool.query(
        `SELECT title, due_date, category, priority FROM todos WHERE ${where}`
        + ' ORDER BY due_date NULLS LAST, todo_id LIMIT $2',
        values
    );
    return result.rows;
}

// GET /ai/chat -> { available, messages }: the saved conversation, oldest first.
const getChat = async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT id, role, content, drafts, created_at FROM ai_messages'
            + ' WHERE user_id = $1 ORDER BY id',
            [req.user.id]
        );
        res.status(200).json({ available: isAiConfigured(), messages: result.rows });
    } catch (err) {
        next(err);
    }
};

// POST /ai/chat { message, today, timezone } -> { messages: [user, assistant] }.
// Both messages are stored only once the assistant has answered, so a failed turn
// leaves the conversation as it was.
const sendChat = async (req, res, next) => {
    try {
        const input = parseChatBody(req.body ?? {});
        if (input.error) {
            return res.status(400).json({ message: input.error });
        }

        const [recent, lists] = await Promise.all([
            pool.query(
                'SELECT role, content, drafts FROM ai_messages WHERE user_id = $1 ORDER BY id DESC LIMIT $2',
                [req.user.id, HISTORY_FOR_MODEL]
            ),
            pool.query('SELECT DISTINCT category FROM todos WHERE user_id = $1 ORDER BY category', [req.user.id]),
        ]);

        const history = recent.rows.reverse().map(toModelMessage);
        // The API requires the conversation to start with a user message.
        while (history.length > 0 && history[0].role !== 'user') history.shift();
        history.push({ role: 'user', content: input.message });

        const reply = await runChat({
            history,
            today: input.today,
            timezone: input.timezone,
            lists: lists.rows.map((row) => row.category),
            validateDraft: (raw) => toDraft(raw, input.timezone),
            listOpenTasks: (search) => findOpenTasks(req.user.id, search),
        });

        const drafts = reply.drafts.map((draft) => ({ ...draft, status: 'pending' }));
        const saved = await pool.query(
            'INSERT INTO ai_messages (user_id, role, content, drafts)'
            + " VALUES ($1, 'user', $2, '[]'), ($1, 'assistant', $3, $4::jsonb)"
            + ' RETURNING id, role, content, drafts, created_at',
            [req.user.id, input.message, reply.text, JSON.stringify(drafts)]
        );

        // Keep only the latest messages.
        await pool.query(
            'DELETE FROM ai_messages WHERE user_id = $1 AND id NOT IN'
            + ' (SELECT id FROM ai_messages WHERE user_id = $1 ORDER BY id DESC LIMIT $2)',
            [req.user.id, MESSAGES_KEPT_PER_USER]
        );

        res.status(201).json({ messages: saved.rows.sort((a, b) => a.id - b.id) });
    } catch (err) {
        if (err instanceof AiUnavailableError) {
            console.warn(`[ai] unavailable: ${err.message}`);
            return res.status(503).json({ message: UNAVAILABLE_MESSAGE });
        }
        next(err);
    }
};

// DELETE /ai/chat: clears the user's conversation.
const clearChat = async (req, res, next) => {
    try {
        const deleted = await pool.query('DELETE FROM ai_messages WHERE user_id = $1', [req.user.id]);
        res.status(200).json({ message: 'Chat cleared', deleted: deleted.rowCount });
    } catch (err) {
        next(err);
    }
};

// PATCH /ai/chat/messages/:id/drafts/:index { status, draft? } records what the user did
// with a task card. Adding it is a separate POST /todos; this only updates the card.
// When `draft` is sent (the fields as the user saved them) it replaces the card's fields.
const updateDraft = async (req, res, next) => {
    try {
        const index = Number(req.params.index);
        const status = req.body?.status;
        if (!Number.isInteger(index) || index < 0) {
            return res.status(400).json({ message: 'Invalid card' });
        }
        if (!DRAFT_STATUSES.includes(status)) {
            return res.status(400).json({ message: `Status must be one of: ${DRAFT_STATUSES.join(', ')}` });
        }

        let fields = null;
        if (req.body.draft) {
            const checked = toDraft(req.body.draft);
            if (checked.error) {
                return res.status(400).json({ message: checked.error });
            }
            fields = checked.draft;
        }

        // `||` merges the new fields and status into the card's existing object.
        const updated = await pool.query(
            'UPDATE ai_messages SET drafts = jsonb_set(drafts, ARRAY[$1::text], (drafts -> $1::int) || $2::jsonb)'
            + " WHERE id = $3 AND user_id = $4 AND role = 'assistant' AND jsonb_array_length(drafts) > $1::int"
            + ' RETURNING id, role, content, drafts, created_at',
            [index, JSON.stringify({ ...(fields ?? {}), status }), req.params.id, req.user.id]
        );

        if (updated.rows.length === 0) {
            return res.status(404).json({ message: 'Card not found' });
        }
        res.status(200).json({ message: updated.rows[0] });
    } catch (err) {
        next(err);
    }
};

export {
    getChat,
    sendChat,
    clearChat,
    updateDraft
}
