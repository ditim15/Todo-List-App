import { Router } from "express";
import { getTodos, getTodoStats, createTodo, updateTodo, deleteTodo } from "../controllers/todos.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.route("/").get(authenticate, getTodos);
router.route("/").post(authenticate, createTodo);
router.route("/stats").get(authenticate, getTodoStats);
router.route("/:id").put(authenticate, updateTodo);
router.route("/:id").delete(authenticate, deleteTodo);

export default router;
