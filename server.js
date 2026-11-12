import express from "express";
import dotenv from "dotenv";
import errorHandler from "./middleware/errorhandler.js";
import helmet from 'helmet';
import cors from 'cors';

dotenv.config({
    path: './.env'
});

// The server can't issue or check logins without these, so it refuses to start rather
// than failing on the first request.
for (const name of ['DATABASE_URL', 'JWT_SECRET']) {
    if (!process.env[name]) {
        console.error(`${name} is not set. Add it to .env (see .env.example) or your host's environment settings.`);
        process.exit(1);
    }
}

const app = express();

// Behind a hosting proxy (Render, Railway, Fly, ...), every request arrives from the
// proxy. TRUST_PROXY=1 makes Express read the visitor's real IP from X-Forwarded-For,
// so the per-IP rate limits apply per visitor instead of to everyone at once. Leave it
// unset when nothing sits in front of the server (like local development).
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

// Where the frontend is served from. CLIENT_ORIGIN can list several, comma-separated
// (e.g. "https://nudge.app,https://www.nudge.app").
const allowedOrigins = (process.env.CLIENT_ORIGIN || process.env.APP_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

app.use(helmet());
app.use(express.json());
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

import pool from "./db/pool.js";
import authRouter from "./routes/auth.js";
import todosRouter from "./routes/todos.js";
import aiRouter from "./routes/ai.js";
import { authenticate } from "./middleware/authenticate.js";
import { isAiConfigured } from "./services/ai.js";
import { startReminderScheduler } from "./notifications/reminders.js";

// For the host's uptime checks: 200 when the server can reach the database.
app.get("/health", async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ status: "ok" });
    } catch {
        res.status(503).json({ status: "database unavailable" });
    }
});

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

        const port = process.env.PORT || 8000;
        app.listen(port, () => {
            console.log(`Server is running on port ${port} (allowing requests from ${allowedOrigins.join(', ')})`);
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