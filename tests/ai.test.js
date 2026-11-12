// The assistant's routes and validation. These run with no ANTHROPIC_API_KEY, so they
// never call the real model; `npm run eval:ai` covers the model's behaviour.
import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { accessTokenFor, app, createUser, pool, resetDatabase } from './helpers.js';
import { toDraft } from '../controllers/ai.controller.js';

beforeEach(resetDatabase);
after(() => pool.end());

const CHAT_BODY = { message: 'add chem quiz friday', today: '2026-11-11', timezone: 'America/New_York' };

// Stores an assistant message with one pending card, as a real reply would.
async function seedCard(user) {
    const draft = { title: 'Chem quiz', description: null, due_date: '2026-11-13', priority: 'medium', category: 'Chem', reminder_days_before: null, reminder_time: null, status: 'pending' };
    const result = await pool.query(
        "INSERT INTO ai_messages (user_id, role, content, drafts) VALUES ($1, 'assistant', 'Here you go.', $2::jsonb) RETURNING id",
        [user.id, JSON.stringify([draft])]
    );
    return result.rows[0].id;
}

describe('chat routes', () => {
    test('need a token', async () => {
        assert.equal((await request(app).get('/ai/chat')).status, 401);
        assert.equal((await request(app).post('/ai/chat').send(CHAT_BODY)).status, 401);
    });

    test('without an API key: history loads, sending is a 503, nothing is stored', async () => {
        const user = await createUser();
        const auth = { Authorization: `Bearer ${accessTokenFor(user)}` };

        const chat = await request(app).get('/ai/chat').set(auth);
        assert.equal(chat.status, 200);
        assert.equal(chat.body.available, false);

        const send = await request(app).post('/ai/chat').set(auth).send(CHAT_BODY);
        assert.equal(send.status, 503);
        const stored = await pool.query('SELECT COUNT(*)::int AS n FROM ai_messages');
        assert.equal(stored.rows[0].n, 0);
    });

    test('rejects bad input before calling the model', async () => {
        const auth = { Authorization: `Bearer ${accessTokenFor(await createUser())}` };
        const cases = [
            { ...CHAT_BODY, message: '   ' },
            { ...CHAT_BODY, message: 'x'.repeat(2001) },
            { ...CHAT_BODY, today: '11/11/2026' },
            { ...CHAT_BODY, timezone: 'Mars/Olympus' },
        ];
        for (const body of cases) {
            assert.equal((await request(app).post('/ai/chat').set(auth).send(body)).status, 400);
        }
    });

    test('marking a card added saves the edited fields', async () => {
        const user = await createUser();
        const id = await seedCard(user);
        const res = await request(app).patch(`/ai/chat/messages/${id}/drafts/0`)
            .set('Authorization', `Bearer ${accessTokenFor(user)}`)
            .send({ status: 'added', draft: { title: 'Chem quiz (ch. 4)', due_date: '2026-11-13', priority: 'high', category: 'Chem' } });
        assert.equal(res.status, 200);
        assert.equal(res.body.message.drafts[0].status, 'added');
        assert.equal(res.body.message.drafts[0].title, 'Chem quiz (ch. 4)');
        assert.equal(res.body.message.drafts[0].priority, 'high');
    });

    test("can't touch another user's cards, or cards that don't exist", async () => {
        const owner = await createUser();
        const intruder = { Authorization: `Bearer ${accessTokenFor(await createUser())}` };
        const id = await seedCard(owner);

        const patch = (path) => request(app).patch(path).set(intruder).send({ status: 'dismissed' });
        assert.equal((await patch(`/ai/chat/messages/${id}/drafts/0`)).status, 404);
        assert.equal((await patch(`/ai/chat/messages/${id}/drafts/5`)).status, 404);
        assert.equal((await patch('/ai/chat/messages/abc/drafts/0')).status, 404);
    });

    test('clearing the chat only deletes your own messages', async () => {
        const user = await createUser();
        const other = await createUser();
        await seedCard(user);
        await seedCard(other);
        const res = await request(app).delete('/ai/chat').set('Authorization', `Bearer ${accessTokenFor(user)}`);
        assert.equal(res.status, 200);
        const left = await pool.query('SELECT user_id FROM ai_messages');
        assert.deepEqual(left.rows.map((r) => r.user_id), [other.id]);
    });
});

describe('toDraft (validating what the model proposes)', () => {
    const base = { title: 'Essay', description: null, due_date: '2026-11-20', priority: 'high', category: 'History', reminder_days_before: 2, reminder_time: '20:00' };

    test('accepts a well-formed draft', () => {
        const { draft, error } = toDraft(base, 'America/New_York');
        assert.equal(error, undefined);
        assert.deepEqual(draft, { ...base, description: null });
    });

    test('rejects what POST /todos would reject', () => {
        assert.match(toDraft({ ...base, title: ' ' }).error, /Title is required/);
        assert.match(toDraft({ ...base, priority: 'urgent' }).error, /Priority/);
        assert.match(toDraft({ ...base, due_date: null }).error, /due date/);
        assert.match(toDraft({ ...base, reminder_time: '8pm' }).error, /HH:MM/);
    });

    test('trims overlong notes instead of rejecting the task', () => {
        const { draft } = toDraft({ ...base, description: 'n'.repeat(5000) });
        assert.equal(draft.description.length, 2000);
    });
});
