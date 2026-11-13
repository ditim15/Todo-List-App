// Per-account login lockout. Its own file because the per-IP login limit (50 per 15
// minutes) is shared by every test in a file, and these tests fail a lot of logins.
import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { PASSWORD, app, createUser, pool, resetDatabase, sentEmails } from './helpers.js';

const WRONG = 'Wr0ng-pass!';
const MAX_FAILED_LOGINS = 10;

beforeEach(resetDatabase);
after(() => pool.end());

const login = (email, password) => request(app).post('/auth/login').send({ email, password });

async function failLogins(email, times = MAX_FAILED_LOGINS) {
    for (let i = 0; i < times; i++) {
        assert.equal((await login(email, WRONG)).status, 401);
    }
}

// Records MAX_FAILED_LOGINS failures for `email`, with the window starting at `startedAt`
// (an SQL expression; a constant from this file, never user input).
async function lockAccount(email, startedAt = 'NOW()') {
    await pool.query(
        `INSERT INTO login_failures (email, failures, window_started_at) VALUES ($1, $2, ${startedAt})`,
        [email, MAX_FAILED_LOGINS]
    );
}

describe('login lockout', () => {
    test('locks an account after repeated failures, even for the right password', async () => {
        const user = await createUser();
        const other = await createUser();
        await failLogins(user.email);

        const locked = await login(user.email, PASSWORD);
        assert.equal(locked.status, 429);
        assert.equal(locked.body.code, 'ACCOUNT_LOCKED');

        assert.equal((await login(other.email, PASSWORD)).status, 200, 'other accounts are unaffected');
    });

    test('unknown emails lock the same way, so a lock reveals nothing', async () => {
        await failLogins('nobody@example.com');
        const res = await login('nobody@example.com', WRONG);
        assert.equal(res.status, 429);
        assert.equal(res.body.code, 'ACCOUNT_LOCKED');
    });

    // The tests below set the failure count directly rather than failing that many
    // logins, to stay under the per-IP limit.
    test('a successful login clears earlier failures', async () => {
        const user = await createUser();
        await failLogins(user.email, 3);
        assert.equal((await login(user.email, PASSWORD)).status, 200);
        const rows = await pool.query('SELECT COUNT(*)::int AS n FROM login_failures');
        assert.equal(rows.rows[0].n, 0);
    });

    test('the lock ends when the window passes', async () => {
        const user = await createUser();
        await lockAccount(user.email, "NOW() - INTERVAL '16 minutes'");
        assert.equal((await login(user.email, PASSWORD)).status, 200);
    });

    test('a password reset lifts the lock', async () => {
        const user = await createUser();
        await lockAccount(user.email);
        assert.equal((await login(user.email, PASSWORD)).status, 429);

        await request(app).post('/auth/forgot-password').send({ email: user.email });
        const token = decodeURIComponent(sentEmails.at(-1).text.match(/reset-password\?token=([^\s]+)/)[1]);
        const reset = await request(app).post('/auth/reset-password').send({ token, password: 'N3w-password!' });
        assert.equal(reset.status, 200);

        assert.equal((await login(user.email, 'N3w-password!')).status, 200);
    });
});
