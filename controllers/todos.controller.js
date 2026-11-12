import pool from '../db/pool.js';
import { DATE_PATTERN, PRIORITIES, parseTodoFields, validateTitle } from '../utils/validation.js';

// The moment a reminder should go out: (due date - N days) at the given local time in
// the user's timezone. Postgres does the conversion so DST is handled correctly.
async function computeRemindAt(dueDate, reminder) {
    if (!reminder) return null;
    const result = await pool.query(
        'SELECT (($1::date - $2::int) + $3::time) AT TIME ZONE $4 AS remind_at',
        [dueDate, reminder.daysBefore, reminder.time, reminder.timezone]
    );
    return result.rows[0].remind_at;
}

const REMINDER_PASSED_MESSAGE = 'That reminder time has already passed. Pick a later one.';

// Reads the client's local date (?today=YYYY-MM-DD) so "due today"/"overdue" match the
// user's calendar rather than the server's; null falls back to the DB's CURRENT_DATE.
function parseToday(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// Builds the WHERE clause for getTodos from the optional query filters. Values are
// always passed as parameters, never interpolated into the SQL.
function buildTodoFilters(userId, query) {
    const conditions = ['user_id = $1'];
    const values = [userId];
    const add = (sql, value) => {
        values.push(value);
        conditions.push(sql.replace('?', `$${values.length}`));
    };

    if (query.category) add('category = ?', query.category);

    // ?priority=high,medium
    const priorities = String(query.priority || '')
        .split(',')
        .filter((p) => PRIORITIES.includes(p));
    if (priorities.length > 0) add('priority = ANY(?)', priorities);

    // ?search= matches anywhere in the title, case-insensitively. Escape LIKE
    // wildcards so "%" or "_" are searched for literally.
    const search = String(query.search || '').trim();
    if (search) add('title ILIKE ?', `%${search.replace(/[\\%_]/g, '\\$&')}%`);

    // ?dueFrom= / ?dueTo= (inclusive). Tasks without a due date are excluded once a
    // range is set.
    if (DATE_PATTERN.test(query.dueFrom)) add('due_date >= ?::date', query.dueFrom);
    if (DATE_PATTERN.test(query.dueTo)) add('due_date <= ?::date', query.dueTo);

    return { where: conditions.join(' AND '), values };
}

// The calendar asks for up to 1000 tasks at once; nothing needs more.
const MAX_PAGE_SIZE = 1000;
const MAX_PAGE = 100000;

// Whole number from a query string, at least 1 and at most `max`, or `fallback` if it
// isn't one. Stops ?limit=100000000 dumping everything and ?page=-1 crashing the query.
function parsePositiveInt(value, fallback, max) {
    const number = parseInt(value, 10);
    if (!Number.isInteger(number) || number < 1) return fallback;
    return Math.min(number, max);
}

// Gets the authenticated user's todos. Optional filters: ?category=, ?priority=,
// ?search=, ?dueFrom=, ?dueTo=. Open tasks come first, soonest due date first, then newest.
const getTodos = async (req, res, next) => {
    try {
        const page = parsePositiveInt(req.query.page, 1, MAX_PAGE);
        const limit = parsePositiveInt(req.query.limit, 10, MAX_PAGE_SIZE);
        const offset = (page - 1) * limit;
        const { where, values } = buildTodoFilters(req.user.id, req.query);

        const result = await pool.query(
            `SELECT * FROM todos WHERE ${where}`
            + ' ORDER BY completed, due_date NULLS LAST, created_at DESC, todo_id DESC'
            + ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, offset]
        );

        const totalTodos = await pool.query(
            `SELECT COUNT(*) FROM todos WHERE ${where}`,
            values
        );

        const total = parseInt(totalTodos.rows[0].count);

        res.status(200).json({
            message: "Todos fetched successfully",
            todos: result.rows,
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        next(err);
    }
};

// Dashboard summary across all of the user's todos: totals, due/overdue counts,
// open-task priority breakdown, and per-list progress.
const getTodoStats = async (req, res, next) => {
    try {
        const today = parseToday(req.query.today);

        const summary = await pool.query(
            'SELECT'
            + ' COUNT(*) AS total,'
            + ' COUNT(*) FILTER (WHERE completed) AS completed,'
            + ' COUNT(*) FILTER (WHERE NOT completed AND due_date = COALESCE($2::date, CURRENT_DATE)) AS due_today,'
            + ' COUNT(*) FILTER (WHERE NOT completed AND due_date < COALESCE($2::date, CURRENT_DATE)) AS overdue,'
            + " COUNT(*) FILTER (WHERE NOT completed AND priority = 'high') AS high,"
            + " COUNT(*) FILTER (WHERE NOT completed AND priority = 'medium') AS medium,"
            + " COUNT(*) FILTER (WHERE NOT completed AND priority = 'low') AS low"
            + ' FROM todos WHERE user_id = $1',
            [req.user.id, today]
        );

        const lists = await pool.query(
            'SELECT category AS name, COUNT(*) AS total, COUNT(*) FILTER (WHERE completed) AS completed'
            + ' FROM todos WHERE user_id = $1 GROUP BY category ORDER BY category',
            [req.user.id]
        );

        // Next open tasks with a due date (overdue ones sort first).
        const upcoming = await pool.query(
            'SELECT todo_id, title, due_date, priority, category FROM todos'
            + ' WHERE user_id = $1 AND NOT completed AND due_date IS NOT NULL'
            + ' ORDER BY due_date, todo_id LIMIT 5',
            [req.user.id]
        );

        const row = summary.rows[0];

        res.status(200).json({
            message: "Todo stats fetched successfully",
            total: parseInt(row.total),
            completed: parseInt(row.completed),
            dueToday: parseInt(row.due_today),
            overdue: parseInt(row.overdue),
            priorities: {
                high: parseInt(row.high),
                medium: parseInt(row.medium),
                low: parseInt(row.low)
            },
            lists: lists.rows.map((list) => ({
                name: list.name,
                total: parseInt(list.total),
                completed: parseInt(list.completed)
            })),
            upcoming: upcoming.rows
        });
    } catch (err) {
        next(err);
    }
};

// Creates a new todo for the user.
const createTodo = async (req, res, next) => {
    try {

        const { title, completed } = req.body;

        const titleError = validateTitle(title);
        if (titleError) {
            return res.status(400).json({ message: titleError });
        }
        if (completed !== undefined && completed !== null && typeof completed !== "boolean") {
            return res.status(400).json({ message: "completed must be true or false" });
        }

        const fields = parseTodoFields(req.body);
        if (fields.error) {
            return res.status(400).json({ message: fields.error });
        }

        const remindAt = await computeRemindAt(fields.dueDate, fields.reminder);
        if (remindAt && remindAt <= new Date()) {
            return res.status(400).json({ message: REMINDER_PASSED_MESSAGE });
        }
        const reminder = fields.reminder ?? {};

        // COALESCE keeps the column default (false) when `completed` is omitted.
        const todo = await pool.query(
            'INSERT INTO todos (user_id, title, description, completed, due_date, priority, category,'
            + ' reminder_days_before, reminder_time, reminder_timezone, remind_at)'
            + ' VALUES ($1, $2, $3, COALESCE($4, false), $5, $6, $7, $8, $9, $10, $11) RETURNING *',
            [req.user.id, title.trim(), fields.description, completed, fields.dueDate, fields.priority, fields.category,
                reminder.daysBefore ?? null, reminder.time ?? null, reminder.timezone ?? null, remindAt]
        );

        res.status(201).json({
            message: "Todo created successfully",
            todo: todo.rows[0]
        });
    } catch (err) {
        next(err);
    }
};

// Update (put) an existing todo for the user. PUT replaces every field, so omitted
// optional fields fall back to their defaults.
const updateTodo = async (req, res, next) => {
    try {

        const { title, completed } = req.body;

        const titleError = validateTitle(title);
        if (titleError) {
            return res.status(400).json({ message: titleError });
        }
        if (completed !== undefined && completed !== null && typeof completed !== "boolean") {
            return res.status(400).json({ message: "completed must be true or false" });
        }

        const fields = parseTodoFields(req.body);
        if (fields.error) {
            return res.status(400).json({ message: fields.error });
        }

        const existing = await pool.query(
            'SELECT remind_at, reminder_sent_at FROM todos WHERE todo_id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({
                message: "Todo not found"
            });
        }

        // Only a changed reminder is checked against the clock, so saving other edits
        // (e.g. ticking the task off) still works after a reminder has gone out. A
        // changed reminder is re-armed by clearing reminder_sent_at.
        const remindAt = await computeRemindAt(fields.dueDate, fields.reminder);
        const previous = existing.rows[0];
        const reminderChanged = (remindAt?.getTime() ?? null) !== (previous.remind_at?.getTime() ?? null);
        if (reminderChanged && remindAt && remindAt <= new Date()) {
            return res.status(400).json({ message: REMINDER_PASSED_MESSAGE });
        }
        const sentAt = reminderChanged ? null : previous.reminder_sent_at;
        const reminder = fields.reminder ?? {};

        // COALESCE keeps the current completed state if the client leaves it out.
        const updated = await pool.query(
            'UPDATE todos SET title = $1, description = $2, completed = COALESCE($3, completed),'
            + ' due_date = $4, priority = $5, category = $6,'
            + ' reminder_days_before = $7, reminder_time = $8, reminder_timezone = $9,'
            + ' remind_at = $10, reminder_sent_at = $11, updated_at = NOW()'
            + ' WHERE todo_id = $12 AND user_id = $13 RETURNING *',
            [title.trim(), fields.description, completed, fields.dueDate,
                fields.priority, fields.category,
                reminder.daysBefore ?? null, reminder.time ?? null, reminder.timezone ?? null,
                remindAt, sentAt, req.params.id, req.user.id]
        );

        if (updated.rows.length === 0) {
            return res.status(404).json({
                message: "Todo not found"
            });
        }
        res.status(200).json({
            message: "Todo updated successfully",
            todo: updated.rows[0]
        });
    } catch (err) {
        next(err);
    }
};

