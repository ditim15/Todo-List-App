import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, pool, resetDatabase, sentEmails } from './helpers.js';

// Read on every request, so setting it here (after the app loaded) is enough.
process.env.SUPPORT_EMAIL = 'support@test.example';

beforeEach(resetDatabase);
after(() => pool.end());

const contact = (body) => request(app).post('/contact').send(body);

const VALID = {
    name: 'Sam Student',
    email: 'Sam@Example.com',
    topic: 'Bug report',
    message: 'The calendar skips Sunday when I switch months.',
};

// POST /contact allows 5 requests per hour per IP, and every test in this file shares
// one IP. The tests run in order and the last one relies on the earlier ones having
// used up four of those five, so add new cases above it with that in mind.
describe('contact form', () => {
    test('emails support with the visitor as Reply-To, never the visitor', async () => {
        const res = await contact({ ...VALID, name: 'Sam\r\nBcc: victim@example.com' });

        assert.equal(res.status, 200);
        assert.equal(sentEmails.length, 1);
        const [email] = sentEmails;
        assert.equal(email.to, 'support@test.example');
        assert.equal(email.replyTo, 'Sam Bcc: victim@example.com <sam@example.com>', 'line breaks are collapsed');
        assert.ok(!email.subject.includes('\n'));
        assert.match(email.subject, /^\[Contact\] Bug report: The calendar skips Sunday/);
        assert.match(email.text, /The calendar skips Sunday when I switch months\./);
        assert.equal(email.html, undefined, 'plain text only');
    });

    test('rejects a missing name, a bad email and a too-short message', async () => {
        const badEmail = await contact({ ...VALID, email: 'not-an-email' });
        assert.equal(badEmail.status, 400);

        const short = await contact({ ...VALID, name: '', message: 'hi' });
        assert.equal(short.status, 400);
        assert.match(short.body.message, /name/i, 'name is checked first');

        assert.equal(sentEmails.length, 0);
    });

    test('quietly drops submissions that fill the hidden honeypot field', async () => {
        const res = await contact({ ...VALID, website: 'http://spam.example' });

        assert.equal(res.status, 200, 'looks like success to the bot');
        assert.equal(sentEmails.length, 0);
    });

    test('limits each IP to 5 messages an hour', async () => {
        assert.equal((await contact(VALID)).status, 200);
        const limited = await contact(VALID);
        assert.equal(limited.status, 429);
        assert.equal(sentEmails.length, 1);
    });
});
