// Assistant chat endpoints. Like api/todos.js, each function takes `authFetch` from
// AuthContext.
//
// A message is { id, role: 'user' | 'assistant', content, drafts, created_at }. `drafts`
// are task cards the assistant proposed: the todo fields plus `status` ('pending' |
// 'added' | 'dismissed'). Nothing is saved by the assistant; add a card with createTodo,
// then record that with updateDraft.
import { localTimeZone, localToday } from './todos';

// The saved conversation, oldest first. `available` is false when the server has no
// API key, in which case sendChat answers 503.
export function getChat(authFetch) {
    return authFetch('/ai/chat');
}

// Sends one message. Resolves to { messages: [userMessage, assistantMessage] }. Throws
// with a user-facing message on 429 (rate limit) and 503 (assistant unavailable).
export function sendChat(authFetch, message) {
    return authFetch('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message, today: localToday(), timezone: localTimeZone() }),
    });
}

export function clearChat(authFetch) {
    return authFetch('/ai/chat', { method: 'DELETE' });
}

// Records what the user did with a card. `draft` (optional) is the fields as saved, so
// the card shows the edited version. Resolves to { message } (the updated message).
export function updateDraft(authFetch, messageId, index, { status, draft }) {
    return authFetch(`/ai/chat/messages/${messageId}/drafts/${index}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, draft }),
    });
}
