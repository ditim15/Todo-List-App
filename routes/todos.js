import { Router } from "express";
import { getTodos, getTodoStats, createTodo, updateTodo, renameList, deleteTodo } from "../controllers/todos.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.route("/").get(authenticate, getTodos);
router.route("/").post(authenticate, createTodo);
router.route("/stats").get(authenticate, getTodoStats);
// Two path segments, so it never collides with PUT /:id.
router.route("/lists/:name").put(authenticate, renameList);
router.route("/:id").put(authenticate, updateTodo);
router.route("/:id").delete(authenticate, deleteTodo);

export default router;
