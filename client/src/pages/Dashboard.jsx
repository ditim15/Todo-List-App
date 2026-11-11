import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AccountMenu from '../components/account/AccountMenu';
import NudgeLogo from '../components/brand/NudgeLogo';
import { createTodo, getTodoStats, getTodos, localToday, renameList, updateTodo } from '../api/todos';
import { ReminderBadge, ReminderPicker, ReminderSelect } from '../components/tasks/reminders';
import { DEFAULT_REMINDER_TIME, reminderMoment } from '../components/tasks/reminderUtils';
import './static/Dashboard.css';

const PRIORITIES = [
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
];

const TASK_PAGE_SIZE = 50;

// How long a just-completed task stays in place before moving to the Completed section.
const COMPLETE_MOVE_DELAY_MS = 1500;

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_FILTERS = { search: '', priorities: [], dueFrom: '', dueTo: '' };

function hasActiveFilters(filters) {
    return Boolean(
        filters.search.trim() || filters.priorities.length > 0 || filters.dueFrom || filters.dueTo
    );
}

// Time-of-day greeting based on the user's local clock.
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

function pluralizeTasks(count) {
    return `${count} ${count === 1 ? 'task' : 'tasks'}`;
}

// One-line summary under the greeting.
function getSummary(stats) {
    if (stats.total === 0) {
        return "You don't have any tasks yet. Create your first one below to get started.";
    }
    const { dueToday, overdue } = stats;
    if (dueToday > 0 && overdue > 0) {
        return `You have ${pluralizeTasks(dueToday)} due today and ${overdue} overdue.`;
    }
    if (dueToday > 0) return `You have ${pluralizeTasks(dueToday)} due today.`;
    if (overdue > 0) return `You have ${pluralizeTasks(overdue)} overdue.`;
    return "Nothing due today and nothing overdue. You're all caught up.";
}

// Formats a 'YYYY-MM-DD' due date relative to today. The string is split manually
// because `new Date('YYYY-MM-DD')` parses as UTC and can shift the day.
function formatDueDate(dueDate, today) {
    if (dueDate === today) return 'Due today';

    const [year, month, day] = dueDate.split('-').map(Number);
    const label = new Date(year, month - 1, day).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });

    return dueDate < today ? `Overdue · ${label}` : `Due ${label}`;
}

function percent(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function ProgressBar({ value, max, label }) {
    return (
        <div
            className="progress"
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={value}
        >
            <div className="progress-fill" style={{ width: `${percent(value, max)}%` }} />
        </div>
    );
}

function StatTile({ label, value, detail, tone }) {
    return (
        <div className="stat-tile">
            <span className="stat-label">
                {tone && <span className={`stat-dot stat-dot--${tone}`} aria-hidden="true" />}
                {label}
            </span>
            <span className="stat-value">{value}</span>
            {detail && <span className="stat-detail">{detail}</span>}
        </div>
    );
}

// One list's name as an editable field (used in the My lists panel's edit mode).
// Saves on Enter or when the field loses focus; Esc reverts.
function ListRenameRow({ list, onRename }) {
    const [name, setName] = useState(list.name);
    const [error, setError] = useState('');
    // Enter saves and the field may then blur; this stops the second save.
    const isSaving = useRef(false);

    async function save() {
        const trimmed = name.trim();
        if (isSaving.current) return;
        if (!trimmed || trimmed === list.name) {
            setName(list.name);
            setError('');
            return;
        }

        isSaving.current = true;
        setError('');
        try {
            // On success the panel re-renders with the new name and this row is replaced.
            await onRename(list.name, trimmed);
        } catch (err) {
            setError(err.message);
        } finally {
            isSaving.current = false;
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            setName(list.name);
            setError('');
            e.currentTarget.blur();
        }
    }

    return (
        <li className="list-rename">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    save();
                }}
            >
                <input
                    type="text"
                    value={name}
                    maxLength={50}
                    aria-label={`Rename list "${list.name}"`}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={save}
                    onKeyDown={handleKeyDown}
                />
                <span className="list-row-count">{list.total}</span>
            </form>
            {error && <p className="form-error">{error}</p>}
        </li>
    );
}

