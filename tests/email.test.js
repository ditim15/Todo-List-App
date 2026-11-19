// EMAIL_TRANSPORT=resend: emails go to Resend's HTTPS API (fetch stubbed here).
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.EMAIL_TRANSPORT = 'resend';
process.env.RESEND_API_KEY = 're_test_key';
const { sendEmail, describeEmailError } = await import('../notifications/channels/email.js');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubFetch(status, body) {
    const sent = [];
    globalThis.fetch = async (url, options) => {
        sent.push({ url, ...options, json: JSON.parse(options.body) });
        return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    };
    return sent;
}

test('sends through the Resend API with the key, sender and reply-to', async () => {
    const sent = stubFetch(200, { id: 'email_1' });
    await sendEmail({ to: 'student@example.com', subject: 'Hi', text: 'Plain', html: '<p>Html</p>', replyTo: 'visitor@example.com', from: 'DoneYet <a@doneyet.app>' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.resend.com/emails');
    assert.equal(sent[0].method, 'POST');
    assert.equal(sent[0].headers.Authorization, 'Bearer re_test_key');
    assert.deepEqual(sent[0].json, {
        from: 'DoneYet <a@doneyet.app>', to: ['student@example.com'], subject: 'Hi', text: 'Plain', html: '<p>Html</p>', reply_to: 'visitor@example.com',
    });
});

test('a refused email throws with Resend\'s reason', async () => {
    stubFetch(403, { statusCode: 403, message: 'The doneyet.app domain is not verified.' });
    const err = await sendEmail({ to: 'x@example.com', subject: 's', text: 't' }).catch((e) => e);
    assert.match(err.message, /domain is not verified/);
    assert.match(describeEmailError(err), /responseCode=403/);
    assert.ok(!describeEmailError(err).includes('re_test_key'), 'never logs the key');
});
