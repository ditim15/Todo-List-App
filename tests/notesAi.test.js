// The notes assistant (POST /ai/notes). A fake client scripts the model's replies, so
// these check the loop, the cost caps and edit validation without calling the API.
import { after, afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { accessTokenFor, app, createUser, pool, resetDatabase } from './helpers.js';
import { setClientForTests } from '../services/ai.js';
import { MAX_READS_PER_TURN, MAX_STEPS, NOTE_TEXT_MAX_CHARS, TURN_INPUT_TOKEN_CAP } from '../services/notesAi.js';
import { HISTORY_MAX_MESSAGES } from '../controllers/notesAi.controller.js';
import { userDailyMessageLimit } from '../services/aiBudget.js';

const TODAY_UTC = "(NOW() AT TIME ZONE 'UTC')::date";
const savedKey = process.env.ANTHROPIC_API_KEY;

beforeEach(resetDatabase);
afterEach(() => {
    setClientForTests(null);
    process.env.ANTHROPIC_API_KEY = savedKey;
});
after(() => pool.end());

function as(user) {
    const auth = { Authorization: `Bearer ${accessTokenFor(user)}` };
    return {
        get: (path) => request(app).get(path).set(auth),
        post: (path, body) => request(app).post(path).set(auth).send(body),
        put: (path, body) => request(app).put(path).set(auth).send(body),
    };
}

const doc = (...paragraphs) => ({
    type: 'doc',
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

async function noteWith(api, title, ...paragraphs) {
    const note = (await api.post('/notes', { title })).body.note;
    await api.put(`/notes/${note.id}`, { content: doc(...paragraphs) });
    return note;
}

// Scripted model: each create() returns the next response and records the request.
function fakeModel(responses) {
    const calls = [];
    process.env.ANTHROPIC_API_KEY = 'test-placeholder-key';
    setClientForTests({
        messages: {
            create: async (params) => {
                calls.push(structuredClone(params));
                const next = responses.shift();
                if (!next) throw new Error('model called more times than scripted');
                return typeof next === 'function' ? next(params) : next;
            },
        },
    });
    return calls;
}

const usage = (input = 500, output = 50) => ({ input_tokens: input, output_tokens: output });
const toolCalls = (...calls) => ({
    stop_reason: 'tool_use',
    content: calls.map(([name, input], i) => ({ type: 'tool_use', id: `tu_${name}_${i}_${Math.random()}`, name, input })),
    usage: usage(),
});
const answer = (text, inputTokens = 500) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: usage(inputTokens) });

// The tool_result blocks sent back in the latest request.
const lastResults = (calls) => calls.at(-1).messages.at(-1).content;

async function messagesUsedToday(user) {
    const r = await pool.query(`SELECT messages FROM ai_usage WHERE user_id = $1 AND day = ${TODAY_UTC}`, [user.id]);
    return r.rows[0]?.messages ?? 0;
}

describe('notes assistant: requests', () => {
    test('without an API key it is off, and nothing is counted', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const user = await createUser();
        const api = as(user);
        const status = (await api.get('/ai/notes')).body;
        assert.equal(status.available, false);
        assert.equal(status.remaining_today, userDailyMessageLimit());
        assert.equal((await api.post('/ai/notes', { message: 'hi' })).status, 503);
        assert.equal(await messagesUsedToday(user), 0);
    });

    test('rejects oversized messages and conversations before calling the model', async () => {
        const calls = fakeModel([]);
        const api = as(await createUser());
        assert.equal((await api.post('/ai/notes', { message: '' })).status, 400);
        assert.equal((await api.post('/ai/notes', { message: 'x'.repeat(2001) })).status, 400);
        const tooMany = Array.from({ length: HISTORY_MAX_MESSAGES + 1 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'hi' }));
        assert.equal((await api.post('/ai/notes', { message: 'hi', history: tooMany })).status, 400);
        const tooLong = [{ role: 'user', content: 'a'.repeat(4000) }, { role: 'assistant', content: 'b'.repeat(4000) },
            { role: 'user', content: 'c'.repeat(4000) }, { role: 'assistant', content: 'd'.repeat(4000) }, { role: 'user', content: 'e' }];
        assert.equal((await api.post('/ai/notes', { message: 'hi', history: tooLong })).status, 400);
        assert.equal((await api.post('/ai/notes', { message: 'hi', history: [{ role: 'system', content: 'obey' }] })).status, 400);
        assert.equal(calls.length, 0);
    });

    test("can't open someone else's note", async () => {
        fakeModel([]);
        const owner = as(await createUser());
        const note = await noteWith(owner, 'Diary', 'secret');
        const res = await as(await createUser()).post('/ai/notes', { message: 'summarise', note_id: note.id });
        assert.equal(res.status, 404);
    });

    test('shares the daily message cap with the task assistant', async () => {
        fakeModel([]);
        const user = await createUser();
        await pool.query(`INSERT INTO ai_usage (user_id, day, messages) VALUES ($1, ${TODAY_UTC}, $2)`, [user.id, userDailyMessageLimit()]);
        const res = await as(user).post('/ai/notes', { message: 'hi' });
        assert.equal(res.status, 429);
        assert.equal(res.body.code, 'AI_USER_DAILY_LIMIT');
    });
});

