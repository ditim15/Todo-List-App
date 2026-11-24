import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AppTopbar from '../components/AppTopbar';
import NotesPanel from '../components/notes/NotesPanel';
import { folderForTask } from '../api/notes';
import { createTodo, getTodoStats, getTodos, localToday, renameList, updateTodo } from '../api/todos';
import { ReminderBadge, ReminderField, ReminderPicker } from '../components/tasks/reminders';
import { DEFAULT_REMINDER_TIME, isDayPast, nextAvailableTime, reminderMoment } from '../components/tasks/reminderUtils';
import CalendarView from '../components/tasks/CalendarView';
import { RepeatBadge, RepeatField, RepeatPicker } from '../components/tasks/repeat';
import { fitRepeatUntil, repeatPreviews } from '../components/tasks/repeatUtils';
import { PRIORITIES, PrioritySelect } from '../components/tasks/PrioritySelect';
import Assistant from '../components/assistant/Assistant';
import SiteFooter from '../components/SiteFooter';
import { isSameMonth, localeFirstDayOfWeek, monthGrid, monthOf } from '../components/tasks/calendarUtils';
import './static/Dashboard.css';

const TASK_PAGE_SIZE = 50;

// How long a just-completed task stays in place before moving to the Completed section.
const COMPLETE_MOVE_DELAY_MS = 1500;

const SEARCH_DEBOUNCE_MS = 300;

// The calendar asks for every task due in the visible weeks (at most 6), not a page.
const CALENDAR_TASK_LIMIT = 1000;

// Which task view (list or calendar) the user last picked, remembered per browser.
const VIEW_STORAGE_KEY = 'nudge:task-view';

function loadSavedView() {
    try {
        return localStorage.getItem(VIEW_STORAGE_KEY) === 'calendar' ? 'calendar' : 'list';
    } catch {
        return 'list';
    }
}

function saveView(view) {
    try {
        localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
        // Storage blocked (private mode etc.): the choice just isn't remembered.
    }
}

const EMPTY_FILTERS = { search: '', priorities: [], dueFrom: '', dueTo: '' };

function hasActiveFilters(filters) {
    return Boolean(
        filters.search.trim() || filters.priorities.length > 0 || filters.dueFrom || filters.dueTo
    );
}

// Time-of-day greeting based on the user's local clock.
function getWeekday() {
    return new Date().toLocaleDateString(undefined, { weekday: 'long' });
}

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

