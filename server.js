// Entry point: checks the configuration, then starts the API and the reminder scheduler.
// The routes and middleware live in app.js.
import app, { allowedOrigins } from "./app.js";
import { isAiConfigured } from "./services/ai.js";
import { startReminderScheduler } from "./notifications/reminders.js";

// The server can't issue or check logins without these, so it refuses to start rather
// than failing on the first request.
for (const name of ['DATABASE_URL', 'JWT_SECRET']) {
    if (!process.env[name]) {
        console.error(`${name} is not set. Add it to .env (see .env.example) or your host's environment settings.`);
        process.exit(1);
    }
}

const port = process.env.PORT || 8000;

app.listen(port, (err) => {
    if (err) {
        console.error("Error starting server:", err);
        process.exit(1);
    }
    console.log(`Server is running on port ${port} (allowing requests from ${allowedOrigins.join(', ')})`);
    // Sends task reminders as they come due (see notifications/reminders.js).
    startReminderScheduler();
    if (!isAiConfigured()) {
        console.log("ANTHROPIC_API_KEY is not set: the assistant is off (POST /ai/chat returns 503).");
    }
});
