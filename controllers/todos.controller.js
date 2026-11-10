import pool from '../db/pool.js';

const PRIORITIES = ['low', 'medium', 'high'];
const DEFAULT_CATEGORY = 'General';

// Normalises the optional fields shared by create/update. Returns { error } when the
// input is invalid so the caller can send a 400.
function parseTodoFields(body) {
    const priority = body.priority ?? 'medium';
    if (!PRIORITIES.includes(priority)) {
        return { error: `Priority must be one of: ${PRIORITIES.join(', ')}` };
    }

    const category = typeof body.category === 'string' && body.category.trim() !== ''
        ? body.category.trim()
        : DEFAULT_CATEGORY;
    if (category.length > 50) {
        return { error: 'List name must be 50 characters or fewer' };
    }

    return { priority, category, dueDate: body.due_date || null };
}

// Reads the client's local date (?today=YYYY-MM-DD) so "due today"/"overdue" match the
// user's calendar rather than the server's; null falls back to the DB's CURRENT_DATE.
function parseToday(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

// Gets the authenticated user's todos. Optional filters: ?category=, ?priority=,
// ?search=, ?dueFrom=, ?dueTo=. Open tasks come first, soonest due date first, then newest.
const getTodos = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
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

        const { title, description, completed } = req.body;

        if (!title || title.trim() === "") {
            return res.status(400).json({
                message: "Title is required"
            });
        }

        const fields = parseTodoFields(req.body);
        if (fields.error) {
            return res.status(400).json({ message: fields.error });
        }

        // COALESCE keeps the column default (false) when `completed` is omitted.
        const todo = await pool.query(
            'INSERT INTO todos (user_id, title, description, completed, due_date, priority, category)'
            + ' VALUES ($1, $2, $3, COALESCE($4, false), $5, $6, $7) RETURNING *',
            [req.user.id, title.trim(), description, completed, fields.dueDate, fields.priority, fields.category]
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

        const { title, description, completed } = req.body;

        if (!title || title.trim() === "") {
            return res.status(400).json({
                message: "Title is required"
            });
        }

        const fields = parseTodoFields(req.body);
        if (fields.error) {
            return res.status(400).json({ message: fields.error });
        }

        // COALESCE keeps the current completed state if the client leaves it out.
        const updated = await pool.query(
            'UPDATE todos SET title = $1, description = $2, completed = COALESCE($3, completed),'
            + ' due_date = $4, priority = $5, category = $6, updated_at = NOW()'
            + ' WHERE todo_id = $7 AND user_id = $8 RETURNING *',
            [title.trim(), description || null, completed, fields.dueDate,
                fields.priority, fields.category, req.params.id, req.user.id]
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