// Toolbar above the task list: one quiet row (title search + a Filters button), with
// priority and due-date filters in a panel that opens on demand, at every width.
// Filters apply within the selected list.
// `showDueRange` is off in the calendar, where the month itself is the date range.
function TaskFilters({ filters, onChange, onClear, showDueRange = true }) {
    const update = (changes) => onChange({ ...filters, ...changes });
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const priorityLabelId = useId();
    const dueLabelId = useId();
    const activeCount = filters.priorities.length + (showDueRange && (filters.dueFrom || filters.dueTo) ? 1 : 0);
    const canClear = showDueRange ? hasActiveFilters(filters) : hasActiveFilters({ ...filters, dueFrom: '', dueTo: '' });

    function togglePriority(key) {
        const priorities = filters.priorities.includes(key)
            ? filters.priorities.filter((p) => p !== key)
            : [...filters.priorities, key];
        update({ priorities });
    }

    return (
        <div className={`filters${open ? ' filters--open' : ''}`} role="search" aria-label="Filter tasks">
            <div className="filters-bar">
                <input
                    className="filters-search"
                    type="search"
                    placeholder="Search tasks"
                    aria-label="Search tasks by name"
                    value={filters.search}
                    onChange={(e) => update({ search: e.target.value })}
                />
                {canClear && (
                    <button type="button" className="link-button filters-clear" onClick={onClear}>
                        Clear
                    </button>
                )}
                <button
                    type="button"
                    className="filters-toggle"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpen(!open)}
                >
                    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                        <path d="M3 6h14M6 10h8M8.5 14h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Filters
                    {activeCount > 0 && (
                        <span className="filters-count">
                            {activeCount}
                            <span className="visually-hidden"> active</span>
                        </span>
                    )}
                </button>
            </div>
            {open && (
                <div className="filters-panel" id={panelId}>
                    <div className="filter-group" role="group" aria-labelledby={priorityLabelId}>
                        <span className="filter-label" id={priorityLabelId}>Priority</span>
                        <div className="filter-chips">
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
                    </div>
                    {showDueRange && (
                        <div className="filter-group" role="group" aria-labelledby={dueLabelId}>
                            <span className="filter-label" id={dueLabelId}>Due</span>
                            <div className="filter-dates">
                                <input
                                    type="date"
                                    aria-label="Due from"
                                    value={filters.dueFrom}
                                    max={filters.dueTo || undefined}
                                    onChange={(e) => update({ dueFrom: e.target.value })}
                                />
                                <span className="filter-dates-sep" aria-hidden="true">to</span>
                                <input
                                    type="date"
                                    aria-label="Due to"
                                    value={filters.dueTo}
                                    min={filters.dueFrom || undefined}
                                    onChange={(e) => update({ dueTo: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Compact inline form for adding a task to the current (or a new) list. In the
// calendar, `defaultDueDate` is the selected day, and `onDueDateChange` moves the
// selection when the user picks a different date here, so the two always match.
function AddTaskForm({ defaultList, defaultDueDate = '', onDueDateChange, onCreate }) {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState(defaultList ?? '');
    const [priority, setPriority] = useState('medium');
    const [dueDate, setDueDate] = useState(defaultDueDate);
    // Days before the due date (null = none). The time defaults to 9:00 AM; a time
    // field appears next to the reminder once one is picked.
    const [reminderDays, setReminderDays] = useState(null);
    const [reminderTime, setReminderTime] = useState(DEFAULT_REMINDER_TIME);
    // Repeat: rule '' = doesn't repeat; `until` is the last date a copy may be due.
    const [repeat, setRepeat] = useState({ rule: '', until: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    // Keeps the repeat valid when the due date changes: no date means no repeat, and the
    // end date stays on or after the due date and within a year of it.
    function fitRepeat(nextDueDate) {
        setRepeat((current) => (nextDueDate && current.rule
            ? { rule: current.rule, until: fitRepeatUntil(nextDueDate, current.rule, current.until) }
            : { rule: '', until: '' }));
    }

    // Follow the selected list so new tasks land where the user is looking.
    useEffect(() => {
        setCategory(defaultList ?? '');
    }, [defaultList]);

    // Follow the selected calendar day. A reminder picked for another date may not fit,
    // so it's cleared, unless the change came from this form's own date field (which
    // already checked the reminder against the new date).
    const dueDateRef = useRef(dueDate);
    dueDateRef.current = dueDate;
    useEffect(() => {
        if (defaultDueDate === dueDateRef.current) return;
        setDueDate(defaultDueDate);
        setReminderDays(null);
        fitRepeat(defaultDueDate);
    }, [defaultDueDate]);

    // Picking a reminder day keeps the chosen time when it's still ahead; for today, a
    // time that has already passed starts at the next minute (any later time can be set).
    function chooseReminderDays(days) {
        setReminderDays(days);
        if (days !== null) setReminderTime((time) => nextAvailableTime(dueDate, days, time));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!title.trim()) return;

        const moment = dueDate && reminderDays !== null ? reminderMoment(dueDate, reminderDays, reminderTime) : null;
        if (moment && moment <= new Date()) {
            setError('That reminder time has already passed. Pick a later one.');
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            await onCreate({
                title: title.trim(),
                category: category.trim() || undefined,
                priority,
                due_date: dueDate || null,
                reminder_days_before: dueDate ? reminderDays : null,
                reminder_time: dueDate && reminderDays !== null ? reminderTime : null,
                recurrence: dueDate && repeat.rule ? repeat.rule : null,
                recurrence_until: dueDate && repeat.rule ? repeat.until : null,
            });
            setTitle('');
            setDueDate(defaultDueDate);
            setReminderDays(null);
            setReminderTime(DEFAULT_REMINDER_TIME);
            setRepeat({ rule: '', until: '' });
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
                className="add-task-date"
                type="date"
                aria-label="Due date"
                value={dueDate}
                onChange={(e) => {
                    const next = e.target.value;
                    setDueDate(next);
                    // Drop a reminder whose day the new date puts in the past (or that has
                    // no date); if only the time has passed today, move it later.
                    if (!next || (reminderDays !== null && isDayPast(next, reminderDays))) {
                        setReminderDays(null);
                    } else if (reminderDays !== null) {
                        setReminderTime((time) => nextAvailableTime(next, reminderDays, time));
                    }
                    fitRepeat(next);
                    // Clearing the field doesn't move the calendar; there's no day to show.
                    if (next) onDueDateChange?.(next);
                }}
            />
            <div className="add-task-reminder">
                <ReminderField
                    compact
                    dueDate={dueDate}
                    days={reminderDays}
                    time={reminderTime}
                    onDaysChange={chooseReminderDays}
                    onTimeChange={setReminderTime}
                />
            </div>
            <div className="add-task-repeat">
                <RepeatField dueDate={dueDate} rule={repeat.rule} until={repeat.until} onChange={setRepeat} />
            </div>
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
    const [repeat, setRepeat] = useState({ rule: todo.recurrence ?? '', until: todo.recurrence_until ?? '' });
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
                recurrence: dueDate && repeat.rule ? repeat.rule : null,
                recurrence_until: dueDate && repeat.rule ? repeat.until : null,
            });
        } catch (err) {
            setError(err.message);
            setIsSaving(false);
        }
    }

    function changeDueDate(next) {
        setDueDate(next);
        setRepeat((current) => (next && current.rule
            ? { rule: current.rule, until: fitRepeatUntil(next, current.rule, current.until) }
            : { rule: '', until: '' }));
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
                    <input type="date" value={dueDate} onChange={(e) => changeDueDate(e.target.value)} />
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
                <div className="task-edit-reminder">
                    <label htmlFor="repeat-rule">
                        <span>Repeat</span>
                    </label>
                    <RepeatPicker dueDate={dueDate} rule={repeat.rule} until={repeat.until} onChange={setRepeat} />
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
function NotesIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />
        </svg>
    );
}

function TaskItem({ todo, today, isEditing, isSettling, isNext, onToggle, onEdit, onCancelEdit, onSave, onOpenNotes }) {
    const isOverdue = !todo.completed && todo.due_date && todo.due_date < today;
    const priority = PRIORITIES.find((p) => p.key === todo.priority);
    const classes = ['task'];
    if (todo.completed) classes.push('task--done');
    if (isSettling) classes.push('task--settling');
    if (isNext) classes.push('task--next');
    if (isEditing) classes.push('task--editing');

    return (
        <li className={classes.join(' ')}>
            {/* The label pads the small box out to a full tap target. */}
            <label className="task-check-hit">
                <input
                    type="checkbox"
                    className="task-check"
                    checked={todo.completed}
                    onChange={() => onToggle(todo)}
                    aria-label={`Mark "${todo.title}" as ${todo.completed ? 'not done' : 'done'}`}
                />
            </label>
            {isEditing ? (
                <TaskEditForm todo={todo} onSave={onSave} onCancel={onCancelEdit} />
            ) : (
                <>
                    <div className="task-body">
                        <span className="task-title"><span className="task-title-text">{todo.title}</span></span>
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
                            {!todo.completed && <RepeatBadge todo={todo} />}
                        </span>
                    </div>
                    {/* Opens the task's notes folder (adding the task to Notes the first time). */}
                    <button
                        type="button"
                        className={`task-notes-button${todo.notes_folder_id ? ' has-notes' : ''}`}
                        onClick={() => onOpenNotes(todo)}
                        aria-label={todo.notes_folder_id ? `Open notes for "${todo.title}"` : `Add notes for "${todo.title}"`}
                        title={todo.notes_folder_id ? 'Open notes' : 'Add notes'}
                    >
                        <NotesIcon />
                    </button>
                    <button
                        type="button"
                        className="task-edit-button"
                        onClick={() => onEdit(todo.todo_id)}
                        aria-label={`Edit "${todo.title}"`}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 20h4L19 9l-4-4L4 16z" />
                            <path d="M13.5 6.5l4 4" />
                        </svg>
                        <span className="task-edit-label">Edit</span>
                    </button>
                </>
            )}
        </li>
    );
}

// Due-date range the calendar needs for `month`: every day in its visible weeks.
function calendarRange(month, firstDayOfWeek) {
    const weeks = monthGrid(month, firstDayOfWeek);
    return { dueFrom: weeks[0][0], dueTo: weeks[weeks.length - 1][6] };
}

const VIEWS = [
    { key: 'list', label: 'List' },
    { key: 'calendar', label: 'Calendar' },
];

// List / Calendar switch in the task panel header.
function ViewToggle({ view, onChange }) {
    return (
        <div className="view-toggle" role="group" aria-label="Task view">
            {VIEWS.map((v) => (
                <button
                    key={v.key}
                    type="button"
                    className={`view-toggle-option${view === v.key ? ' is-active' : ''}`}
                    aria-pressed={view === v.key}
                    onClick={() => onChange(v.key)}
                >
                    <ViewIcon view={v.key} />
                    {v.label}
                </button>
            ))}
        </div>
    );
}

function ViewIcon({ view }) {
    return (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            {view === 'list' ? (
                <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
            ) : (
                <>
                    <rect x="2" y="3" width="12" height="11" rx="2" />
                    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
                </>
            )}
        </svg>
    );
}

// Authenticated landing page after login/register. Only reachable via ProtectedRoute.
// Layout: top bar, greeting + stat tiles, then lists (left) / tasks (center) /
// priority + upcoming (right).
function Dashboard() {
    const { user, authFetch } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [todos, setTodos] = useState([]);
    // Calendar only: the open copy of each repeating task, so the calendar can draw the
    // series' later dates as previews (see repeatPreviews).
    const [repeatingTodos, setRepeatingTodos] = useState([]);
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
    // 'list' or 'calendar'. The calendar shows one month ('YYYY-MM-01') and lists the
    // selected day's tasks under it.
    const [view, setView] = useState(loadSavedView);
    const [calendarMonth, setCalendarMonth] = useState(() => monthOf(localToday()));
    const [selectedDay, setSelectedDay] = useState(localToday);
    const firstDayOfWeek = useMemo(localeFirstDayOfWeek, []);
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
            const range = view === 'calendar'
                ? calendarRange(calendarMonth, firstDayOfWeek)
                : { dueFrom: filters.dueFrom, dueTo: filters.dueTo };
            const todoData = await getTodos(authFetch, {
                limit: view === 'calendar' ? CALENDAR_TASK_LIMIT : TASK_PAGE_SIZE,
                category: selectedList ?? undefined,
                priorities: filters.priorities,
                search: debouncedSearch,
                ...range,
            });
            // Due by the end of the grid: an open copy due before the month can still have
            // later dates inside it. Same list and filters as the tasks themselves.
            const repeatingData = view === 'calendar'
                ? await getTodos(authFetch, {
                    limit: CALENDAR_TASK_LIMIT,
                    category: selectedList ?? undefined,
                    priorities: filters.priorities,
                    search: debouncedSearch,
                    dueTo: range.dueTo,
                    repeating: 'open',
                })
                : { todos: [] };
            if (requestId !== latestRequest.current) return;

            setStats(statsData);
            setTodos(todoData.todos);
            setRepeatingTodos(repeatingData.todos);
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
    }, [selectedList, debouncedSearch, priorityKey, filters.dueFrom, filters.dueTo, view, calendarMonth]);

    // Selects a calendar day, switching months if it's outside the one on screen (e.g. a
    // date typed into the add-task form).
    function selectCalendarDay(day) {
        setSelectedDay(day);
        setCalendarMonth(monthOf(day));
        setEditingId(null);
    }

    function changeView(next) {
        setView(next);
        saveView(next);
        setEditingId(null);
    }

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

    // Opens a task's notes folder, creating it ("importing" the task) the first time.
    async function handleOpenNotes(todo) {
        try {
            const folderId = todo.notes_folder_id ?? (await folderForTask(authFetch, todo.todo_id)).folder.id;
            navigate(`/notes?folder=${folderId}`);
        } catch (err) {
            setError(err.message);
        }
    }

    const today = localToday();

    const firstName = user?.name?.split(' ')[0];
    const isCalendar = view === 'calendar';
    // Later dates of repeating tasks inside the visible weeks, drawn as previews.
    const calendarPreviews = isCalendar
        ? (({ dueFrom, dueTo }) => repeatPreviews(repeatingTodos, dueFrom, dueTo))(calendarRange(calendarMonth, firstDayOfWeek))
        : [];
    // The calendar ignores the due-date range filter (the month is the range).
    const filtersActive = hasActiveFilters(isCalendar ? { ...filters, dueFrom: '', dueTo: '' } : filters);
    const monthTaskCount = isCalendar
        ? todos.filter((t) => t.due_date && isSameMonth(t.due_date, calendarMonth)).length
        : 0;
    const openTodos = todos.filter((t) => !t.completed || settlingIds.has(t.todo_id));
    const completedTodos = todos.filter((t) => t.completed && !settlingIds.has(t.todo_id));
    // Open tasks grouped like a handout's sections: Today (overdue first), Coming up
    // (dated, soonest first) and No due date. Each group keeps the server's order for ties.
    const byDue = (a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0);
    const taskGroups = [
        { key: 'today', title: 'Today', todos: openTodos.filter((t) => t.due_date && t.due_date <= today).sort(byDue) },
        { key: 'upcoming', title: 'Coming up', todos: openTodos.filter((t) => t.due_date && t.due_date > today).sort(byDue) },
        { key: 'undated', title: 'No due date', todos: openTodos.filter((t) => !t.due_date) },
    ].filter((group) => group.todos.length > 0);
    // The one open task to do next (the first in Today) gets the highlighter.
    const nextId = taskGroups[0]?.key === 'today'
        ? taskGroups[0].todos.find((t) => !t.completed)?.todo_id
        : undefined;

    function renderTask(todo) {
        return (
            <TaskItem
                key={todo.todo_id}
                todo={todo}
                today={today}
                isEditing={editingId === todo.todo_id}
                isSettling={settlingIds.has(todo.todo_id)}
                isNext={todo.todo_id === nextId}
                onToggle={handleToggle}
                onEdit={setEditingId}
                onCancelEdit={() => setEditingId(null)}
                onSave={handleSave}
                onOpenNotes={handleOpenNotes}
            />
        );
    }

    return (
        <div className="dash">
            <AppTopbar />

            <main className="dash-main">
                <section className="intro">
                    <div className="intro-text">
                        {/* Date-led, like a handout's title: today's count carries the highlighter. */}
                        <h1>
                            {getWeekday()}.{' '}
                            {stats && stats.dueToday > 0 && (
                                <span className="hl">{stats.dueToday} {stats.dueToday === 1 ? 'thing' : 'things'} today.</span>
                            )}
                            {stats && stats.dueToday === 0 && 'Nothing due today.'}
                        </h1>
                        <p className="intro-summary">
                            {getGreeting()}{firstName ? `, ${firstName}` : ''}.{' '}
                            {status === 'loading' && 'Loading your tasks...'}
                            {status === 'error' && !stats && "We couldn't load your tasks."}
                            {stats && stats.total === 0 && getSummary(stats)}
                            {stats && stats.total > 0 && `${stats.completed} of ${stats.total} done.`}
                        </p>
                    </div>
                </section>

                {error && <p className="dash-error" role="alert">{error}</p>}

                {stats && (
                    <div className="dash-grid">
                        <div className="lists-column">
                            <ListsPanel
                                stats={stats}
                                selectedList={selectedList}
                                onSelect={setSelectedList}
                                onRename={handleRenameList}
                            />
                            <NotesPanel />
                        </div>

                        <section className="panel tasks-panel" aria-labelledby="tasks-heading">
                            <div className="panel-header tasks-panel-header">
                                <div className="tasks-panel-title">
                                    <h2 id="tasks-heading">{selectedList ?? 'All tasks'}</h2>
                                    <span className="panel-meta">
                                        {isCalendar
                                            ? `${pluralizeTasks(monthTaskCount)} ${filtersActive ? 'matching ' : ''}this month`
                                            : todoTotal > todos.length
                                                ? `Showing ${todos.length} of ${todoTotal}`
                                                : filtersActive
                                                    ? `${todoTotal} matching`
                                                    : pluralizeTasks(todoTotal)}
                                    </span>
                                </div>
                                <ViewToggle view={view} onChange={changeView} />
                            </div>

                            {!isCalendar && <AddTaskForm defaultList={selectedList} onCreate={handleCreate}/>}
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
                                    showDueRange={!isCalendar}
                                />
                            )}

                            {isCalendar ? (
                                <div className="task-scroll">
                                    <CalendarView
                                        month={calendarMonth}
                                        selectedDay={selectedDay}
                                        today={today}
                                        todos={todos}
                                        previews={calendarPreviews}
                                        firstDayOfWeek={firstDayOfWeek}
                                        onMonthChange={setCalendarMonth}
                                        onSelectDay={selectCalendarDay}
                                        renderTask={renderTask}
                                    >
                                        <AddTaskForm
                                            defaultList={selectedList}
                                            defaultDueDate={selectedDay}
                                            onDueDateChange={selectCalendarDay}
                                            onCreate={handleCreate}
                                        />
                                    </CalendarView>
                                    <p className="calendar-hint">Tasks without a due date only appear in List view.</p>
                                </div>
                            ) : todos.length === 0 ? (
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
                                        taskGroups.map((group) => (
                                            <section key={group.key} className={`task-group task-group--${group.key}`} aria-labelledby={`task-group-${group.key}`}>
                                                <h3 id={`task-group-${group.key}`} className="task-group-title">
                                                    {group.title}
                                                    <span className="task-group-count">{group.todos.length}</span>
                                                </h3>
                                                <ul className="task-list">{group.todos.map(renderTask)}</ul>
                                            </section>
                                        ))
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
            <SiteFooter compact />
            <Assistant onTaskAdded={loadDashboard} listsDatalistId={LISTS_DATALIST_ID} />
        </div>
    );
}

export default Dashboard;
