import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AppTopbar from '../components/AppTopbar';
import SiteFooter from '../components/SiteFooter';
import NoteEditor from '../components/notes/NoteEditor';
import FolderSettings from '../components/notes/FolderSettings';
import NotesAssistant from '../components/notes/NotesAssistant';
import { applyNoteEdit } from '../components/notes/noteEdits';
import {
    MAX_FOLDER_DEPTH,
    countNotesDeep,
    descendantIds,
    folderPath,
    formatDay,
    formatEdited,
    indexTree,
    planTemplate,
    subtreeHeight,
    taskFolderFor,
    taskStatus,
    topicsTemplate,
} from '../components/notes/noteUtils';
import {
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    folderForTask,
    getNote,
    getNotesTree,
    updateFolder,
    updateNote,
    uploadAttachment,
} from '../api/notes';
import { getTodos } from '../api/todos';
import './static/Dashboard.css';
import './static/Notes.css';

const SAVE_DELAY_MS = 700;
const EXPANDED_KEY = 'notes:expanded';
// Hovering a collapsed folder this long while dragging opens it.
const DRAG_EXPAND_MS = 650;
const TOAST_MS = 6000;
// Our own drag type. Deliberately not text/plain, so dropping a note on the editor
// (or another app) doesn't paste its title.
const DRAG_TYPE = 'application/x-doneyet-notes';

// ---------- Icons ----------
const ICON_PATHS = {
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    task: 'M4 5h4v4H4zM4 15h4v4H4zM11 7h9M11 17h9M5 7l1 1 2-2.5',
    note: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
    chevron: 'M9 6l6 6-6 6',
    plus: 'M12 5v14M5 12h14',
    back: 'M15 18l-6-6 6-6',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    settings: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
};

function Icon({ name, className = '' }) {
    return (
        <svg className={`notes-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICON_PATHS[name]} />
        </svg>
    );
}

// A folder's icon: the task glyph for task folders, otherwise a folder (filled with
// the folder's colour, if it has one).
function FolderIcon({ folder, className = '' }) {
    if (folder.todo_id) return <Icon name="task" className={`is-task ${className}`} />;
    return <Icon name="folder" className={`notes-folder-glyph ${className}`} />;
}

// ---------- Drag and drop ----------
// Notes and folders can be dragged onto folders (sidebar rows, folder cards,
// breadcrumbs) or onto "All notes" (the top level). The page provides the state and
// the move; components spread dnd.source(item) / dnd.target(folderId, zone) on elements.
// "Move to" pickers stay as the keyboard and touch alternative.
const DndContext = createContext(null);
const useDnd = () => useContext(DndContext);

function loadExpanded() {
    try {
        return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]'));
    } catch {
        return new Set();
    }
}

// Plain text of an editor document, for the sidebar preview after a save.
function docText(node) {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'text') return node.text ?? '';
    return (node.content ?? []).map(docText).join(node.type === 'paragraph' || node.type === 'heading' ? '' : ' ');
}

// ---------- Sidebar ----------

function FolderNode({ folder, index, depth, selection, expanded, onToggle, onSelect }) {
    const dnd = useDnd();
    const subfolders = index.children.get(folder.id) ?? [];
    const notes = index.notesIn.get(folder.id) ?? [];
    const isOpen = expanded.has(folder.id);
    const isSelected = selection.type === 'folder' && selection.id === folder.id;
    const hasChildren = subfolders.length > 0 || notes.length > 0;
    const isDropTarget = dnd.isOver(folder.id, 'tree');

    // Hovering a closed folder mid-drag opens it, so things can be dropped deeper in.
    useEffect(() => {
        if (!isDropTarget || isOpen || !hasChildren) return;
        const t = setTimeout(() => onToggle(folder.id), DRAG_EXPAND_MS);
        return () => clearTimeout(t);
    }, [isDropTarget, isOpen, hasChildren, folder.id, onToggle]);

    return (
        <li>
            <div
                className={`notes-row${isSelected ? ' is-selected' : ''}${dnd.rowClasses({ type: 'folder', id: folder.id }, folder.id, 'tree')}`}
                style={{ '--depth': depth }}
                data-folder-color={folder.color || undefined}
                {...dnd.source({ type: 'folder', id: folder.id })}
                {...dnd.target(folder.id, 'tree')}
            >
                <button
                    type="button"
                    className="notes-row-toggle"
                    aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${folder.name}`}
                    aria-expanded={isOpen}
                    onClick={() => onToggle(folder.id)}
                    disabled={!hasChildren}
                >
                    <Icon name="chevron" className={isOpen ? 'is-open' : ''} />
                </button>
                <button type="button" className="notes-row-main" onClick={() => onSelect('folder', folder.id)}>
                    <FolderIcon folder={folder} />
                    <span className="notes-row-name">{folder.name}</span>
                    <span className="notes-row-count">{countNotesDeep(index, folder.id) || ''}</span>
                </button>
            </div>
            {isOpen && hasChildren && (
                <ul className="notes-tree">
                    {subfolders.map((child) => (
                        <FolderNode
                            key={child.id}
                            folder={child}
                            index={index}
                            depth={depth + 1}
                            selection={selection}
                            expanded={expanded}
                            onToggle={onToggle}
                            onSelect={onSelect}
                        />
                    ))}
                    {notes.map((note) => (
                        <NoteRow key={note.id} note={note} depth={depth + 1} selection={selection} onSelect={onSelect} />
                    ))}
                </ul>
            )}
        </li>
    );
}

