import pool from '../db/pool.js';

// Gets all todos for the authenticated user.
const getTodos = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const result = await pool.query(
            'SELECT * FROM todos WHERE user_id = $1 LIMIT $2 OFFSET $3', [req.user.id, limit, offset]
        );

        const totalTodos = await pool.query(
            'SELECT COUNT(*) FROM todos WHERE user_id = $1', [req.user.id]
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

// Creates a new todo for the user.
const createTodo = async (req, res, next) => {
    try {

        const { title, description, completed } = req.body;

        if (!title || title.trim() === "") {
            return res.status(400).json({
                message: "Title is required"
            });
        }

        const todo = await pool.query(
            'INSERT INTO todos (user_id, title, description, completed)'
            + ' VALUES ($1, $2, $3, $4) RETURNING *',
            [req.user.id, title, description, completed]
        );

        res.status(201).json({
            message: "Todo created successfully",
            todo: todo.rows[0]
        });
    } catch (err) {
        next(err);
    }
};

// Update (put) an existing todo for the user.
const updateTodo = async (req, res, next) => {
    try {

        const updated = await pool.query(
            'UPDATE todos SET title = $1, description = $2, completed = $3'
            + ' WHERE todo_id = $4 AND user_id = $5 RETURNING *', [req.body.title, req.body.description, req.body.completed, req.params.id, req.user.id]
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
    createTodo,
    updateTodo,
    deleteTodo
}