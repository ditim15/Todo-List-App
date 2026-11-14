CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
    todo_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    completed BOOLEAN NOT NULL DEFAULT false,
    due_date DATE,
    priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    category VARCHAR(50) NOT NULL DEFAULT 'General',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Adds newer columns to databases created before they existed; safe to re-run.
ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high'));
ALTER TABLE todos ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'General';

CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);

-- Reminders: "N days before the due date at a time of day", in the user's timezone.
-- remind_at is the resulting moment, computed by the API on every create/update.
-- reminder_sent_at is set once the reminder goes out, and cleared when remind_at changes.
-- All NULL means no reminder.
ALTER TABLE todos ADD COLUMN IF NOT EXISTS reminder_days_before SMALLINT
    CHECK (reminder_days_before BETWEEN 0 AND 7);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS reminder_time TIME;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS reminder_timezone VARCHAR(64);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- The reminder scheduler only looks at reminders that haven't gone out yet.
CREATE INDEX IF NOT EXISTS idx_todos_pending_reminders ON todos(remind_at)
    WHERE remind_at IS NOT NULL AND reminder_sent_at IS NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Email verification. NULL = not verified yet; users can't log in until it's set.
-- The column is added with DEFAULT NOW() so accounts that existed before verification
-- was introduced count as verified, then the default is dropped so new sign-ups start
-- unverified. Both statements are safe to re-run (the ADD is skipped once the column
-- exists).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ALTER COLUMN email_verified_at DROP DEFAULT;

-- One-time links emailed to verify an address. Only the SHA-256 hash of the token is
-- stored, like refresh_tokens. Issuing a new link deletes the user's older ones.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
-- AI assistant chat: one ongoing conversation per user, cleared from the chat panel.
-- `drafts` holds the task cards an assistant message proposed, each with a `status`
-- ('pending' | 'added' | 'dismissed'). The assistant never creates todos itself; the
-- user adds a card through POST /todos. The API keeps each user's latest 200 messages.
CREATE TABLE IF NOT EXISTS ai_messages (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    drafts JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_user_id ON ai_messages(user_id, id);

-- Password reset links. Like verification tokens: only a hash is stored, each link
-- works once, and requesting a new one replaces the old. They expire after 1 hour.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Copied into every access token (as `tv`). Bumping it (on password reset) makes every
-- access token already issued stop working at once, instead of up to an hour later.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Failed logins per email address (registered or not), for the per-account lockout in
-- controllers/auth.controller.js. A row is cleared on a successful login or a password
-- reset; stale rows just start a new window on the next failure.
CREATE TABLE IF NOT EXISTS login_failures (
    email VARCHAR(100) PRIMARY KEY,
    failures INTEGER NOT NULL,
    window_started_at TIMESTAMPTZ NOT NULL
);

-- Assistant usage, to cap what the AI can cost. ai_usage counts each user's messages
-- per (UTC) day for the per-user limit. ai_spend_daily totals the tokens every request
-- used that day for the app-wide budget; it has no user column, so deleting an account
-- doesn't erase the day's spend.
CREATE TABLE IF NOT EXISTS ai_usage (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    messages INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS ai_spend_daily (
    day DATE PRIMARY KEY,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0
);

-- ---------- Notes ----------
-- Folders nest (parent_id) up to a few levels deep (enforced by the API). A folder with
-- a todo_id is that task's notes folder: one per task, created when the task is
-- "imported" into Notes. Deleting the task keeps the folder as an ordinary one.
-- Deleting a folder deletes everything inside it.
CREATE TABLE IF NOT EXISTS note_folders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INT REFERENCES note_folders(id) ON DELETE CASCADE,
    todo_id INT REFERENCES todos(todo_id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_note_folders_user_id ON note_folders(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_note_folders_todo_id ON note_folders(todo_id) WHERE todo_id IS NOT NULL;

-- A note's body is the editor's document (Tiptap JSON). content_text is its plain text,
-- kept for previews. folder_id NULL means the note sits at the top level.
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id INT REFERENCES note_folders(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL DEFAULT 'Untitled note',
    content JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}',
    content_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id);

-- Images and PDFs added to a note, stored in the database (capped per file and per
-- user by the API). They're served through short-lived signed links, so <img> tags
-- work without the access token.
CREATE TABLE IF NOT EXISTS note_attachments (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id INT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INT NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_note_attachments_note_id ON note_attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_note_attachments_user_id ON note_attachments(user_id);
