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