function NoteRow({ note, depth, selection, onSelect, showFolder = null }) {
    const dnd = useDnd();
    const isSelected = selection.type === 'note' && selection.id === note.id;
    const item = { type: 'note', id: note.id };
    return (
        <li>
            <div
                className={`notes-row notes-row--note${isSelected ? ' is-selected' : ''}${dnd.rowClasses(item)}`}
                style={{ '--depth': depth }}
                {...dnd.source(item)}
            >
                <span className="notes-row-toggle" aria-hidden="true" />
                <button type="button" className="notes-row-main" onClick={() => onSelect('note', note.id)}>
                    <Icon name="note" />
                    <span className="notes-row-name">{note.title}</span>
                    {showFolder && <span className="notes-row-count">{showFolder}</span>}
                </button>
            </div>
        </li>
    );
}

// ---------- Small shared pieces ----------

// "Move to" picker: every folder that can hold the item, indented by depth.
function MoveSelect({ index, value, exclude = new Set(), maxDepth = MAX_FOLDER_DEPTH, onChange, label }) {
    const options = [];
    const walk = (parentKey, depth) => {
        for (const folder of index.children.get(parentKey) ?? []) {
            if (exclude.has(folder.id)) continue;
            if (depth <= maxDepth) options.push({ folder, depth });
            walk(folder.id, depth + 1);
        }
    };
    walk('root', 1);

    return (
        <label className="notes-move">
            <span>{label}</span>
            <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">Top level</option>
                {options.map(({ folder, depth }) => (
                    <option key={folder.id} value={folder.id}>
                        {`${' '.repeat(depth - 1)}${folder.name}`}
                    </option>
                ))}
            </select>
        </label>
    );
}

// Each crumb is also a drop target: drag a card onto a parent folder to move it up.
function Breadcrumbs({ path, onSelect }) {
    const dnd = useDnd();
    return (
        <nav className="notes-crumbs" aria-label="Folder path">
            <button type="button" className={dnd.rowClasses(null, null, 'crumb')} onClick={() => onSelect(null)} {...dnd.target(null, 'crumb')}>
                All notes
            </button>
            {path.map((folder) => (
                <span key={folder.id}>
                    <span aria-hidden="true">/</span>
                    <button
                        type="button"
                        className={dnd.rowClasses(null, folder.id, 'crumb')}
                        onClick={() => onSelect('folder', folder.id)}
                        {...dnd.target(folder.id, 'crumb')}
                    >
                        {folder.name}
                    </button>
                </span>
            ))}
        </nav>
    );
}

// A subfolder (or task folder) shown as a card: opens on click, accepts drops, and
// can itself be dragged.
function FolderCard({ folder, index, onOpen, children }) {
    const dnd = useDnd();
    const count = countNotesDeep(index, folder.id);
    const item = { type: 'folder', id: folder.id };
    return (
        <button
            type="button"
            className={`notes-card notes-card--folder${folder.todo_id ? ' notes-card--task' : ''}${dnd.rowClasses(item, folder.id, 'card')}`}
            data-folder-color={folder.color || undefined}
            onClick={onOpen}
            {...dnd.source(item)}
            {...dnd.target(folder.id, 'card')}
        >
            <span className="notes-card-title"><FolderIcon folder={folder} />{folder.name}</span>
            <span className="notes-card-preview">{count} note{count === 1 ? '' : 's'}</span>
            {children}
        </button>
    );
}

// The task a folder belongs to: title, due date, priority, list and status.
function TaskCard({ folder, compact = false }) {
    const status = taskStatus(folder);
    return (
        <div className={`notes-task${compact ? ' notes-task--compact' : ''}`}>
            <Icon name="task" className="is-task" />
            <div className="notes-task-body">
                <span className="notes-task-label">{compact ? 'Notes for task' : 'Linked task'}</span>
                <span className="notes-task-title">{folder.task_title}</span>
                <span className="notes-task-meta">
                    {folder.task_due_date && <span>Due {formatDay(folder.task_due_date)}</span>}
                    {folder.task_priority && (
                        <span className="notes-task-priority">
                            <span className={`priority-dot priority-dot--${folder.task_priority}`} aria-hidden="true" />
                            {folder.task_priority[0].toUpperCase() + folder.task_priority.slice(1)}
                        </span>
                    )}
                    {folder.task_category && <span className="task-chip">{folder.task_category}</span>}
                    <span className={`notes-task-status${status.tone ? ` is-${status.tone}` : ''}`}>{status.label}</span>
                </span>
            </div>
            <Link to="/dashboard" className="link-button notes-task-open">Open in Tasks</Link>
        </div>
    );
}

function NoteCard({ note, folder = null, onOpen }) {
    const dnd = useDnd();
    const item = { type: 'note', id: note.id };
    return (
        <button type="button" className={`notes-card${dnd.rowClasses(item)}`} onClick={onOpen} {...dnd.source(item)}>
            <span className="notes-card-title">{note.title}</span>
            <span className="notes-card-preview">{note.preview || 'Empty note'}</span>
            <span className="notes-card-meta">
                {folder && (
                    <span className="notes-card-folder" data-folder-color={folder.color || undefined}>
                        {folder.color && <span className="notes-color-dot" aria-hidden="true" />}
                        {folder.name}
                    </span>
                )}
                <span>Edited {formatEdited(note.updated_at)}</span>
            </span>
        </button>
    );
}

