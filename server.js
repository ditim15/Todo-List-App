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

// Production-only checks, for settings that are fine in development but unsafe live.
if (process.env.NODE_ENV === 'production') {
    // Any other transport delivers nothing, and console mode prints every verification
    // and password-reset link to the log, where anyone who can read the log could use
    // them to take over accounts.
    if ((process.env.EMAIL_TRANSPORT || 'console').toLowerCase() !== 'smtp') {
        console.error('NODE_ENV is production but EMAIL_TRANSPORT is not "smtp". Set EMAIL_TRANSPORT=smtp and the SMTP_* settings (see .env.example).');
        process.exit(1);
    }
    // A short secret can be brute-forced offline from any access token, letting
    // someone sign tokens for any account.
    if (process.env.JWT_SECRET.length < 32) {
        console.error('JWT_SECRET must be at least 32 characters in production. Generate one with the command in .env.example.');
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
