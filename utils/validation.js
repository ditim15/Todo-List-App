import { promises as dns } from 'dns';

// ---------- Passwords ----------
// Keep in sync with client/src/auth/passwordRules.js, which shows the same checklist
// while the user types.
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes of a password, so longer ones are rejected rather
// than silently truncated.
export const PASSWORD_MAX_LENGTH = 72;

const PASSWORD_RULES = [
    { test: (p) => p.length >= PASSWORD_MIN_LENGTH, message: `at least ${PASSWORD_MIN_LENGTH} characters` },
    { test: (p) => /[A-Z]/.test(p), message: 'an uppercase letter' },
    { test: (p) => /[0-9]/.test(p), message: 'a number' },
    { test: (p) => /[^A-Za-z0-9\s]/.test(p), message: 'a symbol (like ! @ # $)' },
];

// Returns an error message, or null when the password meets every rule.
export function validatePassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
        return 'Password is required';
    }
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_LENGTH) {
        return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`;
    }
    const missing = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.message);
    if (missing.length > 0) {
        return `Password must include ${missing.join(', ')}`;
    }
    return null;
}

// ---------- Email addresses ----------
export function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Practical format check: one @, no spaces, a dotted domain with a 2+ letter TLD.
// Deliverability is proven by the verification email, not by this.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function isValidEmailFormat(email) {
    return email.length <= 100 && EMAIL_PATTERN.test(email);
}

// True if the email's domain publishes mail servers (MX records), i.e. it can receive
// email at all. Catches typos like "gmial.con" and made-up domains. If DNS itself fails
// (timeout, offline), returns true: the verification email is the real check, and
// sign-ups shouldn't break because a lookup hiccuped.
export async function domainAcceptsMail(email) {
    const domain = email.split('@')[1];
    try {
        const records = await dns.resolveMx(domain);
        return records.some((record) => record.exchange && record.exchange !== '.');
    } catch (err) {
        if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return false;
        console.warn(`[auth] MX lookup failed for ${domain} (${err.code}); allowing sign-up`);
        return true;
    }
}

// ---------- Todo fields ----------
// Shared by POST/PUT /todos and the AI quick-add draft (controllers/ai.controller.js),
// so a draft is held to exactly the same rules as a task the user types in.
export const PRIORITIES = ['low', 'medium', 'high'];
export const DEFAULT_CATEGORY = 'General';
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const CATEGORY_MAX_LENGTH = 50;

// Normalises the optional fields shared by create/update. Returns { error } when the
// input is invalid so the caller can send a 400.
export function parseTodoFields(body) {
    const priority = body.priority ?? 'medium';
    if (!PRIORITIES.includes(priority)) {
        return { error: `Priority must be one of: ${PRIORITIES.join(', ')}` };
    }

    const category = typeof body.category === 'string' && body.category.trim() !== ''
        ? body.category.trim()
        : DEFAULT_CATEGORY;
    if (category.length > CATEGORY_MAX_LENGTH) {
        return { error: `List name must be ${CATEGORY_MAX_LENGTH} characters or fewer` };
    }

    const dueDate = body.due_date || null;
    if (dueDate !== null && !isValidDate(dueDate)) {
        return { error: 'Due date must be a real date in YYYY-MM-DD format' };
    }

    const reminder = parseReminder(body, dueDate);
    if (reminder.error) {
        return { error: reminder.error };
    }

    return { priority, category, dueDate, reminder: reminder.value };
}

// 'YYYY-MM-DD' that names a real calendar day (rejects e.g. 2026-02-30).
function isValidDate(value) {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const REMINDER_MAX_DAYS_BEFORE = 7;
const DEFAULT_REMINDER_TIME = '09:00';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function isValidTimeZone(timeZone) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone });
        return true;
    } catch {
        return false;
    }
}

// Reminder fields: reminder_days_before (0 = on the due date, up to 7), reminder_time
// ('HH:MM', the user's local time, default 09:00) and reminder_timezone (IANA name,
// e.g. 'America/New_York'). A null/omitted reminder_days_before means no reminder.
function parseReminder(body, dueDate) {
    const raw = body.reminder_days_before;
    if (raw === undefined || raw === null || raw === '') {
        return { value: null };
    }

    const daysBefore = Number(raw);
    if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > REMINDER_MAX_DAYS_BEFORE) {
        return { error: `Reminders can be set from the due date up to ${REMINDER_MAX_DAYS_BEFORE} days before` };
    }
    if (!dueDate) {
        return { error: 'Set a due date to add a reminder' };
    }

    const time = body.reminder_time || DEFAULT_REMINDER_TIME;
    if (typeof time !== 'string' || !TIME_PATTERN.test(time)) {
        return { error: 'Reminder time must be in HH:MM format' };
    }

    const timezone = body.reminder_timezone || 'UTC';
    if (typeof timezone !== 'string' || timezone.length > 64 || !isValidTimeZone(timezone)) {
        return { error: 'Unknown reminder timezone' };
    }

    return { value: { daysBefore, time: time.slice(0, 5), timezone } };
}