// ---------- Task picker ----------

function TaskPicker({ open, onClose, onPick }) {
    const { authFetch } = useAuth();
    const dialogRef = useRef(null);
    const [tasks, setTasks] = useState(null);
    const [query, setQuery] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open && !dialog.open) {
            dialog.showModal();
            setQuery('');
            setError('');
            getTodos(authFetch, { limit: 300 })
                .then((data) => setTasks(data.todos))
                .catch((err) => setError(err.message));
        }
        if (!open && dialog.open) dialog.close();
    }, [open, authFetch]);

    const q = query.trim().toLowerCase();
    const shown = (tasks ?? []).filter((t) => !q || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));

    return (
        <dialog ref={dialogRef} className="notes-dialog" onClose={onClose} aria-labelledby="task-picker-title">
            <div className="notes-dialog-head">
                <h2 id="task-picker-title">Add a task to Notes</h2>
                <button type="button" className="link-button" onClick={onClose}>Close</button>
            </div>
            <p className="notes-dialog-hint">
                The task gets its own folder for planning and study notes. It stays linked, showing its due date and status.
            </p>
            <input
                type="search"
                className="notes-dialog-search"
                placeholder="Search tasks"
                aria-label="Search tasks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            {!tasks && !error && <p className="notes-dialog-hint">Loading tasks…</p>}
            {tasks && shown.length === 0 && (
                <p className="notes-dialog-hint">{tasks.length === 0 ? 'You have no tasks yet. Add one on the Tasks page.' : 'No tasks match.'}</p>
            )}
            <ul className="notes-dialog-list">
                {shown.map((task) => (
                    <li key={task.todo_id}>
                        <button type="button" className={`notes-dialog-task${task.completed ? ' is-done' : ''}`} onClick={() => onPick(task)}>
                            <span className="notes-dialog-task-title">{task.title}</span>
                            <span className="notes-dialog-task-meta">
                                <span className="task-chip">{task.category}</span>
                                {task.due_date && <span>Due {formatDay(task.due_date)}</span>}
                                {task.completed && <span>Done</span>}
                                {task.notes_folder_id && <span className="notes-dialog-badge">Has notes</span>}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </dialog>
    );
}

// ---------- Page ----------

// Notes: folders and subfolders in a sidebar, rich-text notes with images and PDFs,
// and task folders ("imported" tasks) for planning and study notes. The open note or
// folder lives in the URL (?note= / ?folder=), so the dashboard can link straight in.
function Notes() {
    const { authFetch } = useAuth();
    const [params, setParams] = useSearchParams();
    const [tree, setTree] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [actionError, setActionError] = useState('');
    const [expanded, setExpanded] = useState(loadExpanded);
    const [search, setSearch] = useState('');
    const [note, setNote] = useState(null);
    const [noteError, setNoteError] = useState('');
    const [saveStatus, setSaveStatus] = useState('idle');
    const [renamingId, setRenamingId] = useState(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [settingsId, setSettingsId] = useState(null);
    const [settingsSection, setSettingsSection] = useState('appearance');
    const [drag, setDrag] = useState(null);       // { type: 'note' | 'folder', id }
    const [over, setOver] = useState(null);       // `${zone}:${folderId ?? 'root'}`
    const [toast, setToast] = useState(null);     // { message, undo? }
    // The open note's editor (set by NoteEditor), for applying assistant edits.
    const editorRef = useRef(null);
    // An assistant edit for a note that isn't open: applied once that note loads.
    const [queuedEdit, setQueuedEdit] = useState(null); // { edit, resolve }

    const selection = useMemo(() => {
        if (params.get('note')) return { type: 'note', id: Number(params.get('note')) };
        if (params.get('folder')) return { type: 'folder', id: Number(params.get('folder')) };
        return { type: null, id: null };
    }, [params]);

    const index = useMemo(() => (tree ? indexTree(tree) : null), [tree]);

    const reloadTree = useCallback(async () => {
        try {
            setTree(await getNotesTree(authFetch));
            setLoadError('');
        } catch (err) {
            setLoadError(err.message);
        }
    }, [authFetch]);

    useEffect(() => {
        reloadTree();
    }, [reloadTree]);

    useEffect(() => {
        try {
            localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
        } catch { /* private mode: expansion just isn't remembered */ }
    }, [expanded]);

    // Open the folders above whatever is selected, so it's visible in the sidebar.
    useEffect(() => {
        if (!index || !selection.type) return;
        const folderId = selection.type === 'folder' ? selection.id : tree.notes.find((n) => n.id === selection.id)?.folder_id;
        if (!folderId) return;
        const ancestors = folderPath(index.byId, folderId).map((f) => f.id);
        if (selection.type === 'note') ancestors.push(folderId);
        setExpanded((current) => (ancestors.every((id) => current.has(id)) ? current : new Set([...current, ...ancestors])));
    }, [index, selection, tree]);

    // ----- Saving (debounced) -----
    // Pending edits for one note; flushed after a pause, on switching notes and on leave.
    const pending = useRef(null);
    const timer = useRef(null);

    const flush = useCallback(async () => {
        clearTimeout(timer.current);
        const job = pending.current;
        if (!job) return;
        pending.current = null;
        setSaveStatus('saving');
        try {
            const saved = await updateNote(authFetch, job.noteId, job.changes);
            setSaveStatus(pending.current ? 'saving' : 'saved');
            setTree((current) => current && {
                ...current,
                notes: current.notes
                    .map((n) => (n.id === saved.id
                        ? {
                            ...n,
                            title: saved.title,
                            updated_at: saved.updated_at,
                            ...(job.changes.content && { preview: docText(job.changes.content).replace(/\s+/g, ' ').trim().slice(0, 160) }),
                        }
                        : n))
                    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)),
            });
        } catch (err) {
            // Put the edits back so the next change (or leaving) retries them.
            pending.current = { noteId: job.noteId, changes: { ...job.changes, ...pending.current?.changes } };
            setSaveStatus('error');
            setNoteError(err.message);
        }
    }, [authFetch]);

    const queueSave = useCallback((noteId, changes) => {
        if (pending.current && pending.current.noteId !== noteId) flush();
        pending.current = { noteId, changes: { ...pending.current?.changes, ...changes } };
        setSaveStatus('pending');
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
    }, [flush]);

    // Warn before closing the tab with unsaved edits, and save on the way out of the page.
    useEffect(() => {
        const warn = (e) => {
            if (pending.current) {
                flush();
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', warn);
        return () => {
            window.removeEventListener('beforeunload', warn);
            flush();
        };
    }, [flush]);

    // ----- Load the selected note -----
    useEffect(() => {
        if (selection.type !== 'note') {
            setNote(null);
            return;
        }
        let cancelled = false;
        flush();
        setNote(null);
        setNoteError('');
        setSaveStatus('idle');
        getNote(authFetch, selection.id)
            .then((loaded) => !cancelled && setNote(loaded))
            .catch((err) => !cancelled && setNoteError(err.status === 404 ? 'This note no longer exists.' : err.message));
        return () => {
            cancelled = true;
        };
    }, [selection, authFetch, flush]);

    function select(type, id) {
        setActionError('');
        setParams(type ? { [type]: String(id) } : {});
    }

    const toggle = useCallback((id) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    async function run(action) {
        setActionError('');
        try {
            await action();
        } catch (err) {
            setActionError(err.message);
        }
    }

    const newNote = (folderId = null, template = null) => run(async () => {
        const created = await createNote(authFetch, { folderId, title: template?.title, content: template?.content });
        await reloadTree();
        select('note', created.id);
    });

    const newFolder = (parentId = null) => run(async () => {
        const folder = await createFolder(authFetch, { name: 'New folder', parentId });
        await reloadTree();
        setRenamingId(folder.id);
        select('folder', folder.id);
    });

    const importTask = (task) => run(async () => {
        const { folder } = await folderForTask(authFetch, task.todo_id);
        setPickerOpen(false);
        await reloadTree();
        select('folder', folder.id);
    });

    // ----- Moving (drag and drop) -----
    // Where an item currently lives: a note's folder, or a folder's parent (null = top).
    const parentOf = useCallback((item) => {
        if (!tree) return undefined;
        if (item.type === 'note') return tree.notes.find((n) => n.id === item.id)?.folder_id;
        return index.byId.get(item.id)?.parent_id;
    }, [tree, index]);

    // Whether `item` can be dropped into folder `targetId` (null = top level). Mirrors
    // the server's checks so a bad drop shows the "not allowed" cursor up front.
    const canDrop = useCallback((item, targetId) => {
        if (!item || !index) return false;
        const current = parentOf(item);
        if (current === undefined || current === targetId) return false;
        if (targetId !== null && !index.byId.has(targetId)) return false;
        if (item.type === 'note') return true;
        if (targetId === item.id || descendantIds(index.children, item.id).has(targetId)) return false;
        const targetDepth = targetId === null ? 0 : folderPath(index.byId, targetId).length;
        return targetDepth + subtreeHeight(index.children, item.id) <= MAX_FOLDER_DEPTH;
    }, [index, parentOf]);

    const showToast = useCallback((next) => setToast(next && { ...next, key: Date.now() }), []);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), TOAST_MS);
        return () => clearTimeout(t);
    }, [toast]);

    // Moves right away on screen, then saves; a failed save puts the tree back.
    const moveItem = useCallback(async (item, targetId, { undoable = true } = {}) => {
        const from = parentOf(item);
        const itemName = item.type === 'note'
            ? tree.notes.find((n) => n.id === item.id)?.title
            : index.byId.get(item.id)?.name;
        const targetName = targetId === null ? 'All notes' : index.byId.get(targetId)?.name;

        setActionError('');
        setTree((current) => current && (item.type === 'note'
            ? { ...current, notes: current.notes.map((n) => (n.id === item.id ? { ...n, folder_id: targetId } : n)) }
            : { ...current, folders: current.folders.map((f) => (f.id === item.id ? { ...f, parent_id: targetId } : f)) }));
        if (item.type === 'note') setNote((current) => (current?.id === item.id ? { ...current, folder_id: targetId } : current));
        if (targetId !== null) setExpanded((current) => (current.has(targetId) ? current : new Set([...current, targetId])));

        try {
            if (item.type === 'note') await updateNote(authFetch, item.id, { folderId: targetId });
            else await updateFolder(authFetch, item.id, { parentId: targetId });
            showToast({
                message: `Moved “${itemName}” to ${targetName}`,
                undo: undoable ? () => moveItem(item, from, { undoable: false }) : null,
            });
        } catch (err) {
            setActionError(err.message);
            showToast(null);
            await reloadTree();
            if (item.type === 'note') setNote((current) => (current?.id === item.id ? { ...current, folder_id: from } : current));
        }
    }, [authFetch, index, parentOf, reloadTree, showToast, tree]);

    // The item being dragged, set synchronously on dragstart (the `drag` state, used
    // for styling, can lag a frame behind).
    const dragRef = useRef(null);

    const endDrag = useCallback(() => {
        dragRef.current = null;
        setDrag(null);
        setOver(null);
    }, []);

    const dnd = useMemo(() => {
        const keyFor = (targetId, zone) => `${zone}:${targetId ?? 'root'}`;
        return {
            drag,
            isOver: (targetId, zone) => over === keyFor(targetId, zone),
            // Class names for a source and/or target element.
            rowClasses: (item, targetId, zone) => {
                let classes = '';
                if (item && drag && drag.type === item.type && drag.id === item.id) classes += ' is-dragging';
                if (zone && over === keyFor(targetId, zone)) classes += ' is-drop-target';
                return classes;
            },
            source: (item) => ({
                draggable: true,
                onDragStart: (e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(DRAG_TYPE, `${item.type}:${item.id}`);
                    dragRef.current = item;
                    // Styling waits until the browser has taken its drag image, so the
                    // source's "is-dragging" fade doesn't end up in the picture.
                    requestAnimationFrame(() => setDrag(dragRef.current));
                },
                onDragEnd: endDrag,
            }),
            target: (targetId, zone) => ({
                onDragOver: (e) => {
                    if (!canDrop(dragRef.current, targetId)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    const key = keyFor(targetId, zone);
                    if (over !== key) setOver(key);
                },
                onDragLeave: (e) => {
                    if (e.currentTarget.contains(e.relatedTarget)) return;
                    const key = keyFor(targetId, zone);
                    setOver((current) => (current === key ? null : current));
                },
                onDrop: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const item = dragRef.current;
                    endDrag();
                    if (canDrop(item, targetId)) moveItem(item, targetId);
                },
            }),
        };
    }, [drag, over, canDrop, moveItem, endDrag]);

    // ----- Back from connecting Google Drive -----
    // The server redirects to /notes?folder=<id>&cloud=<provider>&cloud_result=<outcome>:
    // say how it went and reopen that folder's Sync settings.
    useEffect(() => {
        const result = params.get('cloud_result');
        if (!result) return;
        const messages = {
            connected: 'Google Drive connected. You can back this folder up now.',
            cancelled: 'Connecting Google Drive was cancelled.',
            expired: 'That sign-in took too long or was already used. Try connecting again.',
            error: "Couldn't connect Google Drive. Try again.",
        };
        showToast({ message: messages[result] ?? messages.error });
        const folderId = Number(params.get('folder'));
        setParams(folderId ? { folder: String(folderId) } : {}, { replace: true });
        if (folderId) {
            setSettingsSection('sync');
            setSettingsId(folderId);
        }
    }, [params, setParams, showToast]);

    // ----- Assistant edits -----
    // Applies an edit in the editor (so Ctrl+Z undoes it and autosave saves it). For a
    // note that isn't open, opens it first. Resolves to { ok } or { error }.
    const applyAssistantEdit = (edit) => {
        if (note?.id === edit.note_id && editorRef.current) {
            return Promise.resolve(applyNoteEdit(editorRef.current, edit));
        }
        if (!tree?.notes.some((n) => n.id === edit.note_id)) {
            return Promise.resolve({ error: 'That note no longer exists.' });
        }
        return new Promise((resolve) => {
            setQueuedEdit({ edit, resolve });
            select('note', edit.note_id);
        });
    };

    useEffect(() => {
        if (!queuedEdit) return;
        if (noteError && selection.type === 'note' && selection.id === queuedEdit.edit.note_id) {
            queuedEdit.resolve({ error: noteError });
            setQueuedEdit(null);
            return;
        }
        if (note?.id !== queuedEdit.edit.note_id) return;
        const { edit, resolve } = queuedEdit;
        setQueuedEdit(null);
        // The new note's editor is mounted by now; give it a frame to settle.
        requestAnimationFrame(() => resolve(applyNoteEdit(editorRef.current, edit)));
    }, [queuedEdit, note, noteError, selection]);

    // ----- Folder settings -----
    const setFolderColor = (folderId, color) => {
        setTree((current) => current && {
            ...current,
            folders: current.folders.map((f) => (f.id === folderId ? { ...f, color } : f)),
        });
        run(async () => {
            try {
                await updateFolder(authFetch, folderId, { color });
            } catch (err) {
                await reloadTree();
                throw err;
            }
        });
    };

    // ----- Render -----
    const q = search.trim().toLowerCase();
    const searchResults = index && q
        ? tree.notes.filter((n) => n.title.toLowerCase().includes(q) || (n.preview ?? '').toLowerCase().includes(q))
        : null;

    const selectedFolder = index && selection.type === 'folder' ? index.byId.get(selection.id) : null;

    let main;
    if (loadError) {
        main = <p className="dash-error" role="alert">{loadError}</p>;
    } else if (!index) {
        main = <p className="notes-empty-hint">Loading your notes…</p>;
    } else if (selection.type === 'folder' && !selectedFolder) {
        main = <p className="notes-empty-hint">This folder no longer exists.</p>;
    } else if (selectedFolder) {
        main = (
            <FolderView
                key={selectedFolder.id}
                folder={selectedFolder}
                index={index}
                autoRename={renamingId === selectedFolder.id}
                onRenamed={() => setRenamingId(null)}
                onSelect={select}
                onNewNote={newNote}
                onNewFolder={newFolder}
                onChanged={reloadTree}
                onSettings={() => {
                    setSettingsSection('appearance');
                    setSettingsId(selectedFolder.id);
                }}
                run={run}
            />
        );
    } else if (selection.type === 'note') {
        main = noteError && !note ? (
            <p className="notes-empty-hint">{noteError}</p>
        ) : !note ? (
            <p className="notes-empty-hint">Opening note…</p>
        ) : (
            <NoteView
                key={note.id}
                note={note}
                index={index}
                saveStatus={saveStatus}
                saveError={noteError}
                onSelect={select}
                onQueue={(changes) => queueSave(note.id, changes)}
                onUpload={(file) => uploadAttachment(authFetch, note.id, file)}
                editorRef={editorRef}
                onMoved={async (folderId) => run(async () => {
                    await flush();
                    await updateNote(authFetch, note.id, { folderId });
                    await reloadTree();
                    setNote((current) => ({ ...current, folder_id: folderId }));
                })}
                onDelete={() => run(async () => {
                    if (!window.confirm(`Delete "${tree.notes.find((n) => n.id === note.id)?.title ?? note.title}"? This can't be undone.`)) return;
                    pending.current = null;
                    clearTimeout(timer.current);
                    await deleteNote(authFetch, note.id);
                    await reloadTree();
                    select(note.folder_id ? 'folder' : null, note.folder_id);
                })}
            />
        );
    } else {
        main = <Overview tree={tree} index={index} onSelect={select} onNewNote={newNote} onNewFolder={newFolder} onImport={() => setPickerOpen(true)} />;
    }

    const settingsFolder = index && settingsId ? index.byId.get(settingsId) : null;

    return (
        <DndContext.Provider value={dnd}>
        <div className={`dash notes-app${drag ? ' is-dragging-item' : ''}`}>
            <AppTopbar />
            <main className={`notes-main${selection.type ? ' has-selection' : ''}`}>
                <aside className="panel notes-sidebar" aria-label="Notes and folders">
                    <div className="panel-header">
                        <h1 className="notes-sidebar-title">Notes</h1>
                        <span className="panel-meta">{tree ? tree.notes.length : ''}</span>
                    </div>
                    <div className="notes-sidebar-actions">
                        <button type="button" className="button-primary notes-new" onClick={() => newNote(selectedFolder?.id ?? null)}>
                            <Icon name="plus" /> New note
                        </button>
                        <button type="button" className="button-ghost" onClick={() => newFolder(null)}>New folder</button>
                        <button type="button" className="button-ghost" onClick={() => setPickerOpen(true)}>Add task</button>
                    </div>
                    <label className="notes-search">
                        <Icon name="search" />
                        <input type="search" placeholder="Search notes" aria-label="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </label>

                    {index && (searchResults ? (
                        <ul className="notes-tree notes-tree--root">
                            {searchResults.length === 0 && <li className="notes-empty-hint">No notes match “{search.trim()}”.</li>}
                            {searchResults.map((n) => (
                                <NoteRow key={n.id} note={n} depth={0} selection={selection} onSelect={select} showFolder={index.byId.get(n.folder_id)?.name} />
                            ))}
                        </ul>
                    ) : (
                        <ul className="notes-tree notes-tree--root">
                            <li>
                                <div
                                    className={`notes-row${!selection.type ? ' is-selected' : ''}${dnd.rowClasses(null, null, 'tree')}`}
                                    style={{ '--depth': 0 }}
                                    {...dnd.target(null, 'tree')}
                                >
                                    <span className="notes-row-toggle" aria-hidden="true" />
                                    <button type="button" className="notes-row-main" onClick={() => select(null)}>
                                        <Icon name="note" />
                                        <span className="notes-row-name">All notes</span>
                                    </button>
                                </div>
                            </li>
                            {(index.children.get('root') ?? []).map((folder) => (
                                <FolderNode
                                    key={folder.id}
                                    folder={folder}
                                    index={index}
                                    depth={0}
                                    selection={selection}
                                    expanded={expanded}
                                    onToggle={toggle}
                                    onSelect={select}
                                />
                            ))}
                            {(index.notesIn.get('root') ?? []).map((n) => (
                                <NoteRow key={n.id} note={n} depth={0} selection={selection} onSelect={select} />
                            ))}
                        </ul>
                    ))}
                </aside>

                <section className="panel notes-content" aria-live="polite">
                    {selection.type && (
                        <button type="button" className="link-button notes-back" onClick={() => select(null)}>
                            <Icon name="back" /> All notes
                        </button>
                    )}
                    {actionError && <p className="form-error notes-action-error" role="alert">{actionError}</p>}
                    {main}
                </section>
            </main>
            <SiteFooter compact />
            <NotesAssistant
                openNote={note ? { id: note.id, title: tree?.notes.find((n) => n.id === note.id)?.title ?? note.title } : null}
                onBeforeSend={flush}
                onApply={applyAssistantEdit}
            />
            <TaskPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={importTask} />
            {settingsFolder && (
                <FolderSettings
                    key={settingsFolder.id}
                    folder={settingsFolder}
                    noteCount={countNotesDeep(index, settingsFolder.id)}
                    initialSection={settingsSection}
                    onClose={() => setSettingsId(null)}
                    onColor={(color) => setFolderColor(settingsFolder.id, color)}
                />
            )}
            {toast && (
                <div key={toast.key} className="notes-toast" role="status">
                    <span>{toast.message}</span>
                    {toast.undo && (
                        <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                                const undo = toast.undo;
                                setToast(null);
                                undo();
                            }}
                        >
                            Undo
                        </button>
                    )}
                </div>
            )}
        </div>
        </DndContext.Provider>
    );
}