// Left column: "All tasks" plus one row per list, each with a count and progress bar.
// Clicking a row filters the task panel to that list. "Edit" switches the rows to
// rename fields.
function ListsPanel({ stats, selectedList, onSelect, onRename }) {
    const [editMode, setEditMode] = useState(false);
    // Leave edit mode automatically if there's nothing left to rename.
    const isEditing = editMode && stats.lists.length > 0;
    const rows = [
        { name: null, label: 'All tasks', total: stats.total, completed: stats.completed },
        ...stats.lists.map((list) => ({ ...list, label: list.name })),
    ];

    return (
        <aside className="panel lists-panel" aria-labelledby="lists-heading">
            <div className="panel-header">
                <h2 id="lists-heading">My lists</h2>
                {stats.lists.length > 0 ? (
                    <button
                        type="button"
                        className="link-button"
                        aria-pressed={isEditing}
                        onClick={() => setEditMode(!isEditing)}
                    >
                        {isEditing ? 'Done' : 'Edit'}
                    </button>
                ) : (
                    <span className="panel-meta">0</span>
                )}
            </div>

            {isEditing ? (
                <>
                    <ul className="list-rows list-rows--editing">
                        {stats.lists.map((list) => (
                            <ListRenameRow key={list.name} list={list} onRename={onRename} />
                        ))}
                    </ul>
                    <p className="panel-hint">
                        Press Enter to save. Renaming a list to an existing name merges them.
                    </p>
                </>
            ) : (
            <ul className="list-rows">
                {rows.map((list) => {
                    const isActive = list.name === selectedList;
                    return (
                        <li key={list.name ?? '__all__'}>
                            <button
                                type="button"
                                className={`list-row${isActive ? ' list-row--active' : ''}`}
                                aria-pressed={isActive}
                                onClick={() => onSelect(list.name)}
                            >
                                <span className="list-row-top">
                                    <span className="list-row-name">{list.label}</span>
                                    <span className="list-row-count">
                                        {list.completed}/{list.total}
                                    </span>
                                </span>
                                <ProgressBar
                                    value={list.completed}
                                    max={list.total}
                                    label={`${list.label}: ${list.completed} of ${list.total} done`}
                                />
                            </button>
                        </li>
                    );
                })}
            </ul>
            )}
            {stats.lists.length === 0 && (
                <p className="panel-hint">
                    Lists appear here once you add a task to one, e.g. "Work" or "Personal".
                </p>
            )}
        </aside>
    );
}

