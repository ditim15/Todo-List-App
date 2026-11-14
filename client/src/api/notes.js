// Notes endpoints (server: routes/notes.js). Like api/todos.js, each takes `authFetch`
// (from useAuth) so requests carry the access token and refresh on 401.

const API_URL = import.meta.env.VITE_API_URL;

// The server returns attachment links as paths ("/notes/attachments/..."); the app runs
// on a different origin, so they need the API's address in front.
export function attachmentUrl(path) {
    return path && path.startsWith('/') ? `${API_URL}${path}` : path;
}

// Same, for every image/file node in an editor document.
function withAbsoluteLinks(node) {
    if (!node || typeof node !== 'object') return node;
    const copy = { ...node };
    if (node.type === 'image' && node.attrs?.src) copy.attrs = { ...node.attrs, src: attachmentUrl(node.attrs.src) };
    if (node.type === 'fileAttachment' && node.attrs?.href) copy.attrs = { ...node.attrs, href: attachmentUrl(node.attrs.href) };
    if (Array.isArray(node.content)) copy.content = node.content.map(withAbsoluteLinks);
    return copy;
}

function readyNote(note) {
    return {
        ...note,
        content: withAbsoluteLinks(note.content),
        attachments: note.attachments.map((a) => ({ ...a, url: attachmentUrl(a.url) })),
    };
}

// { folders, notes } for the sidebar. Notes come without their bodies.
export function getNotesTree(authFetch) {
    return authFetch('/notes/tree');
}

// { notes, total }: the latest edited notes, for the dashboard panel.
export function getRecentNotes(authFetch, limit = 4) {
    return authFetch(`/notes/recent?limit=${limit}`);
}

export async function getNote(authFetch, id) {
    const data = await authFetch(`/notes/${id}`);
    return readyNote(data.note);
}

export async function createNote(authFetch, { folderId = null, title, content } = {}) {
    const data = await authFetch('/notes', {
        method: 'POST',
        body: JSON.stringify({ folder_id: folderId, title }),
    });
    if (!content) return readyNote(data.note);
    return updateNote(authFetch, data.note.id, { content });
}

// Any of { title, content, folderId } (folderId null = top level).
export async function updateNote(authFetch, id, { title, content, folderId } = {}) {
    const body = {};
    if (title !== undefined) body.title = title;
    if (content !== undefined) body.content = content;
    if (folderId !== undefined) body.folder_id = folderId;
    const data = await authFetch(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    return readyNote(data.note);
}

export function deleteNote(authFetch, id) {
    return authFetch(`/notes/${id}`, { method: 'DELETE' });
}

export async function createFolder(authFetch, { name, parentId = null }) {
    const data = await authFetch('/notes/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: parentId }),
    });
    return data.folder;
}

// Any of { name, parentId } (parentId null = top level).
export async function updateFolder(authFetch, id, { name, parentId } = {}) {
    const body = {};
    if (name !== undefined) body.name = name;
    if (parentId !== undefined) body.parent_id = parentId;
    const data = await authFetch(`/notes/folders/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    return data.folder;
}

export function deleteFolder(authFetch, id) {
    return authFetch(`/notes/folders/${id}`, { method: 'DELETE' });
}

// "Import" a task: its notes folder, created the first time. Returns { folder, created }.
export function folderForTask(authFetch, todoId) {
    return authFetch('/notes/task-folders', {
        method: 'POST',
        body: JSON.stringify({ todo_id: todoId }),
    });
}

// Uploads one File (image or PDF) to a note. Returns the attachment with an absolute url.
export async function uploadAttachment(authFetch, noteId, file) {
    const data = await authFetch(`/notes/${noteId}/attachments`, {
        method: 'POST',
        headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Filename': encodeURIComponent(file.name || 'file'),
        },
        body: file,
    });
    return { ...data.attachment, url: attachmentUrl(data.attachment.url) };
}
