import express from "express";
import dotenv from "dotenv";
import errorHandler from "./middleware/errorhandler.js";
import helmet from 'helmet';
import cors from 'cors';

dotenv.config({
    path: './.env'
});

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));

import authRouter from "./routes/auth.js";
import todosRouter from "./routes/todos.js";
import aiRouter from "./routes/ai.js";
import { authenticate } from "./middleware/authenticate.js";
import { isAiConfigured } from "./services/ai.js";
import { startReminderScheduler } from "./notifications/reminders.js";

app.use("/auth", authRouter);
app.use("/todos", todosRouter);
// AI assistant chat. It only proposes tasks; they are still saved through POST /todos.
app.use("/ai", authenticate, aiRouter);

app.use(errorHandler);

const startServer = async () => {
    try {
        app.on("error", (err) => {
            console.log("Error", err);
            throw err;
        });

        app.listen(process.env.PORT || 8000, () => {
            console.log(`Server is running on port ${process.env.PORT}`);
            // Sends task reminders as they come due (see notifications/reminders.js).
            startReminderScheduler();
            if (!isAiConfigured()) {
                console.log("ANTHROPIC_API_KEY is not set: the assistant is off (POST /ai/chat returns 503).");
            }
        });
    } catch (err) {
        console.log("Error starting server: ", err);
    }
} 

startServer();

export default app;