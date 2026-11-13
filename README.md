# Nudge API
The backend for **Nudge**, a gentle-reminder task app for students. A RESTful todo API with JWT-based authentication, built as a learning project to understand backend fundamentals.

## Tech Stack
- **Runtime**: Node.js v24
- **Framework**: Express.js (ES modules)
- **Database**: PostgreSQL
- **Auth**: JWT (access token) + refresh token rotation, bcrypt password hashing
- **Security**: `helmet`, `express-rate-limit`

## Features
- User registration and login
- Passwords hashed with bcrypt before storage
- Short-lived JWT access tokens (1 hour)
- Refresh tokens with rotation, each use invalidates the old token and issues a new one, kept in an httpOnly cookie that page scripts can't read
- Logout endpoint that revokes a refresh token
- Password reset by email, and account deletion that removes all of a user's data
- Privacy policy page (`/privacy`)
- Automated API tests and a GitHub Actions CI workflow
- Full CRUD for todos, scoped to the user
- Ownership enforcement - users only have access to their own todos to update/delete
- Pagination for todos (shows total todos and total pages)
- Rate Limiting
- Security-related HTTP headers through `helmet`

## Setup
1. Clone the repo and install dependencies:
```
npm install 
```
2. Copy `.env.example` to `.env` and fill it in. `DATABASE_URL` and `JWT_SECRET` are required (the server won't start without them); everything else has a default or is optional. Each setting is explained in the file.

Generate a secret with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
3. Create the database in pgAdmin or through createdb, then run `db/init.sql` using pgAdmin's **Query Tool** or psql.
4. Start the server:
```
node server.js
```
Server runs on `http://localhost:4000` by default

## API Endpoints

### Auth

| Method | Route              | Description                                  | Auth required |
|--------|---------------------|-----------------------------------------------|----------------|
| POST   | `/auth/register`    | Create an unverified user and email a verification link (does not log in) | No |
| POST   | `/auth/login`        | Log in. Returns the user and an access token, and sets the refresh-token cookie. Unverified accounts get `403` with `code: "EMAIL_NOT_VERIFIED"` | No |
| POST   | `/auth/verify-email` | Confirm an email with the link's `token` and the account's `password`; marks the account verified and logs in (same response as login). A wrong password gets `401` with `code: "VERIFY_PASSWORD_MISMATCH"` and leaves the link usable | No |
| POST   | `/auth/resend-verification` | Email a new verification link to `email` (same response whether or not it's registered; 60s cooldown per account) | No |
| POST   | `/auth/refresh`      | Swap the refresh-token cookie for a new access token (rotates the cookie). Needs `X-Requested-With: nudge` | Cookie |
| POST   | `/auth/logout`       | Revoke this browser's refresh token and clear the cookie. Needs `X-Requested-With: nudge` | Cookie |
| POST   | `/auth/forgot-password` | Email a password reset link to `email` (same response whether or not it's registered; 60s cooldown per account) | No |
| POST   | `/auth/reset-password` | Set a new `password` using the emailed link's `token`. Logs out every session | No |
| DELETE | `/auth/account`      | Permanently delete the signed-in account and all of its data. Body: `{ password }` | Yes |

### Todos

All todos routes require an `Authorization: Bearer <accessToken>` header.
 
| Method | Route          | Description                          |
|--------|----------------|---------------------------------------|
| GET    | `/todos`       | List the authenticated user's todos (open first, soonest due first). Supports `?page=`, `?limit=`, `?category=` (one list), `?priority=` (comma-separated, e.g. `high,medium`), `?search=` (title contains, case-insensitive), and `?dueFrom=` / `?dueTo=` (`YYYY-MM-DD`, inclusive). |
| GET    | `/todos/stats` | Dashboard summary: totals, `dueToday` / `overdue`, open-task priority counts, per-list progress, next due tasks. Pass `?today=YYYY-MM-DD` (client's local date). |
| POST   | `/todos`       | Create a new todo. Optional: `due_date` (`YYYY-MM-DD`), `priority` (`low` / `medium` / `high`, default `medium`), `category` (list name, default `General`), and a reminder (see below) |
| PUT    | `/todos/:id`   | Update a todo (must be owned by the requesting user) |
| PUT    | `/todos/lists/:name` | Rename a list: moves all of the user's todos in `:name` to the `name` given in the body (renaming to an existing list merges them) |
| DELETE | `/todos/:id`   | Delete a todo (must be owned by the requesting user) |

### AI

Requires an `Authorization: Bearer <accessToken>` header. Sending messages is limited to 20 per 10 minutes per user.

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/ai/chat` | The saved conversation (`messages`, oldest first) and `available` (false when no API key is set) |
| POST   | `/ai/chat` | Send `{ message, today, timezone }`. Returns the stored user and assistant messages; the assistant's may carry task cards in `drafts`. Nothing is saved to todos. See [AI Assistant](#ai-assistant). |
| DELETE | `/ai/chat` | Clear the conversation |
| PATCH  | `/ai/chat/messages/:id/drafts/:index` | Mark a card `added` or `dismissed` (optionally with the fields as saved). Adding the task itself is `POST /todos`. |

## Task Reminders

A task with a due date can have an email reminder: "N days before the due date at a time of day", in the user's timezone. Send these fields on `POST /todos` and `PUT /todos/:id`:

| Field | Description |
|-------|-------------|
| `reminder_days_before` | `0` (on the due date) to `7`. `null` or omitted = no reminder. Requires `due_date`. |
| `reminder_time` | `HH:MM`, the user's local time. Default `09:00`. |
| `reminder_timezone` | IANA timezone, e.g. `America/New_York`. Default `UTC`. |

The API stores the resulting moment as `remind_at` and rejects a new or changed reminder whose time has already passed. While the server runs, it checks every minute for due reminders on open tasks and sends each one once (`reminder_sent_at` is set). Changing the reminder or due date re-arms it. Reminders missed by more than 6 hours (for example, while the server was down) are skipped.

Delivery lives in `notifications/`. `reminders.js` builds the message and sends it to each channel in its `CHANNELS` list; email (`channels/email.js`) is the only one for now.

### Email settings (`.env`)

```
EMAIL_TRANSPORT=console            # console (default) | ethereal | smtp
EMAIL_FROM="Nudge <reminders@example.com>"
APP_URL=http://localhost:5173      # used for the "Open Nudge" link

# Only for EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false                  # true for port 465
SMTP_USER=...
SMTP_PASS=...
```

- `console`: prints each email to the server log; nothing is sent.
- `ethereal`: sends to a throwaway [Ethereal](https://ethereal.email) inbox and logs a link to view the email. Nothing reaches real inboxes.
- `smtp`: real delivery to verified addresses.

After pulling this change, re-run `db/init.sql` to add the reminder columns (it's safe to re-run).

## Sign-up Rules and Email Verification

- **Passwords** need at least 8 characters, an uppercase letter, a number and a symbol (max 72, bcrypt's limit). Rules live in `utils/validation.js`, mirrored for the live checklist in `client/src/auth/passwordRules.js`.
- **Email addresses** must be well-formed, and their domain must publish mail servers (MX records), which catches typos like `gmial.con`.
- **Verification:** registering emails a one-time link (`APP_URL/verify-email?token=...`, valid 24 hours). Users can't log in until they open it and enter their password, which also logs them in. The password is required because anyone can sign up with an address before it's verified. Without it, someone could register a student's email with their own password and get the student to verify an account they can log into. A student who doesn't know the password uses "forgot password", which also verifies the address.
- **Signing up with an unverified address:** the existing account isn't changed (its name and password stay), so a stranger can't lock the owner out. The inbox instead gets a "finish setting up" email with a link to choose a password, which also confirms the address. The response is the same as a fresh sign-up, and these emails respect the 60s cooldown. Only a hash of the token is stored. Reminders are only sent to verified addresses.
- Accounts that existed before verification was added are treated as verified.
- In `EMAIL_TRANSPORT=console` mode, the verification link is printed in the server log, so you can test sign-ups without a mail provider.
- With verification in place, `EMAIL_TRANSPORT=smtp` is now safe to turn on for real delivery.

After pulling this change, re-run `db/init.sql`.

## Auth Flow Notes
 
- Access tokens expire after 1 hour and live only in the client's memory. When a protected route returns `401`, the client calls `/auth/refresh` to get a new one instead of making the user log in again.
- The refresh token is an `httpOnly` cookie (`nudge_refresh`, path `/auth`, `SameSite=Lax`, `Secure` in production), so scripts on the page can never read it. Requests that use it must be made with `credentials: 'include'` and the `X-Requested-With: nudge` header, which blocks other sites from triggering them (CSRF).
- If the frontend and API are on unrelated domains (not `nudge.app` + `api.nudge.app`), set `COOKIE_SAMESITE=none`. Prefer one shared domain: some browsers block cross-site cookies.
- Refresh tokens are rotated on every use. Using one invalidates it and issues a new one, and the old token can't be reused.
- Refresh tokens expire after 7 days. Resetting the password or deleting the account ends every session at once: refresh tokens are deleted, and each access token carries the user's `token_version` (checked on every request), which a reset increments.
- **Login lockout:** besides the per-IP limit, failed logins are counted per email address. After 10 failures in 15 minutes, logins for that address get `429` with `code: "ACCOUNT_LOCKED"` (even with the right password) until the 15 minutes pass. Unknown addresses lock the same way, so a lock doesn't reveal whether an account exists. A password reset lifts it.
- After pulling this change, re-run `db/init.sql` to add the `users.token_version` column and the `login_failures`, `ai_usage` and `ai_spend_daily` tables. Logging in and the assistant return 500 until they exist.
- Only the hash of a refresh token, reset token or verification token is stored in the database; the raw token is never persisted.

## Password Reset and Account Deletion

- **Forgot password** (`/forgot-password`) emails a one-time link to `/reset-password?token=...`, valid for 1 hour. The response is the same whether or not the email has an account.
- Setting a new password logs out every session and confirms the email address (opening the link proves the user owns it).
- **Account settings** (`/account`, from the account menu) can delete the account after re-entering the password. Todos, reminders, chat history and tokens are deleted with the user (`ON DELETE CASCADE`).
- After pulling this change, re-run `db/init.sql` to add the `password_reset_tokens` table.

## Tests

```
npm test
```

Runs the API tests in `tests/` with Node's built-in test runner and `supertest`. They cover auth and cookies, password reset, account deletion, todos (CRUD, ownership, validation), and the assistant's routes. They never call the AI model; that's what `npm run eval:ai` is for.

The tests use a separate database: `TEST_DATABASE_URL`, or your `DATABASE_URL` with `_test` added to the name (`todo_api` → `todo_api_test`), created automatically if it's missing. The test database is wiped between tests, so the tests refuse to run unless its name ends in `_test`. Your development data is never touched.

On GitHub, `.github/workflows/ci.yml` runs the tests against a fresh Postgres, plus the frontend's lint and build, on every push and pull request.
## AI Assistant

On the dashboard, the button in the bottom-right corner opens a chat with the assistant. It can:

- **Add tasks.** "chem quiz friday and math 201 problem set monday, remind me the day before at 8pm" gets you one card per task, with title, due date, list, priority and reminder filled in. Cards are editable, and a task is only saved when the student presses **Add task** (through the normal `POST /todos`). The assistant never writes tasks itself.
- **Talk through a task.** "How should I approach my history essay?" looks up that task and replies with a short plan (steps, timing before the due date). It offers to turn the steps into tasks, and proposes them only if the student says yes.

How it works:

- **Model:** Claude Haiku 5.5 (`claude-haiku-5-5`) through `@anthropic-ai/sdk`, with a small tool loop (at most 4 calls per message). The model has two tools: `propose_task` (validated with the same `parseTodoFields` as `POST /todos`, then shown as a card) and `list_open_tasks` (read-only). The prompt includes today's date, a calendar of the next three weeks (so "friday" or "next mon" resolve correctly), and the student's list names. Code: `services/ai.js`, `controllers/ai.controller.js`, `client/src/components/assistant/`.
- **History:** one ongoing conversation per user in the `ai_messages` table, kept to each user's latest 200 messages. "Clear chat" deletes it. The model sees the last 20 messages. After pulling this change, re-run `db/init.sql`.
- **Spending caps:** each user can send `AI_USER_DAILY_MESSAGES` messages a day (default 50), on top of 20 per 10 minutes. Every API call's token usage is metered into `ai_spend_daily`, and once the day's estimated spend reaches `AI_DAILY_BUDGET_USD` (default $5), the assistant pauses for everyone until the next UTC day. That bounds the cost however many accounts someone creates. A failed turn doesn't count against the user. The prices used for the estimate are in `services/aiBudget.js`; update them if the model or pricing changes. Still set a spend limit on the API key in the Anthropic Console as a backstop.
- **Errors:** `400` bad input, `429` rate limit or daily message limit (`code: "AI_USER_DAILY_LIMIT"`), `503` assistant unavailable (no key, timeout, network or API outage) or daily budget reached (`code: "AI_DAILY_BUDGET"`). A failed message isn't saved; its text goes back into the input. The task form works whether or not the assistant does.
- **Setup:** set `ANTHROPIC_API_KEY` in `.env`. It is only read on the server. Without it the server still starts (it logs that the assistant is off), the panel says it's off, and everything else works.
- **Privacy:** chat messages, the student's list names, today's date and timezone are sent to Anthropic's API. When the assistant looks up tasks, the title, due date, list and priority of open tasks are sent too. Completed tasks, task notes, and the student's name and email are never sent.
- **Eval:** `npm run eval:ai` runs 30 one-message chats from `scripts/ai-parse-cases.json` (fixed date and timezone, stubbed open tasks) and prints pass/fail per field: dates, lists, priorities, reminders, junk input, multiple tasks, and "discuss, don't add" cases. It makes real API calls, so it needs the key. `npm run eval:ai -- <id>` runs only matching cases.

## Deployment Notes

- Set every variable from `.env.example` in your host's environment settings. Use a new long random `JWT_SECRET` (not your development one) and a separate `ANTHROPIC_API_KEY` with a spend limit set in the Anthropic Console.
- `APP_URL` (or `CLIENT_ORIGIN`) must be your frontend's real address, or the browser will block its requests to the API (CORS).
- Behind a hosting proxy, set `TRUST_PROXY=1` so rate limits apply per visitor.
- Hosted Postgres usually requires SSL: end `DATABASE_URL` with `?sslmode=require`.
- Run `db/init.sql` against the production database before the first start, and again after pulling changes that add tables or columns.
- `GET /health` returns `200` when the server can reach the database. Point your host's health check at it.
- The reminder scheduler runs inside the API server, so the server must stay running (a host that puts idle apps to sleep will skip reminders). It's safe to run more than one instance: reminders are locked before sending.
- Set `NODE_ENV=production` so the login cookie is `Secure` (HTTPS only). In production the server also refuses to start unless `EMAIL_TRANSPORT=smtp` (console mode would print reset and verification links to the log) and `JWT_SECRET` is at least 32 characters.
- Before launch, replace the placeholder contact email in `client/src/pages/Privacy.jsx` and check that the policy still matches what the app does.