// ---------- Main views ----------

function Overview({ tree, index, onSelect, onNewNote, onNewFolder, onImport }) {
    if (tree.notes.length === 0 && tree.folders.length === 0) {
        return (
            <div className="notes-empty">
                <h2>Your notes live here</h2>
                <p>
                    Keep lecture notes, plans and study guides in folders, with images and PDFs alongside.
                    Add a task to give it its own folder for planning or exam prep.
                </p>
                <div className="notes-empty-actions">
                    <button type="button" className="button-primary" onClick={() => onNewNote(null)}>Write your first note</button>
                    <button type="button" className="button-ghost" onClick={() => onNewFolder(null)}>Make a folder</button>
                    <button type="button" className="button-ghost" onClick={onImport}>Add a task</button>
                </div>
            </div>
        );
    }

    const taskFolders = tree.folders.filter((f) => f.todo_id && !f.task_completed);
    return (
        <div className="notes-overview">
            <div className="notes-view-head">
                <h2 className="notes-view-title">All notes</h2>
            </div>
            {taskFolders.length > 0 && (
                <>
                    <h3 className="notes-section-label">Task folders</h3>
                    <div className="notes-cards">
                        {taskFolders.map((f) => {
                            const status = taskStatus(f);
                            return (
                                <FolderCard key={f.id} folder={f} index={index} onOpen={() => onSelect('folder', f.id)}>
                                    <span className="notes-card-meta">
                                        <span className={`notes-task-status${status.tone ? ` is-${status.tone}` : ''}`}>{status.label}</span>
                                    </span>
                                </FolderCard>
                            );
                        })}
                    </div>
                </>
            )}
            <h3 className="notes-section-label">Recently edited</h3>
            {tree.notes.length === 0 ? (
                <p className="notes-empty-hint">No notes yet.</p>
            ) : (
                <div className="notes-cards">
                    {tree.notes.slice(0, 12).map((n) => (
                        <NoteCard key={n.id} note={n} folder={index.byId.get(n.folder_id)} onOpen={() => onSelect('note', n.id)} />
                    ))}
                </div>
            )}
        </div>
    );
}

