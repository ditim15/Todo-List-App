// Notes assistant endpoints (server: controllers/notesAi.controller.js). The
// conversation lives in the browser; each message is sent with the recent history,
// trimmed here to what the server accepts.

const HISTORY_MAX_MESSAGES = 10;
const HISTORY_ITEM_MAX_CHARS = 4000;
const HISTORY_MAX_CHARS = 16_000;

// { available, remaining_today, daily_limit }
export function getNotesAiStatus(authFetch) {
    return authFetch('/ai/notes');
}

// The latest messages that fit the server's limits, oldest first.
function trimHistory(messages) {
    const history = [];
    let total = 0;
    for (const m of [...messages].reverse()) {
        if (history.length >= HISTORY_MAX_MESSAGES) break;
        const content = m.content.slice(0, HISTORY_ITEM_MAX_CHARS);
        if (total + content.length > HISTORY_MAX_CHARS) break;
        total += content.length;
        history.unshift({ role: m.role, content });
    }
    return history;
}

// Resolves to { reply: { content, edits, limited }, remaining_today }.
export function sendNotesChat(authFetch, { message, history, noteId }) {
    return authFetch('/ai/notes', {
        method: 'POST',
        body: JSON.stringify({ message, history: trimHistory(history), note_id: noteId ?? null }),
    });
}
