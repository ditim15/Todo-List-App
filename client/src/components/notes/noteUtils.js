// Helpers for the notes page and the dashboard's Notes panel.

export const MAX_FOLDER_DEPTH = 5; // keep in sync with controllers/notes.controller.js

// Folders by id, children by parent id ('root' for the top level), notes by folder id.
export function indexTree({ folders, notes }) {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const children = new Map();
    for (const folder of folders) {
        const key = folder.parent_id ?? 'root';
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(folder);
    }
    const notesIn = new Map();
    for (const note of notes) {
        const key = note.folder_id ?? 'root';
        if (!notesIn.has(key)) notesIn.set(key, []);
        notesIn.get(key).push(note);
    }
    return { byId, children, notesIn };
}

// Folders from the top level down to `folderId` (inclusive).
export function folderPath(byId, folderId) {
    const path = [];
    let current = byId.get(folderId);
    while (current) {
        path.unshift(current);
        current = byId.get(current.parent_id);
    }
    return path;
}

// The nearest folder (itself or an ancestor) that belongs to a task, if any.
export function taskFolderFor(byId, folderId) {
    return folderPath(byId, folderId).reverse().find((f) => f.todo_id) ?? null;
}

// Every folder inside `folderId` (not including it), for "Move to" pickers.
export function descendantIds(children, folderId) {
    const ids = new Set();
    const walk = (id) => (children.get(id) ?? []).forEach((child) => {
        ids.add(child.id);
        walk(child.id);
    });
    walk(folderId);
    return ids;
}

// How many levels a folder's subtree spans (1 = no subfolders).
export function subtreeHeight(children, folderId) {
    const kids = children.get(folderId) ?? [];
    return 1 + Math.max(0, ...kids.map((k) => subtreeHeight(children, k.id)));
}

// Notes in a folder and all of its subfolders.
export function countNotesDeep(index, folderId) {
    const own = index.notesIn.get(folderId)?.length ?? 0;
    return own + (index.children.get(folderId) ?? []).reduce((sum, f) => sum + countNotesDeep(index, f.id), 0);
}

// "Fri, Nov 20" from 'YYYY-MM-DD' (parsed by hand: new Date('YYYY-MM-DD') is UTC).
export function formatDay(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// "Due today", "Due in 3 days", "2 days overdue", "Done".
export function taskStatus({ task_due_date: due, task_completed: done }) {
    if (done) return { label: 'Done', tone: 'done' };
    if (!due) return { label: 'No due date', tone: null };
    const [y, m, d] = due.split('-').map(Number);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(y, m - 1, d) - today) / 86400000);
    if (days === 0) return { label: 'Due today', tone: 'warning' };
    if (days === 1) return { label: 'Due tomorrow', tone: 'warning' };
    if (days > 1) return { label: `Due in ${days} days`, tone: null };
    return { label: `${-days} day${days === -1 ? '' : 's'} overdue`, tone: 'critical' };
}

// "just now", "5 min ago", "3 h ago", "Nov 12".
export function formatEdited(timestamp) {
    const then = new Date(timestamp);
    const minutes = Math.round((Date.now() - then.getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- Starter notes for a task folder ----------

const text = (value) => (value ? [{ type: 'text', text: value }] : undefined);
const paragraph = (value) => ({ type: 'paragraph', ...(value && { content: text(value) }) });
const heading = (level, value) => ({ type: 'heading', attrs: { level }, content: text(value) });
const checklist = (items) => ({
    type: 'taskList',
    content: items.map((item) => ({ type: 'taskItem', attrs: { checked: false }, content: [paragraph(item)] })),
});
const bullets = (items) => ({
    type: 'bulletList',
    content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
});

// A timeline plan, working back from the task's due date.
export function planTemplate(folder) {
    const due = folder.task_due_date ? `It's due ${formatDay(folder.task_due_date)}.` : 'It has no due date yet.';
    return {
        title: 'Plan the timeline',
        content: {
            type: 'doc',
            content: [
                paragraph(`How I'll get "${folder.task_title ?? folder.name}" done. ${due}`),
                heading(2, 'Milestones'),
                checklist(['Gather what I need', 'First pass', 'Review and finish']),
                heading(2, 'Schedule'),
                bullets(['']),
                heading(2, 'Blockers and questions'),
                bullets(['']),
            ],
        },
    };
}

// What the task (e.g. an exam) covers.
export function topicsTemplate(folder) {
    return {
        title: 'Topics to cover',
        content: {
            type: 'doc',
            content: [
                paragraph(`What "${folder.task_title ?? folder.name}" covers.`),
                heading(2, 'Topics'),
                checklist(['']),
                heading(2, 'Key terms and formulas'),
                bullets(['']),
                heading(2, 'Resources'),
                bullets(['']),
            ],
        },
    };
}