function FolderView({ folder, index, autoRename, onRenamed, onSelect, onNewNote, onNewFolder, onChanged, onSettings, run }) {
    const { authFetch } = useAuth();
    const dnd = useDnd();
    const [name, setName] = useState(folder.name);
    const path = folderPath(index.byId, folder.id);
    const depth = path.length;
    const subfolders = index.children.get(folder.id) ?? [];
    const notes = index.notesIn.get(folder.id) ?? [];
    const inside = descendantIds(index.children, folder.id);
    const height = subtreeHeight(index.children, folder.id);
    const inputRef = useRef(null);

    useEffect(() => {
        if (autoRename) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [autoRename]);

    function saveName() {
        onRenamed();
        const trimmed = name.trim();
        if (!trimmed || trimmed === folder.name) {
            setName(folder.name);
            return;
        }
        run(async () => {
            await updateFolder(authFetch, folder.id, { name: trimmed });
            await onChanged();
        });
    }

    const total = countNotesDeep(index, folder.id);

    // The whole view is a drop target too: drag a note from the sidebar into this folder.
    return (
        <div className={`notes-folder${dnd.rowClasses(null, folder.id, 'view')}`} {...dnd.target(folder.id, 'view')}>
            <Breadcrumbs path={path.slice(0, -1)} onSelect={onSelect} />
            <div className={`notes-view-head${folder.color ? ' notes-view-head--colored' : ''}`} data-folder-color={folder.color || undefined}>
                <FolderIcon folder={folder} className="notes-view-icon" />
                <input
                    ref={inputRef}
                    className="notes-view-title notes-title-input"
                    value={name}
                    maxLength={100}
                    aria-label="Folder name"
                    onChange={(e) => setName(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') {
                            setName(folder.name);
                            e.currentTarget.blur();
                        }
                    }}
                />
                <button type="button" className="button-ghost notes-settings-button" onClick={onSettings}>
                    <Icon name="settings" /> Settings
                </button>
            </div>

            {folder.todo_id && <TaskCard folder={folder} />}

            {folder.todo_id && (
                <div className="notes-starters">
                    <span className="notes-section-label">Start a note</span>
                    <button type="button" className="button-ghost" onClick={() => onNewNote(folder.id, planTemplate(folder))}>Plan the timeline</button>
                    <button type="button" className="button-ghost" onClick={() => onNewNote(folder.id, topicsTemplate(folder))}>Topics to cover</button>
                    <button type="button" className="button-ghost" onClick={() => onNewNote(folder.id)}>Blank note</button>
                </div>
            )}

            <div className="notes-folder-actions">
                {!folder.todo_id && <button type="button" className="button-primary" onClick={() => onNewNote(folder.id)}>New note</button>}
                <button
                    type="button"
                    className="button-ghost"
                    onClick={() => onNewFolder(folder.id)}
                    disabled={depth >= MAX_FOLDER_DEPTH}
                    title={depth >= MAX_FOLDER_DEPTH ? `Folders go up to ${MAX_FOLDER_DEPTH} levels deep` : undefined}
                >
                    New subfolder
                </button>
                <MoveSelect
                    index={index}
                    value={folder.parent_id}
                    exclude={new Set([folder.id, ...inside])}
                    maxDepth={MAX_FOLDER_DEPTH - height}
                    label="Move to"
                    onChange={(parentId) => run(async () => {
                        await updateFolder(authFetch, folder.id, { parentId });
                        await onChanged();
                    })}
                />
                <button
                    type="button"
                    className="button-ghost button-danger"
                    onClick={() => run(async () => {
                        const what = [subfolders.length && `${inside.size} subfolder${inside.size === 1 ? '' : 's'}`, total && `${total} note${total === 1 ? '' : 's'}`]
                            .filter(Boolean).join(' and ');
                        if (!window.confirm(`Delete "${folder.name}"${what ? ` and the ${what} inside it` : ''}? This can't be undone.`)) return;
                        await deleteFolder(authFetch, folder.id);
                        await onChanged();
                        onSelect(folder.parent_id ? 'folder' : null, folder.parent_id);
                    })}
                >
                    Delete folder
                </button>
            </div>

            {subfolders.length === 0 && notes.length === 0 ? (
                <p className="notes-empty-hint">This folder is empty.</p>
            ) : (
                <div className="notes-cards">
                    {subfolders.map((f) => (
                        <FolderCard key={f.id} folder={f} index={index} onOpen={() => onSelect('folder', f.id)} />
                    ))}
                    {notes.map((n) => (
                        <NoteCard key={n.id} note={n} onOpen={() => onSelect('note', n.id)} />
                    ))}
                </div>
            )}
        </div>
    );
}

