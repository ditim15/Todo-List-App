// Shared test setup. Import this before anything from the app: it points the app at
// the test database and sets safe defaults, then loads the app.
//
// Tests run against TEST_DATABASE_URL, or, if that's unset, your DATABASE_URL with
// "_test" added to the database name (todo_api -> todo_api_test). The test database
// is wiped between tests, so these helpers refuse to run unless its name ends in
// "_test", and they never touch your development database's tables.
import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'fs/promises';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config({ path: './.env', quiet: true });

function testDatabaseUrl() {
    if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
    if (!process.env.DATABASE_URL) {
        throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL, to derive "<name>_test") to run the tests.');
    }
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `${url.pathname}_test`;
    return url.toString();
}

const devDatabaseUrl = process.env.DATABASE_URL;
const TEST_DATABASE_URL = testDatabaseUrl();
const testDbName = decodeURIComponent(new URL(TEST_DATABASE_URL).pathname.slice(1));
if (!testDbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${testDbName}": the test database's name must end in "_test".`);
}

// Set before the app loads. Empty strings (not deletes) so dotenv inside the app
// can't fill them back in from .env.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET ||= 'test-only-secret';
process.env.EMAIL_TRANSPORT = 'memory';
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = '';
process.env.TRUST_PROXY = '';
process.env.CLIENT_ORIGIN = '';
process.env.APP_URL = 'http://localhost:5173';

// Creates the test database on the same server if it doesn't exist yet (local runs).
// CI creates it up front and sets TEST_DATABASE_URL.
async function ensureTestDatabase() {
    const probe = new pg.Client({ connectionString: TEST_DATABASE_URL });
    try {
        await probe.connect();
        await probe.end();
        return;
    } catch (err) {
        if (err.code !== '3D000' || !devDatabaseUrl) throw err; // 3D000: database doesn't exist
    }
    const admin = new pg.Client({ connectionString: devDatabaseUrl });
    await admin.connect();
    // The name can't be a query parameter; it was checked to end in "_test" above.
    await admin.query(`CREATE DATABASE "${testDbName.replace(/"/g, '""')}"`);
    await admin.end();
}

await ensureTestDatabase();

const { default: app } = await import('../app.js');
const { default: pool } = await import('../db/pool.js');
const { sentEmails } = await import('../notifications/channels/email.js');

// Schema: the same idempotent init.sql used in development and production.
await pool.query(await readFile(new URL('../db/init.sql', import.meta.url), 'utf8'));

export { app, pool, sentEmails };

// Empties every table. Call it in beforeEach so tests don't depend on each other.
export async function resetDatabase() {
    await pool.query(
        'TRUNCATE users, todos, refresh_tokens, email_verification_tokens, password_reset_tokens, ai_messages'
        + ' RESTART IDENTITY CASCADE'
    );
    sentEmails.length = 0;
}

export const PASSWORD = 'Passw0rd!';
let userCount = 0;

// Inserts a user directly (skipping sign-up's email checks). bcrypt cost 4 keeps the
// tests fast; login compares the same way at any cost.
export async function createUser({ name = 'Test Student', email, password = PASSWORD, verified = true } = {}) {
    userCount += 1;
    const result = await pool.query(
        'INSERT INTO users (name, email, password, email_verified_at) VALUES ($1, $2, $3, $4)'
        + ' RETURNING id, name, email',
        [name, email ?? `student${userCount}@example.com`, await bcrypt.hash(password, 4), verified ? new Date() : null]
    );
    return result.rows[0];
}

// A valid access token for `user`, for routes behind `authenticate`. New users start at
// token_version 0.
export function accessTokenFor(user, tokenVersion = 0) {
    return jwt.sign({ id: user.id, tv: tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// The refresh-token cookie ("nudge_refresh=...") from a response, or null.
export function refreshCookieFrom(response) {
    const cookies = response.headers['set-cookie'] ?? [];
    const match = cookies.find((c) => c.startsWith('nudge_refresh=') && !c.startsWith('nudge_refresh=;'));
    return match ? match.split(';')[0] : null;
}
