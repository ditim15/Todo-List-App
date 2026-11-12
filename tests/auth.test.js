import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { PASSWORD, app, createUser, pool, refreshCookieFrom, resetDatabase } from './helpers.js';

const CSRF = { 'X-Requested-With': 'nudge' };

beforeEach(resetDatabase);
after(() => pool.end());

async function login(email, password = PASSWORD) {
    return request(app).post('/auth/login').send({ email, password });
}

describe('register', () => {
    test('rejects a weak password before creating anything', async () => {
        const res = await request(app).post('/auth/register')
            .send({ name: 'Sam', email: 'sam@example.com', password: 'password' });
        assert.equal(res.status, 400);
        assert.match(res.body.message, /Password must include/);
        const users = await pool.query('SELECT COUNT(*)::int AS n FROM users');
        assert.equal(users.rows[0].n, 0);
    });
});

describe('login', () => {
    test('wrong password and unknown email get the same 401', async () => {
        const user = await createUser();
        const wrong = await login(user.email, 'Wrong-pass1!');
        const unknown = await login('nobody@example.com');
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.equal(wrong.body.message, unknown.body.message);
    });

    test('unverified accounts get EMAIL_NOT_VERIFIED', async () => {
        const user = await createUser({ verified: false });
        const res = await login(user.email);
        assert.equal(res.status, 403);
        assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
    });

    test('sets an httpOnly refresh cookie and never returns the refresh token', async () => {
        const user = await createUser();
        const res = await login(user.email);
        assert.equal(res.status, 200);
        assert.ok(res.body.accessToken);
        assert.equal(res.body.refreshToken, undefined);

        const cookie = res.headers['set-cookie'].find((c) => c.startsWith('nudge_refresh='));
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /Path=\/auth/);
        assert.match(cookie, /SameSite=Lax/);
    });
});

describe('refresh and logout', () => {
    test('refresh needs the CSRF header', async () => {
        const user = await createUser();
        const cookie = refreshCookieFrom(await login(user.email));
        const res = await request(app).post('/auth/refresh').set('Cookie', cookie);
        assert.equal(res.status, 403);
    });

    test('refresh rotates the cookie and the old one stops working', async () => {
        const user = await createUser();
        const first = refreshCookieFrom(await login(user.email));

        const refreshed = await request(app).post('/auth/refresh').set(CSRF).set('Cookie', first);
        assert.equal(refreshed.status, 200);
        assert.ok(refreshed.body.accessToken);
        assert.equal(refreshed.body.user.email, user.email);
        const second = refreshCookieFrom(refreshed);
        assert.ok(second);
        assert.notEqual(second, first);

        const reused = await request(app).post('/auth/refresh').set(CSRF).set('Cookie', first);
        assert.equal(reused.status, 401);
    });

    test('refresh without a cookie is a 401', async () => {
        const res = await request(app).post('/auth/refresh').set(CSRF);
        assert.equal(res.status, 401);
    });

    test('logout revokes the session and clears the cookie', async () => {
        const user = await createUser();
        const cookie = refreshCookieFrom(await login(user.email));

        const out = await request(app).post('/auth/logout').set(CSRF).set('Cookie', cookie);
        assert.equal(out.status, 200);
        assert.ok(out.headers['set-cookie'].some((c) => c.startsWith('nudge_refresh=;')));

        const after = await request(app).post('/auth/refresh').set(CSRF).set('Cookie', cookie);
        assert.equal(after.status, 401);
    });
});

describe('delete account', () => {
    test('requires the right password', async () => {
        const user = await createUser();
        const { body } = await login(user.email);
        const res = await request(app).delete('/auth/account')
            .set('Authorization', `Bearer ${body.accessToken}`)
            .send({ password: 'Wrong-pass1!' });
        assert.equal(res.status, 403);
        const still = await pool.query('SELECT id FROM users WHERE id = $1', [user.id]);
        assert.equal(still.rowCount, 1);
    });

    test('deletes the user, their data and their sessions', async () => {
        const user = await createUser();
        const other = await createUser();
        const loginRes = await login(user.email);
        const token = loginRes.body.accessToken;
        const cookie = refreshCookieFrom(loginRes);

        await request(app).post('/todos').set('Authorization', `Bearer ${token}`).send({ title: 'Essay' });
        await pool.query("INSERT INTO ai_messages (user_id, role, content) VALUES ($1, 'user', 'hi')", [user.id]);
        await pool.query("INSERT INTO todos (user_id, title) VALUES ($1, 'Not mine')", [other.id]);

        const res = await request(app).delete('/auth/account')
            .set('Authorization', `Bearer ${token}`)
            .send({ password: PASSWORD });
        assert.equal(res.status, 200);

        const counts = await pool.query(
            'SELECT (SELECT COUNT(*) FROM users WHERE id = $1)::int AS users,'
            + ' (SELECT COUNT(*) FROM todos WHERE user_id = $1)::int AS todos,'
            + ' (SELECT COUNT(*) FROM ai_messages WHERE user_id = $1)::int AS messages,'
            + ' (SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1)::int AS sessions,'
            + ' (SELECT COUNT(*) FROM todos WHERE user_id = $2)::int AS other_todos',
            [user.id, other.id]
        );
        assert.deepEqual(counts.rows[0], { users: 0, todos: 0, messages: 0, sessions: 0, other_todos: 1 });

        const refresh = await request(app).post('/auth/refresh').set(CSRF).set('Cookie', cookie);
        assert.equal(refresh.status, 401);
    });
});
