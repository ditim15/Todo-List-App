import { Router } from "express";
import { getTodos, getTodoStats, createTodo, updateTodo, renameList, deleteTodo } from "../controllers/todos.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// Todo ids are positive integers. Anything else can't match a todo, so it's a 404
// rather than a Postgres "invalid input syntax" 500.
router.param("id", (req, res, next, id) => {
    if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) {
        return res.status(404).json({ message: "Todo not found" });
    }
    next();
});

router.route("/").get(authenticate, getTodos);
router.route("/").post(authenticate, createTodo);
router.route("/stats").get(authenticate, getTodoStats);
// Two path segments, so it never collides with PUT /:id.
router.route("/lists/:name").put(authenticate, renameList);
router.route("/:id").put(authenticate, updateTodo);
router.route("/:id").delete(authenticate, deleteTodo);

export default router;