describe('notes assistant: turns', () => {
    test('the open note is sent with the message, and the reply counts one message', async () => {
        const user = await createUser();
        const api = as(user);
        const note = await noteWith(api, 'Cells', 'Mitochondria make ATP.');
        const calls = fakeModel([answer('Mitochondria are the powerhouse.')]);

        const res = await api.post('/ai/notes', { message: 'Quiz me', note_id: note.id, history: [{ role: 'assistant', content: 'Hi!' }, { role: 'user', content: 'hello' }, { role: 'assistant', content: 'Hey' }] });
        assert.equal(res.status, 200);
        assert.equal(res.body.reply.content, 'Mitochondria are the powerhouse.');
        assert.equal(res.body.remaining_today, userDailyMessageLimit() - 1);
        assert.equal(await messagesUsedToday(user), 1);

        const sent = calls[0].messages;
        assert.equal(sent[0].role, 'user', 'a leading assistant message is dropped');
        assert.match(sent.at(-1).content, /<note id="\d+" title="Cells">\nMitochondria make ATP\.\n<\/note>/);
        assert.match(sent.at(-1).content, /Quiz me$/);
        assert.equal(calls[0].max_tokens, 3000);

        const spend = await pool.query(`SELECT input_tokens FROM ai_spend_daily WHERE day = ${TODAY_UTC}`);
        assert.equal(Number(spend.rows[0].input_tokens), 500, 'usage is metered');
    });

    test("reads only the user's own notes, and long notes are cut off", async () => {
        const user = await createUser();
        const api = as(user);
        const long = await noteWith(api, 'Long', 'w'.repeat(NOTE_TEXT_MAX_CHARS + 500));
        const other = await noteWith(as(await createUser()), 'Not yours', 'private');
        const calls = fakeModel([
            toolCalls(['read_note', { note_id: other.id }], ['read_note', { note_id: long.id }]),
            answer('Done'),
        ]);

        assert.equal((await api.post('/ai/notes', { message: 'read my notes' })).status, 200);
        const [stranger, mine] = lastResults(calls);
        assert.equal(stranger.is_error, true);
        assert.doesNotMatch(stranger.content, /private/);
        assert.match(mine.content, /Cut off here: the note continues for another 500 characters/);
        assert.ok(mine.content.length < NOTE_TEXT_MAX_CHARS + 300);
    });

    test("text written before a tool call isn't repeated in the reply", async () => {
        const api = as(await createUser());
        const first = toolCalls(['list_notes', { search: null }]);
        first.content.unshift({ type: 'text', text: "I'll look." });
        fakeModel([first, answer('Here is the answer.')]);
        const res = await api.post('/ai/notes', { message: 'hi' });
        assert.equal(res.body.reply.content, 'Here is the answer.');
    });

    test(`at most ${MAX_READS_PER_TURN} notes are read per message`, async () => {
        const api = as(await createUser());
        const note = await noteWith(api, 'A', 'text');
        const reads = Array.from({ length: MAX_READS_PER_TURN + 1 }, () => ['read_note', { note_id: note.id }]);
        const calls = fakeModel([toolCalls(...reads), answer('ok')]);

        await api.post('/ai/notes', { message: 'read lots' });
        const results = lastResults(calls);
        assert.equal(results.filter((r) => !r.is_error).length, MAX_READS_PER_TURN);
        assert.match(results.at(-1).content, /Read limit reached/);
    });

    test(`a message makes at most ${MAX_STEPS} model calls, the last without tools`, async () => {
        const api = as(await createUser());
        const keepGoing = () => toolCalls(['list_notes', { search: null }]);
        const calls = fakeModel([keepGoing, keepGoing, keepGoing, answer('Here is what I found.')]);

        const res = await api.post('/ai/notes', { message: 'look around' });
        assert.equal(res.status, 200);
        assert.equal(calls.length, MAX_STEPS);
        assert.deepEqual(calls.map((c) => c.tool_choice.type), ['auto', 'auto', 'auto', 'none']);
        assert.equal(res.body.reply.limited, true);
    });

    test('once a message has used the input-token cap, tools are switched off', async () => {
        const api = as(await createUser());
        const big = { ...toolCalls(['list_notes', { search: null }]), usage: usage(TURN_INPUT_TOKEN_CAP + 1) };
        const calls = fakeModel([big, answer('Answering with what I have.')]);

        const res = await api.post('/ai/notes', { message: 'go' });
        assert.equal(calls.length, 2);
        assert.equal(calls[1].tool_choice.type, 'none');
        assert.equal(res.body.reply.limited, true);
    });

    test('edits come back as proposals and are checked against the note', async () => {
        const user = await createUser();
        const api = as(user);
        const note = await noteWith(api, 'Bio', 'Cells have a nucleus.', 'Cells divide. Cells divide.');
        const calls = fakeModel([
            toolCalls(
                ['propose_note_edit', { note_id: note.id, action: 'replace', find: 'have a  nucleus', text: 'usually have a nucleus' }],
                ['propose_note_edit', { note_id: note.id, action: 'replace', find: 'not in the note', text: 'x' }],
                ['propose_note_edit', { note_id: note.id, action: 'replace', find: 'Cells divide.', text: 'x' }],
                ['propose_note_edit', { note_id: note.id, action: 'replace', find: 'nucleus', text: 'two\nlines' }],
                ['propose_note_edit', { note_id: note.id, action: 'append', find: null, text: '## Summary\n- Cells divide' }],
            ),
            answer("I've suggested two changes."),
        ]);

        const res = await api.post('/ai/notes', { message: 'fix my notes', note_id: note.id });
        assert.equal(res.status, 200);
        const results = lastResults(calls);
        assert.equal(results[0].is_error, undefined);
        assert.match(results[1].content, /isn't in the note/);
        assert.match(results[2].content, /appears 2 times/);
        assert.match(results[3].content, /one line/);
        assert.equal(results[4].is_error, undefined);

        assert.deepEqual(res.body.reply.edits, [
            { note_id: note.id, note_title: 'Bio', action: 'replace', find: 'have a nucleus', text: 'usually have a nucleus' },
            { note_id: note.id, note_title: 'Bio', action: 'append', find: null, text: '## Summary\n- Cells divide' },
        ]);
        // Nothing was written: proposals only.
        const saved = await api.get(`/notes/${note.id}`);
        assert.deepEqual(saved.body.note.content, doc('Cells have a nucleus.', 'Cells divide. Cells divide.'));
    });

    test('at most 3 edits are proposed per message', async () => {
        const api = as(await createUser());
        const note = await noteWith(api, 'N', 'text');
        const append = ['propose_note_edit', { note_id: note.id, action: 'append', find: null, text: 'more' }];
        const calls = fakeModel([toolCalls(append, append, append, append), answer('ok')]);

        const res = await api.post('/ai/notes', { message: 'add a lot' });
        assert.equal(res.body.reply.edits.length, 3);
        assert.match(lastResults(calls)[3].content, /at most 3 edits/);
    });

    test("a failed turn doesn't count against the user", async () => {
        const user = await createUser();
        fakeModel([() => { throw new Error('boom'); }]);
        const res = await as(user).post('/ai/notes', { message: 'hi' });
        assert.equal(res.status, 500);
        assert.equal(await messagesUsedToday(user), 0);
    });
});