// Renames one of the user's lists by moving all of its todos to the new name.
// Renaming to a name that already exists merges the two lists.
const renameList = async (req, res, next) => {
    try {
        const newName = typeof req.body.name === 'string' ? req.body.name.trim() : '';

        if (!newName) {
            return res.status(400).json({ message: "List name is required" });
        }
        if (newName.length > 50) {
            return res.status(400).json({ message: "List name must be 50 characters or fewer" });
        }

        const renamed = await pool.query(
            'UPDATE todos SET category = $1, updated_at = NOW() WHERE user_id = $2 AND category = $3',
            [newName, req.user.id, req.params.name]
        );

        if (renamed.rowCount === 0) {
            return res.status(404).json({ message: "List not found" });
        }

        res.status(200).json({
            message: "List renamed successfully",
            name: newName,
            updated: renamed.rowCount
        });
    } catch (err) {
        next(err);
    }
};

// Delete an existing todo for the user.
const deleteTodo = async (req, res, next) => {
    try {

        const deleted = await pool.query(
            'DELETE FROM todos WHERE todo_id = $1 AND user_id = $2 RETURNING *',
            [req.params.id, req.user.id]
        );

        if (deleted.rows.length === 0) {
            return res.status(404).json({
                message: "Todo not found"
            });
        }

        res.status(200).json({
            message: "Todo deleted successfully",
            todo: deleted.rows[0]
        });
    } catch (err) {
        next(err);
    }
};

export {
    getTodos,
    getTodoStats,
    createTodo,
    updateTodo,
    renameList,
    deleteTodo
}