const SAVE_LABELS = { idle: '', pending: 'Editing…', saving: 'Saving…', saved: 'Saved', error: "Couldn't save" };

function NoteView({ note, index, saveStatus, saveError, onSelect, onQueue, onUpload, onMoved, onDelete, editorRef }) {
    const [title, setTitle] = useState(note.title === 'Untitled note' ? '' : note.title);
    const path = note.folder_id ? folderPath(index.byId, note.folder_id) : [];
    const taskFolder = note.folder_id ? taskFolderFor(index.byId, note.folder_id) : null;
    const titleRef = useRef(null);

    // New, untitled notes start with the cursor in the title.
    useEffect(() => {
        if (note.title === 'Untitled note') titleRef.current?.focus();
    }, [note.title]);

    return (
        <article className="notes-note">
            <div className="notes-note-bar">
                <Breadcrumbs path={path} onSelect={onSelect} />
                <span className={`notes-save${saveStatus === 'error' ? ' is-error' : ''}`} role="status" title={saveStatus === 'error' ? saveError : undefined}>
                    {SAVE_LABELS[saveStatus]}
                </span>
            </div>

            {taskFolder && <TaskCard folder={taskFolder} compact />}

            <input
                ref={titleRef}
                className="notes-note-title notes-title-input"
                value={title}
                placeholder="Untitled note"
                maxLength={200}
                aria-label="Note title"
                onChange={(e) => {
                    setTitle(e.target.value);
                    onQueue({ title: e.target.value.trim() || 'Untitled note' });
                }}
                onKeyDown={(e) => {
                    // Enter jumps to the start of the body, like most note apps.
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const editor = editorRef.current;
                        if (!editor) return;
                        // Focus right away (the command alone waits a frame, so fast
                        // typing would still land in the title), then place the cursor.
                        editor.view.focus();
                        editor.commands.focus('start');
                    }
                }}
            />

            <NoteEditor
                initialContent={note.content}
                onChange={(content) => onQueue({ content })}
                onUpload={onUpload}
                editorRef={editorRef}
            />

            <div className="notes-note-footer">
                <MoveSelect index={index} value={note.folder_id} label="Folder" onChange={onMoved} />
                <button type="button" className="button-ghost button-danger" onClick={onDelete}>Delete note</button>
            </div>
        </article>
    );
}

export default Notes;
