import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { createTodo, getTodoStats, getTodos, localToday, updateTodo } from '../api/todos';
import './static/Dashboard.css';

const PRIORITIES = [
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
];

const TASK_PAGE_SIZE = 50;

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

// Left column: "All tasks" plus one row per list, each with a count and progress bar.
// Clicking a row filters the task panel to that list.
function ListsPanel({ stats, selectedList, onSelect }) {
    const rows = [
        { name: null, label: 'All tasks', total: stats.total, completed: stats.completed },
        ...stats.lists.map((list) => ({ ...list, label: list.name })),
    ];

    return (
        <aside className="panel lists-panel" aria-labelledby="lists-heading">
            <div className="panel-header">
                <h2 id="lists-heading">My lists</h2>
                <span className="panel-meta">{stats.lists.length}</span>
            </div>
            <ul className="list-rows">
                {rows.map((list) => {
                    const isActive = list.name === selectedList;
                    return (
                        <li key={list.label}>
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

// Compact inline form for adding a task to the current (or a new) list.
function AddTaskForm({ lists, defaultList, onCreate }) {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState(defaultList ?? '');
    const [priority, setPriority] = useState('medium');
    const [dueDate, setDueDate] = useState('');
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
            });
            setTitle('');
            setDueDate('');
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
                list="dashboard-lists"
                value={category}
                maxLength={50}
                onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="dashboard-lists">
                {lists.map((list) => (
                    <option key={list.name} value={list.name} />
                ))}
            </datalist>
            <select
                aria-label="Priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
            >
                {PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>
                        {p.label}
                    </option>
                ))}
            </select>
            <input
                type="date"
                aria-label="Due date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
            />
            <button type="submit" disabled={isSaving || !title.trim()}>
                {isSaving ? 'Adding...' : 'Add'}
            </button>
            {error && <p className="form-error">{error}</p>}
        </form>
    );
}

function TaskItem({ todo, today, onToggle }) {
    const isOverdue = !todo.completed && todo.due_date && todo.due_date < today;
    const priority = PRIORITIES.find((p) => p.key === todo.priority);

    return (
        <li className={`task${todo.completed ? ' task--done' : ''}`}>
            <input
                type="checkbox"
                className="task-check"
                checked={todo.completed}
                onChange={() => onToggle(todo)}
                aria-label={`Mark "${todo.title}" as ${todo.completed ? 'not done' : 'done'}`}
            />
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
                </span>
            </div>
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
    // Only the most recent load may update state, so a slow earlier response (or the
    // StrictMode double-run) can't overwrite newer data.
    const latestRequest = useRef(0);

    async function loadDashboard(list) {
        const requestId = ++latestRequest.current;
        try {
            // Sequential on purpose: two concurrent requests with an expired access token
            // would both try to rotate the same refresh token, and the second would fail.
            const statsData = await getTodoStats(authFetch);
            const todoData = await getTodos(authFetch, {
                limit: TASK_PAGE_SIZE,
                category: list ?? undefined,
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
        loadDashboard(selectedList);
        // authFetch is recreated every render; reload only when the selected list changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedList]);

    async function handleCreate(fields) {
        await createTodo(authFetch, fields);
        await loadDashboard(selectedList);
    }

    async function handleToggle(todo) {
        // Optimistic: flip it immediately, then reload so counts and progress update.
        setTodos((current) =>
            current.map((t) => (t.todo_id === todo.todo_id ? { ...t, completed: !t.completed } : t))
        );
        let failure = null;
        try {
            await updateTodo(authFetch, todo.todo_id, { ...todo, completed: !todo.completed });
        } catch (err) {
            failure = err;
        }
        // Reloading also reverts the optimistic flip if the update failed.
        await loadDashboard(selectedList);
        if (failure) setError(failure.message);
    }

    function handleLogout() {
        logout();
        navigate('/login');
    }

    const today = localToday();
    const firstName = user?.name?.split(' ')[0];

    return (
        <div className="dash">
            <header className="topbar">
                <span className="topbar-brand">Todo</span>
                <div className="topbar-user">
                    {user?.name && <span className="topbar-name">{user.name}</span>}
                    <button type="button" className="button-ghost" onClick={handleLogout}>
                        Log out
                    </button>
                </div>
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
                        />

                        <section className="panel tasks-panel" aria-labelledby="tasks-heading">
                            <div className="panel-header">
                                <h2 id="tasks-heading">{selectedList ?? 'All tasks'}</h2>
                                <span className="panel-meta">
                                    {todoTotal > todos.length
                                        ? `Showing ${todos.length} of ${todoTotal}`
                                        : pluralizeTasks(todoTotal)}
                                </span>
                            </div>

                            <AddTaskForm
                                lists={stats.lists}
                                defaultList={selectedList}
                                onCreate={handleCreate}
                            />

                            {todos.length === 0 ? (
                                <div className="tasks-empty">
                                    <p className="tasks-empty-title">
                                        {stats.total === 0 ? 'Create your first task' : 'No tasks in this list'}
                                    </p>
                                    <p>
                                        {stats.total === 0
                                            ? 'Type a task above, pick a list and priority, and press Add.'
                                            : 'Add one above, or choose another list.'}
                                    </p>
                                </div>
                            ) : (
                                <ul className="task-list">
                                    {todos.map((todo) => (
                                        <TaskItem
                                            key={todo.todo_id}
                                            todo={todo}
                                            today={today}
                                            onToggle={handleToggle}
                                        />
                                    ))}
                                </ul>
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