// Open tasks by priority: a stacked bar plus a color-coded legend with counts.
function PriorityPanel({ priorities }) {
    const open = priorities.high + priorities.medium + priorities.low;

    return (
        <section className="panel" aria-labelledby="priority-heading">
            <div className="panel-header">
                <h2 id="priority-heading">Priority</h2>
                <span className="panel-meta">{open} open</span>
            </div>
            <div className="priority-bar" aria-hidden="true">
                {PRIORITIES.filter((p) => priorities[p.key] > 0).map((p) => (
                    <span
                        key={p.key}
                        className={`priority-segment priority-segment--${p.key}`}
                        style={{ flexGrow: priorities[p.key] }}
                        title={`${p.label}: ${pluralizeTasks(priorities[p.key])} (${percent(priorities[p.key], open)}%)`}
                    />
                ))}
            </div>
            <ul className="priority-legend">
                {PRIORITIES.map((p) => (
                    <li key={p.key}>
                        <span className={`priority-dot priority-dot--${p.key}`} aria-hidden="true" />
                        <span className="priority-legend-label">{p.label}</span>
                        <span className="priority-legend-count">{priorities[p.key]}</span>
                        <span className="priority-legend-pct">{percent(priorities[p.key], open)}%</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

// Next few open tasks with a due date, across all lists.
function UpcomingPanel({ upcoming, today }) {
    return (
        <section className="panel upcoming-panel" aria-labelledby="upcoming-heading">
            <div className="panel-header">
                <h2 id="upcoming-heading">Coming up</h2>
            </div>
            {upcoming.length === 0 ? (
                <p className="panel-hint">Tasks with a due date will show up here.</p>
            ) : (
                <ul className="upcoming-list">
                    {upcoming.map((todo) => (
                        <li key={todo.todo_id}>
                            <span className={`priority-dot priority-dot--${todo.priority}`} aria-hidden="true" />
                            <span className="upcoming-title">{todo.title}</span>
                            <span
                                className={`upcoming-due${todo.due_date < today ? ' is-overdue' : ''}`}
                            >
                                {formatDueDate(todo.due_date, today)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

// Shared suggestions for every "List" input (the add form and edit forms).
const LISTS_DATALIST_ID = 'dashboard-lists';

function PrioritySelect({ value, onChange }) {
    return (
        <select aria-label="Priority" value={value} onChange={(e) => onChange(e.target.value)}>
            {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                    {p.label}
                </option>
            ))}
        </select>
    );
}

// Toolbar above the task list: title search, priority toggles and a due-date range.
// Filters apply within the selected list.
function TaskFilters({ filters, onChange, onClear }) {
    const update = (changes) => onChange({ ...filters, ...changes });

    function togglePriority(key) {
        const priorities = filters.priorities.includes(key)
            ? filters.priorities.filter((p) => p !== key)
            : [...filters.priorities, key];
        update({ priorities });
    }

    return (
        <div className="filters" role="search" aria-label="Filter tasks">
            <input
                className="filters-search"
                type="search"
                placeholder="Search tasks"
                aria-label="Search tasks by name"
                value={filters.search}
                onChange={(e) => update({ search: e.target.value })}
            />
            <div className="filter-chips" role="group" aria-label="Filter by priority">
                {PRIORITIES.map((p) => {
                    const isOn = filters.priorities.includes(p.key);
                    return (
                        <button
                            key={p.key}
                            type="button"
                            className={`filter-chip${isOn ? ' filter-chip--on' : ''}`}
                            aria-pressed={isOn}
                            onClick={() => togglePriority(p.key)}
                        >
                            <span className={`priority-dot priority-dot--${p.key}`} aria-hidden="true" />
                            {p.label}
                        </button>
                    );
                })}
            </div>
            <div className="filter-dates" role="group" aria-label="Due date range">
                <span className="filter-dates-label">Due</span>
                <input
                    type="date"
                    aria-label="Due from"
                    value={filters.dueFrom}
                    max={filters.dueTo || undefined}
                    onChange={(e) => update({ dueFrom: e.target.value })}
                />
                <span className="filter-dates-sep" aria-hidden="true">–</span>
                <input
                    type="date"
                    aria-label="Due to"
                    value={filters.dueTo}
                    min={filters.dueFrom || undefined}
                    onChange={(e) => update({ dueTo: e.target.value })}
                />
            </div>
            {hasActiveFilters(filters) && (
                <button type="button" className="link-button filters-clear" onClick={onClear}>
                    Clear
                </button>
            )}
        </div>
    );
}

// Compact inline form for adding a task to the current (or a new) list.
function AddTaskForm({ defaultList, onCreate }) {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState(defaultList ?? '');
    const [priority, setPriority] = useState('medium');
    const [dueDate, setDueDate] = useState('');
    // Days before the due date (null = none). The time defaults to 9:00 AM here and
    // can be changed by editing the task.
    const [reminderDays, setReminderDays] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    // Follow the selected list so new tasks land where the user is looking.
    useEffect(() => {
        setCategory(defaultList ?? '');
    }, [defaultList]);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!title.trim()) return;

        setIsSaving(true);
        setError('');
        try {
            await onCreate({
                title: title.trim(),
                category: category.trim() || undefined,
                priority,
                due_date: dueDate || null,
                reminder_days_before: dueDate ? reminderDays : null,
                reminder_time: dueDate && reminderDays !== null ? DEFAULT_REMINDER_TIME : null,
            });
            setTitle('');
            setDueDate('');
            setReminderDays(null);
            setPriority('medium');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <form className="add-task" onSubmit={handleSubmit}>
            <input
                className="add-task-title"
                type="text"
                placeholder="Add a task..."
                aria-label="Task title"
                value={title}
                maxLength={255}
                onChange={(e) => setTitle(e.target.value)}
            />
            <input
                type="text"
                placeholder="List"
                aria-label="List"
                list={LISTS_DATALIST_ID}
                value={category}
                maxLength={50}
                onChange={(e) => setCategory(e.target.value)}
            />
            <PrioritySelect value={priority} onChange={setPriority} />
            <input
                type="date"
                aria-label="Due date"
                value={dueDate}
                onChange={(e) => {
                    const next = e.target.value;
                    setDueDate(next);
                    // Drop a reminder the new date makes impossible (or that has no date).
                    const moment = reminderMoment(next, reminderDays, DEFAULT_REMINDER_TIME);
                    if (!next || (moment && moment <= new Date())) setReminderDays(null);
                }}
            />
            <ReminderSelect
                compact
                dueDate={dueDate}
                days={reminderDays}
                time={DEFAULT_REMINDER_TIME}
                onChange={setReminderDays}
            />
            <button type="submit" disabled={isSaving || !title.trim()}>
                {isSaving ? 'Adding...' : 'Add'}
            </button>
            {error && <p className="form-error">{error}</p>}
        </form>
    );
}

// Inline editor that replaces a task's details while editing. Esc cancels.
function TaskEditForm({ todo, onSave, onCancel }) {
    const [title, setTitle] = useState(todo.title);
    const [description, setDescription] = useState(todo.description ?? '');
    const [category, setCategory] = useState(todo.category);
    const [priority, setPriority] = useState(todo.priority);
    const [dueDate, setDueDate] = useState(todo.due_date ?? '');
    const [reminder, setReminder] = useState({
        days: todo.reminder_days_before ?? null,
        // Postgres returns TIME as 'HH:MM:SS'; the time input wants 'HH:MM'.
        time: todo.reminder_time?.slice(0, 5) ?? DEFAULT_REMINDER_TIME,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const activeReminder = dueDate && reminder.days !== null ? reminder : null;
    // Only a new or changed reminder has to be in the future; an untouched one that
    // already went out can stay as it is.
    const originalMoment = reminderMoment(todo.due_date, todo.reminder_days_before, todo.reminder_time?.slice(0, 5));
    const nextMoment = activeReminder ? reminderMoment(dueDate, reminder.days, reminder.time) : null;
    const reminderChanged = (nextMoment?.getTime() ?? null) !== (originalMoment?.getTime() ?? null);
    const reminderInPast = reminderChanged && nextMoment !== null && nextMoment <= new Date();

    async function handleSubmit(e) {
        e.preventDefault();
        if (!title.trim()) {
            setError('Title is required');
            return;
        }
        if (reminderInPast) {
            setError('That reminder time has already passed. Pick a later one.');
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            await onSave(todo, {
                title: title.trim(),
                description: description.trim() || null,
                category: category.trim() || undefined,
                priority,
                due_date: dueDate || null,
                reminder_days_before: activeReminder ? activeReminder.days : null,
                reminder_time: activeReminder ? activeReminder.time : null,
            });
        } catch (err) {
            setError(err.message);
            setIsSaving(false);
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') onCancel();
    }

    return (
        <form className="task-edit" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
            <input
                className="task-edit-title"
                type="text"
                aria-label="Task title"
                value={title}
                maxLength={255}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
                className="task-edit-description"
                aria-label="Description"
                placeholder="Description (optional)"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />
            <div className="task-edit-fields">
                <label>
                    <span>List</span>
                    <input
                        type="text"
                        list={LISTS_DATALIST_ID}
                        placeholder="General"
                        value={category}
                        maxLength={50}
                        onChange={(e) => setCategory(e.target.value)}
                    />
                </label>
                <label>
                    <span>Priority</span>
                    <PrioritySelect value={priority} onChange={setPriority} />
                </label>
                <label>
                    <span>Due date</span>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
                <div className="task-edit-reminder">
                    <label htmlFor="reminder-days">
                        <span>Email reminder</span>
                    </label>
                    <ReminderPicker
                        dueDate={dueDate}
                        days={dueDate ? reminder.days : null}
                        time={reminder.time}
                        onChange={setReminder}
                        sentAt={todo.reminder_sent_at}
                        checkPast={reminderChanged}
                    />
                </div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="task-edit-actions">
                <button type="button" className="button-ghost" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="button-primary" disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
    );
}

// `isSettling`: just checked off; shown as done in place briefly before it moves to
// the Completed section, so an accidental click can be undone.
function TaskItem({ todo, today, isEditing, isSettling, onToggle, onEdit, onCancelEdit, onSave }) {
    const isOverdue = !todo.completed && todo.due_date && todo.due_date < today;
    const priority = PRIORITIES.find((p) => p.key === todo.priority);
    const classes = ['task'];
    if (todo.completed) classes.push('task--done');
    if (isSettling) classes.push('task--settling');
    if (isEditing) classes.push('task--editing');

    return (
        <li className={classes.join(' ')}>
            <input
                type="checkbox"
                className="task-check"
                checked={todo.completed}
                onChange={() => onToggle(todo)}
                aria-label={`Mark "${todo.title}" as ${todo.completed ? 'not done' : 'done'}`}
            />
            {isEditing ? (
                <TaskEditForm todo={todo} onSave={onSave} onCancel={onCancelEdit} />
            ) : (
                <>
                    <div className="task-body">
                        <span className="task-title">{todo.title}</span>
                        {todo.description && <span className="task-description">{todo.description}</span>}
                        <span className="task-meta">
                            <span className="task-chip">{todo.category}</span>
                            {priority && (
                                <span className="task-priority">
                                    <span className={`priority-dot priority-dot--${priority.key}`} aria-hidden="true" />
                                    {priority.label}
                                </span>
                            )}
                            {todo.due_date && (
                                <span className={`task-due${isOverdue ? ' is-overdue' : ''}`}>
                                    {todo.completed ? 'Done' : formatDueDate(todo.due_date, today)}
                                </span>
                            )}
                            <ReminderBadge todo={todo} />
                        </span>
                    </div>
                    <button
                        type="button"
                        className="task-edit-button"
                        onClick={() => onEdit(todo.todo_id)}
                        aria-label={`Edit "${todo.title}"`}
                    >
                        Edit
                    </button>
                </>
            )}
        </li>
    );
}

// Authenticated landing page after login/register. Only reachable via ProtectedRoute.
// Layout: top bar, greeting + stat tiles, then lists (left) / tasks (center) /
// priority + upcoming (right).
function Dashboard() {
    const { user, authFetch, logout } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [todos, setTodos] = useState([]);
    const [todoTotal, setTodoTotal] = useState(0);
    const [selectedList, setSelectedList] = useState(null);
    const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [showCompleted, setShowCompleted] = useState(true);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    // Search is applied after typing pauses, so each keystroke doesn't hit the server.
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // Ids of tasks just checked off that stay in the open list until their timer fires.
    const [settlingIds, setSettlingIds] = useState(() => new Set());
    const settleTimers = useRef(new Map());
    // Only the most recent load may update state, so a slow earlier response (or the
    // StrictMode double-run) can't overwrite newer data.
    const latestRequest = useRef(0);

    // Clear pending move timers if the dashboard unmounts.
    useEffect(() => {
        const timers = settleTimers.current;
        return () => timers.forEach((timer) => clearTimeout(timer));
    }, []);

    function setSettling(id, isSettling) {
        clearTimeout(settleTimers.current.get(id));
        settleTimers.current.delete(id);

        if (isSettling) {
            settleTimers.current.set(id, setTimeout(() => setSettling(id, false), COMPLETE_MOVE_DELAY_MS));
        }

        setSettlingIds((current) => {
            const next = new Set(current);
            if (isSettling) next.add(id);
            else next.delete(id);
            return next;
        });
    }

    // Loads stats plus the task list for the current list and filters.
    async function loadDashboard() {
        const requestId = ++latestRequest.current;
        try {
            // Sequential on purpose: two concurrent requests with an expired access token
            // would both try to rotate the same refresh token, and the second would fail.
            const statsData = await getTodoStats(authFetch);
            const todoData = await getTodos(authFetch, {
                limit: TASK_PAGE_SIZE,
                category: selectedList ?? undefined,
                priorities: filters.priorities,
                search: debouncedSearch,
                dueFrom: filters.dueFrom,
                dueTo: filters.dueTo,
            });
            if (requestId !== latestRequest.current) return;

            setStats(statsData);
            setTodos(todoData.todos);
            setTodoTotal(todoData.total);
            setError('');
            setStatus('ready');
        } catch (err) {
            if (requestId !== latestRequest.current) return;
            setError(err.message);
            setStatus('error');
        }
    }

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(filters.search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [filters.search]);

    // Reload whenever the list or an applied filter changes. The priorities array is
    // joined so the effect compares by value, not by array identity.
    const priorityKey = filters.priorities.join(',');
    useEffect(() => {
        loadDashboard();
        // authFetch is recreated every render, so it's deliberately not a dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedList, debouncedSearch, priorityKey, filters.dueFrom, filters.dueTo]);

    async function handleCreate(fields) {
        await createTodo(authFetch, fields);
        await loadDashboard();
    }

    // Throws on failure so the rename field can show the error.
    async function handleRenameList(oldName, newName) {
        await renameList(authFetch, oldName, newName);
        if (selectedList === oldName) {
            setSelectedList(newName); // triggers the reload effect
        } else {
            await loadDashboard();
        }
    }

    async function handleToggle(todo) {
        const completed = !todo.completed;

        // Optimistic: flip it immediately. A newly completed task lingers in place
        // (settling) before moving to Completed; un-checking it cancels the move.
        setTodos((current) =>
            current.map((t) => (t.todo_id === todo.todo_id ? { ...t, completed } : t))
        );
        setSettling(todo.todo_id, completed);

        let failure = null;
        try {
            await updateTodo(authFetch, todo.todo_id, { ...todo, completed });
        } catch (err) {
            failure = err;
            setSettling(todo.todo_id, false);
        }
        // Reload so counts and progress update; this also reverts the flip on failure.
        await loadDashboard();
        if (failure) setError(failure.message);
    }

    // Throws on failure so the edit form can show the error and stay open.
    async function handleSave(todo, fields) {
        await updateTodo(authFetch, todo.todo_id, { ...todo, ...fields });
        setEditingId(null);
        await loadDashboard();
    }

    function handleLogout() {
        logout();
        navigate('/login');
    }

    const today = localToday();
    const firstName = user?.name?.split(' ')[0];
    const filtersActive = hasActiveFilters(filters);
    const openTodos = todos.filter((t) => !t.completed || settlingIds.has(t.todo_id));
    const completedTodos = todos.filter((t) => t.completed && !settlingIds.has(t.todo_id));

    function renderTask(todo) {
        return (
            <TaskItem
                key={todo.todo_id}
                todo={todo}
                today={today}
                isEditing={editingId === todo.todo_id}
                isSettling={settlingIds.has(todo.todo_id)}
                onToggle={handleToggle}
                onEdit={setEditingId}
                onCancelEdit={() => setEditingId(null)}
                onSave={handleSave}
            />
        );
    }

    return (
        <div className="dash">
            <header className="topbar">
                <Link to="/" className="topbar-brand">
                    <NudgeLogo animate="intro" />
                </Link>
                <AccountMenu user={user} onLogout={handleLogout} />
            </header>

            <main className="dash-main">
                <section className="intro">
                    <div className="intro-text">
                        <h1>
                            {getGreeting()}{firstName ? `, ${firstName}` : ''}
                        </h1>
                        <p className="intro-summary">
                            {status === 'loading' && 'Loading your tasks...'}
                            {status === 'error' && !stats && "We couldn't load your tasks."}
                            {stats && getSummary(stats)}
                        </p>
                    </div>
                    {stats && stats.total > 0 && (
                        <div className="stat-tiles">
                            <StatTile
                                label="Due today"
                                value={stats.dueToday}
                                tone={stats.dueToday > 0 ? 'warning' : null}
                            />
                            <StatTile
                                label="Overdue"
                                value={stats.overdue}
                                tone={stats.overdue > 0 ? 'critical' : null}
                            />
                            <StatTile
                                label="Completed"
                                value={`${percent(stats.completed, stats.total)}%`}
                                detail={`${stats.completed} of ${stats.total}`}
                            />
                        </div>
                    )}
                </section>

                {error && <p className="dash-error" role="alert">{error}</p>}

                {stats && (
                    <div className="dash-grid">
                        <ListsPanel
                            stats={stats}
                            selectedList={selectedList}
                            onSelect={setSelectedList}
                            onRename={handleRenameList}
                        />

                        <section className="panel tasks-panel" aria-labelledby="tasks-heading">
                            <div className="panel-header">
                                <h2 id="tasks-heading">{selectedList ?? 'All tasks'}</h2>
                                <span className="panel-meta">
                                    {todoTotal > todos.length
                                        ? `Showing ${todos.length} of ${todoTotal}`
                                        : filtersActive
                                            ? `${todoTotal} matching`
                                            : pluralizeTasks(todoTotal)}
                                </span>
                            </div>

                            <AddTaskForm defaultList={selectedList} onCreate={handleCreate} />
                            <datalist id={LISTS_DATALIST_ID}>
                                {stats.lists.map((list) => (
                                    <option key={list.name} value={list.name} />
                                ))}
                            </datalist>

                            {stats.total > 0 && (
                                <TaskFilters
                                    filters={filters}
                                    onChange={setFilters}
                                    onClear={() => setFilters(EMPTY_FILTERS)}
                                />
                            )}

                            {todos.length === 0 ? (
                                <div className="tasks-empty">
                                    {stats.total === 0 ? (
                                        <>
                                            <p className="tasks-empty-title">Create your first task</p>
                                            <p>Type a task above, pick a list and priority, and press Add.</p>
                                        </>
                                    ) : filtersActive ? (
                                        <>
                                            <p className="tasks-empty-title">No tasks match these filters</p>
                                            <button
                                                type="button"
                                                className="link-button"
                                                onClick={() => setFilters(EMPTY_FILTERS)}
                                            >
                                                Clear filters
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <p className="tasks-empty-title">No tasks in this list</p>
                                            <p>Add one above, or choose another list.</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="task-scroll">
                                    {openTodos.length > 0 ? (
                                        <ul className="task-list">{openTodos.map(renderTask)}</ul>
                                    ) : (
                                        <p className="tasks-all-done">
                                            {filtersActive
                                                ? 'No open tasks match these filters.'
                                                : 'All done here. Every task in this list is complete.'}
                                        </p>
                                    )}

                                    {completedTodos.length > 0 && (
                                        <section className="completed-section" aria-label="Completed tasks">
                                            <button
                                                type="button"
                                                className="completed-toggle"
                                                aria-expanded={showCompleted}
                                                onClick={() => setShowCompleted((open) => !open)}
                                            >
                                                <span className="completed-chevron" aria-hidden="true" />
                                                Completed
                                                <span className="completed-count">{completedTodos.length}</span>
                                            </button>
                                            {showCompleted && (
                                                <ul className="task-list">{completedTodos.map(renderTask)}</ul>
                                            )}
                                        </section>
                                    )}
                                </div>
                            )}
                        </section>

                        <div className="side-column">
                            <PriorityPanel priorities={stats.priorities} />
                            <UpcomingPanel upcoming={stats.upcoming} today={today} />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default Dashboard;
