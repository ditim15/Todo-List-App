import pool from '../db/pool.js';
import { sendEmail } from './channels/email.js';

// Task reminders: builds the message and hands it to each delivery channel. Email is
// the only channel for now; to add another (SMS, push...), write a channel module with
// a send function and add it to CHANNELS. Each channel receives the same
// { user, todo, message } and picks the parts it needs.
const CHANNELS = [
    {
        name: 'email',
        send: ({ user, message }) => sendEmail({ to: user.email, ...message }),
    },
];

const CHECK_INTERVAL_MS = 60 * 1000;
// Reminders missed by more than this (e.g. the server was down) are skipped rather
// than sent late.
const MAX_LATENESS = '6 hours';
const BATCH_SIZE = 50;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// "today", "tomorrow", or "in 3 days (Fri, Nov 14)" from the reminder's offset.
function describeDue(todo) {
    const [year, month, day] = todo.due_date.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    });
    const days = todo.reminder_days_before;
    if (days === 0) return `today (${date})`;
    if (days === 1) return `tomorrow (${date})`;
    return `in ${days} days (${date})`;
}

export function buildReminderMessage(user, todo) {
    const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
    const dashboardUrl = `${appUrl}/dashboard`;
    const due = describeDue(todo);
    const firstName = (user.name || '').split(' ')[0] || 'there';
    const meta = `${todo.category} · ${todo.priority[0].toUpperCase()}${todo.priority.slice(1)} priority`;

    const subject = `Reminder: "${todo.title}" is due ${due.split(' (')[0]}`;
    const text = [
        `Hi ${firstName},`,
        '',
        `A gentle nudge: "${todo.title}" is due ${due}.`,
        meta,
        todo.description ? `\n${todo.description}` : null,
        '',
        `Open Nudge: ${dashboardUrl}`,
    ].filter((line) => line !== null).join('\n');

    const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;color:#14161b">
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>A gentle nudge: <strong>${escapeHtml(todo.title)}</strong> is due ${escapeHtml(due)}.</p>
  <p style="color:#545b69;font-size:14px">${escapeHtml(meta)}</p>
  ${todo.description ? `<p style="color:#545b69;white-space:pre-line">${escapeHtml(todo.description)}</p>` : ''}
  <p><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open Nudge</a></p>
</div>`.trim();

    return { subject, text, html };
}

async function deliver(user, todo) {
    const message = buildReminderMessage(user, todo);
    for (const channel of CHANNELS) {
        await channel.send({ user, todo, message });
    }
}

// Claims due reminders and sends them. Claiming (setting reminder_sent_at up front,
// with SKIP LOCKED) means a reminder is never sent twice, even with several server
// instances. If delivery fails the claim is released so the next check retries it.
export async function processDueReminders() {
    const claimed = await pool.query(
        'UPDATE todos t SET reminder_sent_at = NOW()'
        + ' FROM users u'
        + ' WHERE u.id = t.user_id AND t.todo_id IN ('
        + '   SELECT todo_id FROM todos'
        + '   WHERE reminder_sent_at IS NULL AND remind_at IS NOT NULL AND NOT completed'
        // Only send to email addresses the user has proven they own.
        + '     AND user_id IN (SELECT id FROM users WHERE email_verified_at IS NOT NULL)'
        + `     AND remind_at <= NOW() AND remind_at > NOW() - INTERVAL '${MAX_LATENESS}'`
        + '   ORDER BY remind_at'
        + `   LIMIT ${BATCH_SIZE}`
        + '   FOR UPDATE SKIP LOCKED'
        + ' )'
        + ' RETURNING t.*, u.name AS user_name, u.email AS user_email'
    );

    for (const row of claimed.rows) {
        const user = { id: row.user_id, name: row.user_name, email: row.user_email };
        try {
            await deliver(user, row);
        } catch (err) {
            console.error(`[reminders] Failed to send reminder for todo ${row.todo_id}:`, err.message);
            await pool.query('UPDATE todos SET reminder_sent_at = NULL WHERE todo_id = $1', [row.todo_id]);
        }
    }

    return claimed.rows.length;
}

// Checks for due reminders every minute while the server runs. Returns a stop function.
export function startReminderScheduler() {
    let running = false;

    async function tick() {
        if (running) return; // previous check still in progress
        running = true;
        try {
            const sent = await processDueReminders();
            if (sent > 0) console.log(`[reminders] Processed ${sent} reminder(s)`);
        } catch (err) {
            console.error('[reminders] Check failed:', err.message);
        } finally {
            running = false;
        }
    }

    tick();
    const timer = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
}
