import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { accessTokenFor, app, createUser, pool, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
after(() => pool.end());

// A request helper bound to one user's access token.
function as(user) {
    const auth = { Authorization: `Bearer ${accessTokenFor(user)}` };
    return {
        get: (path) => request(app).get(path).set(auth),
        post: (path, body) => request(app).post(path).set(auth).send(body),
        put: (path, body) => request(app).put(path).set(auth).send(body),
        delete: (path) => request(app).delete(path).set(auth),
    };
}

// YYYY-MM-DD, `days` from today (UTC).
function dateFromToday(days) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

test('GET /health reports the database is reachable', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
});

test('todo routes need a token', async () => {
    assert.equal((await request(app).get('/todos')).status, 401);
    assert.equal((await request(app).get('/todos').set('Authorization', 'Bearer not-a-jwt')).status, 401);
});

describe('CRUD', () => {
    test('create, list, update and delete a todo', async () => {
        const user = await createUser();
        const api = as(user);

        const created = await api.post('/todos', { title: '  History essay  ', due_date: dateFromToday(5), priority: 'high', category: 'History' });
        assert.equal(created.status, 201);
        const todo = created.body.todo;
        assert.equal(todo.title, 'History essay');
        assert.equal(todo.priority, 'high');
        assert.equal(todo.category, 'History');
        assert.equal(todo.completed, false);

        const list = await api.get('/todos');
        assert.equal(list.status, 200);
        assert.equal(list.body.total, 1);

        const updated = await api.put(`/todos/${todo.todo_id}`, { title: 'History essay', completed: true });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.todo.completed, true);
        assert.equal(updated.body.todo.category, 'General', 'PUT replaces every field');

        assert.equal((await api.delete(`/todos/${todo.todo_id}`)).status, 200);
        assert.equal((await api.get('/todos')).body.total, 0);
    });

    test('defaults: medium priority, General list, no reminder', async () => {
        const res = await as(await createUser()).post('/todos', { title: 'Buy paper' });
        assert.equal(res.status, 201);
        assert.equal(res.body.todo.priority, 'medium');
        assert.equal(res.body.todo.category, 'General');
        assert.equal(res.body.todo.remind_at, null);
    });

    test('reminders store the moment they go out', async () => {
        const res = await as(await createUser()).post('/todos', {
            title: 'Quiz', due_date: dateFromToday(5),
            reminder_days_before: 1, reminder_time: '20:00', reminder_timezone: 'America/New_York',
        });
        assert.equal(res.status, 201);
        assert.ok(res.body.todo.remind_at);
        assert.equal(res.body.todo.reminder_days_before, 1);
    });
});

describe('ownership', () => {
    test("users can't see, change or delete each other's todos", async () => {
        const owner = await createUser();
        const intruder = as(await createUser());
        const { body } = await as(owner).post('/todos', { title: 'Private' });
        const id = body.todo.todo_id;

        assert.equal((await intruder.get('/todos')).body.total, 0);
        assert.equal((await intruder.put(`/todos/${id}`, { title: 'Hacked' })).status, 404);
        assert.equal((await intruder.delete(`/todos/${id}`)).status, 404);

        const still = await pool.query('SELECT title FROM todos WHERE todo_id = $1', [id]);
        assert.equal(still.rows[0].title, 'Private');
    });
});

describe('validation', () => {
    test('bad input gets a 400 with a message, not a 500', async () => {
        const api = as(await createUser());
        const cases = [
            [{ title: '' }, /Title is required/],
            [{ title: 'x'.repeat(256) }, /255 characters/],
            [{ title: 'ok', description: 'y'.repeat(2001) }, /2000 characters/],
            [{ title: 'ok', priority: 'urgent' }, /Priority must be/],
            [{ title: 'ok', due_date: '2026-02-30' }, /real date/],
            [{ title: 'ok', completed: 'yes' }, /true or false/],
            [{ title: 'ok', reminder_days_before: 2 }, /due date/],
            [{ title: 'ok', due_date: dateFromToday(3), reminder_days_before: 9 }, /up to 7 days/],
            [{ title: 'ok', due_date: dateFromToday(-2), reminder_days_before: 0 }, /already passed/],
        ];
        for (const [body, message] of cases) {
            const res = await api.post('/todos', body);
            assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 60)}`);
            assert.match(res.body.message, message);
        }
    });

    test('non-numeric and out-of-range ids are 404s', async () => {
        const api = as(await createUser());
        assert.equal((await api.put('/todos/abc', { title: 'x' })).status, 404);
        assert.equal((await api.delete('/todos/99999999999')).status, 404);
    });

    test('page size is capped and bad pages fall back to 1', async () => {
        const res = await as(await createUser()).get('/todos?limit=100000000&page=-5');
        assert.equal(res.status, 200);
        assert.equal(res.body.limit, 1000);
        assert.equal(res.body.page, 1);
    });
});
