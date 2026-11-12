// The Express app: middleware and routes. server.js starts it; tests import it directly
// (without opening a port or starting the reminder scheduler).
import express from "express";
import dotenv from "dotenv";
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import errorHandler from "./middleware/errorhandler.js";
import pool from "./db/pool.js";
import authRouter from "./routes/auth.js";
import todosRouter from "./routes/todos.js";
import aiRouter from "./routes/ai.js";
import { authenticate } from "./middleware/authenticate.js";

dotenv.config({
    path: './.env',
    quiet: true
});

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
export const allowedOrigins = (process.env.CLIENT_ORIGIN || process.env.APP_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

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

export default app;
