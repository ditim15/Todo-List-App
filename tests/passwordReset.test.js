import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { PASSWORD, app, createUser, pool, refreshCookieFrom, resetDatabase, sentEmails } from './helpers.js';
import { hashToken } from '../utils/hashToken.js';

const NEW_PASSWORD = 'N3w-password!';

beforeEach(resetDatabase);
after(() => pool.end());

// The token from the reset link in the most recent email.
function tokenFromLastEmail() {
    const match = sentEmails.at(-1)?.text.match(/reset-password\?token=([^\s]+)/);
    return match && decodeURIComponent(match[1]);
}

const forgot = (email) => request(app).post('/auth/forgot-password').send({ email });
const reset = (token, password = NEW_PASSWORD) => request(app).post('/auth/reset-password').send({ token, password });
const login = (email, password) => request(app).post('/auth/login').send({ email, password });

// The forgot-password route allows 5 requests per 15 minutes per IP, and every test in
// this file shares one IP, so only the first test calls it more than once.
describe('forgot password', () => {
    test('answers the same for unknown emails, and respects the cooldown', async () => {
        const user = await createUser();

        const unknown = await forgot('nobody@example.com');
        const known = await forgot(user.email);
        assert.equal(unknown.status, 200);
        assert.equal(known.status, 200);
        assert.equal(unknown.body.message, known.body.message);
        assert.equal(sentEmails.length, 1, 'only the real account gets an email');
        assert.equal(sentEmails[0].to, user.email);
        assert.equal(sentEmails[0].from, process.env.EMAIL_FROM || 'DoneYet? <reminders@doneyet.local>',
            'account emails use EMAIL_FROM, not the contact sender');

        const again = await forgot(user.email);
        assert.equal(again.status, 200);
        assert.equal(sentEmails.length, 1, 'no second email inside the cooldown');
    });
});

describe('reset password', () => {
    test('changes the password, logs out every session, and the link works once', async () => {
        const user = await createUser();
        const oldLogin = await login(user.email, PASSWORD);
        const oldSession = refreshCookieFrom(oldLogin);
        const oldAccessToken = oldLogin.body.accessToken;
        assert.equal((await request(app).get('/todos').set('Authorization', `Bearer ${oldAccessToken}`)).status, 200);
        await forgot(user.email);
        const token = tokenFromLastEmail();
        assert.ok(token, 'the email contains a reset link');

        const res = await reset(token);
        assert.equal(res.status, 200);

        assert.equal((await login(user.email, PASSWORD)).status, 401, 'old password stops working');
        assert.equal((await login(user.email, NEW_PASSWORD)).status, 200, 'new password works');

        const refresh = await request(app).post('/auth/refresh')
            .set('X-Requested-With', 'nudge').set('Cookie', oldSession);
        assert.equal(refresh.status, 401, 'sessions from before the reset are revoked');
        const oldAccess = await request(app).get('/todos').set('Authorization', `Bearer ${oldAccessToken}`);
        assert.equal(oldAccess.status, 401, 'access tokens from before the reset stop working at once');

        const reused = await reset(token, 'An0ther-pass!');
        assert.equal(reused.status, 400);
        assert.equal(reused.body.code, 'INVALID_RESET_TOKEN');
    });

    test('rejects a weak new password without using up the link', async () => {
        const user = await createUser();
        await forgot(user.email);
        const token = tokenFromLastEmail();

        const weak = await reset(token, 'short');
        assert.equal(weak.status, 400);
        assert.match(weak.body.message, /Password must/);

        assert.equal((await reset(token)).status, 200, 'the link still works afterwards');
    });

    test('rejects expired links', async () => {
        const user = await createUser();
        await pool.query(
            "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() - INTERVAL '1 minute')",
            [user.id, hashToken('expired-token')]
        );
        const res = await reset('expired-token');
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_RESET_TOKEN');
    });

    test('confirms the email of an unverified account', async () => {
        const user = await createUser({ verified: false });
        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, token_hash) VALUES ($1, $2)',
            [user.id, hashToken('unverified-token')]
        );
        assert.equal((await reset('unverified-token')).status, 200);
        assert.equal((await login(user.email, NEW_PASSWORD)).status, 200);
    });
});
