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
