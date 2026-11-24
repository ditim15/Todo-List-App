// Todos endpoints. Each function takes `authFetch` (from AuthContext, via useAuth) as
// its first argument so calls carry the current access token and get transparent
// refresh-and-retry on 401.

// Today's date in the user's local timezone as YYYY-MM-DD (the server uses it to work
// out which todos are due today vs. overdue).
export function localToday() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

// Optional filters: `category` (one list), `priorities` (array of 'low' | 'medium' |
// 'high'), `search` (title contains), `dueFrom` / `dueTo` ('YYYY-MM-DD', inclusive), and
// `repeating: 'open'` (only the open copy of each repeating task).
export function getTodos(authFetch, { page = 1, limit = 10, category, priorities = [], search, dueFrom, dueTo, repeating } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (category) params.set('category', category);
    if (priorities.length > 0) params.set('priority', priorities.join(','));
    if (search) params.set('search', search);
    if (dueFrom) params.set('dueFrom', dueFrom);
    if (dueTo) params.set('dueTo', dueTo);
    if (repeating) params.set('repeating', repeating);
    return authFetch(`/todos?${params}`);
}

// Renames a list by moving all of its todos to `newName` (merges if that list exists).
export function renameList(authFetch, oldName, newName) {
    return authFetch(`/todos/lists/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName }),
    });
}

// Dashboard summary: total, completed, dueToday, overdue, priorities {high, medium, low}
// (open tasks only), and lists [{ name, total, completed }].
export function getTodoStats(authFetch) {
    return authFetch(`/todos/stats?today=${localToday()}`);
}

// The browser's IANA timezone (e.g. 'America/New_York'). Reminder times are the user's
// local time, so the server needs this to work out when to send them.
export function localTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

// Reminder fields for the API: `reminder_days_before` (null = no reminder, 0 = on the
// due date, up to 7) and `reminder_time` ('HH:MM' local time).
function reminderFields({ reminder_days_before = null, reminder_time = null }) {
    return {
        reminder_days_before,
        reminder_time,
        reminder_timezone: reminder_days_before === null ? null : localTimeZone(),
    };
}

// Repeat fields for the API: `recurrence` ('daily' | 'weekdays' | 'weekly' | 'biweekly' |
// 'monthly', null = doesn't repeat) and `recurrence_until` ('YYYY-MM-DD', required when
// it repeats).
function recurrenceFields({ recurrence = null, recurrence_until = null }) {
    return {
        recurrence: recurrence || null,
        recurrence_until: recurrence ? recurrence_until : null,
    };
}

// `due_date` is an optional 'YYYY-MM-DD' string; `priority` is 'low' | 'medium' | 'high';
// `category` is the list name (server defaults it to 'General'). See reminderFields and
// recurrenceFields for the optional reminder and repeat.
export function createTodo(authFetch, { title, description, completed = false, due_date = null, priority = 'medium', category, ...rest }) {
    return authFetch('/todos', {
        method: 'POST',
        body: JSON.stringify({ title, description, completed, due_date, priority, category, ...reminderFields(rest), ...recurrenceFields(rest) }),
    });
}

// PUT replaces every field, so pass the whole todo (omitted fields reset to defaults,
// including the reminder and repeat). Ticking off a repeating task returns `next_todo`.
export function updateTodo(authFetch, id, { title, description, completed, due_date = null, priority, category, ...rest }) {
    return authFetch(`/todos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title, description, completed, due_date, priority, category, ...reminderFields(rest), ...recurrenceFields(rest) }),
    });
}

export function deleteTodo(authFetch, id) {
    return authFetch(`/todos/${id}`, {
        method: 'DELETE',
    });
}
