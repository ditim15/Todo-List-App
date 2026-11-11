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
- Refresh tokens with rotation, each use invalidates the old token and issues a new one
- Logout endpoint that revokes a refresh token
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
2. Create a `.env`file in the project root:
```
PORT=4000
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/your_db_name?schema=public"
JWT_SECRET=your_random_secret_here
```

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
| POST   | `/auth/register`    | Create a new user                             | No             |
| POST   | `/auth/login`        | Log in, returns access + refresh token         | No             |
| POST   | `/auth/refresh`      | Exchange a refresh token for a new access token (rotates the refresh token) | No |
| POST   | `/auth/logout`       | Revoke a refresh token                        | No             |

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
- `smtp`: real delivery. Don't use this until sign-up verifies email addresses; otherwise anyone could have reminders sent to an address they don't own.

After pulling this change, re-run `db/init.sql` to add the reminder columns (it's safe to re-run).

## Auth Flow Notes
 
- Access tokens expire after 1 hour. When a request to a protected route returns `401`, the client should call `/auth/refresh` with its stored refresh token to get a new access token, rather than forcing the user to log in again.
- Refresh tokens are rotated on every use — using a refresh token invalidates it and issues a new one. The old token cannot be reused.
- Refresh tokens expire after 7 days.
- Only the hash of a refresh token is stored in the database; the raw token is never persisted.