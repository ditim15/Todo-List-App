import { Router } from "express";
import { getTodos, createTodo, updateTodo, deleteTodo } from "../controllers/todos.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.route("/").get(authenticate, getTodos);
router.route("/").post(authenticate, createTodo);
router.route("/:id").put(authenticate, updateTodo);
router.route("/:id").delete(authenticate, deleteTodo);

export default router;