import { after, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as dnsPromises } from 'dns';
import request from 'supertest';
import { PASSWORD, app, createUser, pool, resetDatabase, sentEmails } from './helpers.js';

// Sign-up checks the domain's mail servers; answer that lookup locally so the tests
// don't depend on the network.
mock.method(dnsPromises, 'resolveMx', async () => [{ exchange: 'mx.uni.test', priority: 10 }]);

const ATTACKER_PASSWORD = 'Att4cker-pass!';
const EMAIL = 'student@uni.test';

beforeEach(resetDatabase);
after(() => pool.end());

const register = (password, name = 'Sam Student') =>
    request(app).post('/auth/register').send({ name, email: EMAIL, password });
const verify = (token, password) => request(app).post('/auth/verify-email').send({ token, password });
const login = (password) => request(app).post('/auth/login').send({ email: EMAIL, password });

// The token from the verification link in the most recent email.
function verificationTokenFromLastEmail() {
    const match = sentEmails.at(-1)?.text.match(/verify-email\?token=([^\s]+)/);
    return match && decodeURIComponent(match[1]);
}

async function isVerified() {
    const result = await pool.query('SELECT email_verified_at FROM users WHERE email = $1', [EMAIL]);
    return Boolean(result.rows[0].email_verified_at);
}

describe('verify email', () => {
    test('needs the password, logs in, and the link works once', async () => {
        assert.equal((await register(PASSWORD)).status, 201);
        const token = verificationTokenFromLastEmail();
        assert.ok(token, 'the email contains a verification link');

        const missing = await request(app).post('/auth/verify-email').send({ token });
        assert.equal(missing.status, 400);

        const res = await verify(token, PASSWORD);
        assert.equal(res.status, 200);
        assert.ok(res.body.accessToken);
        assert.ok(await isVerified());

        const reused = await verify(token, PASSWORD);
        assert.equal(reused.status, 400);
        assert.equal(reused.body.code, 'INVALID_VERIFICATION_TOKEN');
    });

    test('a wrong password is rejected and leaves the link usable', async () => {
        await register(PASSWORD);
        const token = verificationTokenFromLastEmail();

        const wrong = await verify(token, 'Wr0ng-pass!');
        assert.equal(wrong.status, 401);
        assert.equal(wrong.body.code, 'VERIFY_PASSWORD_MISMATCH');
        assert.equal(await isVerified(), false);

        assert.equal((await verify(token, PASSWORD)).status, 200);
    });

    test('expired links are rejected', async () => {
        await register(PASSWORD);
        const token = verificationTokenFromLastEmail();
        await pool.query("UPDATE email_verification_tokens SET expires_at = NOW() - INTERVAL '1 minute'");
        const res = await verify(token, PASSWORD);
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_VERIFICATION_TOKEN');
    });
});

// Someone who knows a student's email signs up with it using a password of their own,
// hoping the student will verify the account and they can then log into it.
describe('sign-up with an address someone else is using', () => {
    test('re-registering after the student signs up does not give the other person the account', async () => {
        await register(PASSWORD);
        const studentsLink = verificationTokenFromLastEmail();

        // The other person re-registers the unverified address with their password.
        assert.equal((await register(ATTACKER_PASSWORD, 'Not Sam')).status, 201);

        // The student clicks the link with their own password: it no longer matches, so
        // nothing is verified.
        const res = await verify(studentsLink, PASSWORD);
        assert.equal(res.status, 401);
        assert.equal(res.body.code, 'VERIFY_PASSWORD_MISMATCH');
        assert.equal(await isVerified(), false);

        // The other person still can't log in: the address isn't verified.
        assert.equal((await login(ATTACKER_PASSWORD)).body.code, 'EMAIL_NOT_VERIFIED');

        // The student resets the password, which proves the inbox and verifies it.
        await request(app).post('/auth/forgot-password').send({ email: EMAIL });
        const resetToken = sentEmails.at(-1).text.match(/reset-password\?token=([^\s]+)/)[1];
        const reset = await request(app).post('/auth/reset-password')
            .send({ token: decodeURIComponent(resetToken), password: PASSWORD });
        assert.equal(reset.status, 200);

        assert.equal((await login(PASSWORD)).status, 200);
        assert.equal((await login(ATTACKER_PASSWORD)).status, 401);
    });

    test('registering before the student does not give the other person the account', async () => {
        // The other person signs up first; the link goes to the student's inbox.
        await register(ATTACKER_PASSWORD, 'Not Sam');
        const link = verificationTokenFromLastEmail();

        // Clicking that link without knowing the password verifies nothing.
        assert.equal((await verify(link, PASSWORD)).status, 401);
        assert.equal(await isVerified(), false);

        // The student signs up themselves, which sets their password, and verifies.
        await register(PASSWORD);
        assert.equal((await verify(link, PASSWORD)).status, 200);

        assert.equal((await login(PASSWORD)).status, 200);
        assert.equal((await login(ATTACKER_PASSWORD)).status, 401);
    });

    test("repeated sign-ups don't flood the inbox", async () => {
        await register(PASSWORD);
        await register(ATTACKER_PASSWORD);
        await register(ATTACKER_PASSWORD);
        assert.equal(sentEmails.length, 1, 'only one email inside the cooldown');
    });

    test('a verified address cannot be re-registered', async () => {
        await createUser({ email: EMAIL });
        const res = await register(ATTACKER_PASSWORD);
        assert.equal(res.status, 409);
        assert.equal((await login(PASSWORD)).status, 200, 'password unchanged');
    });
});
