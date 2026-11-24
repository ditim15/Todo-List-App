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

describe('repeating tasks', () => {
    // Ticks a task off the way the dashboard does: PUT the whole todo with completed set.
    const tick = (api, todo, completed = true) => api.put(`/todos/${todo.todo_id}`, { ...todo, completed });

    test('ticking a repeating task off creates the next copy, carrying its details over', async () => {
        const api = as(await createUser());
        const due = dateFromToday(2);
        const created = await api.post('/todos', {
            title: 'Problem set', description: 'Odd questions', due_date: due, priority: 'high', category: 'Calculus',
            recurrence: 'weekly', recurrence_until: dateFromToday(60),
            reminder_days_before: 1, reminder_time: '18:00', reminder_timezone: 'UTC',
        });
        assert.equal(created.status, 201);
        assert.equal(created.body.todo.recurrence, 'weekly');

        const res = await tick(api, created.body.todo);
        assert.equal(res.status, 200);
        assert.equal(res.body.todo.completed, true);
        const next = res.body.next_todo;
        assert.ok(next, 'a next copy is returned');
        assert.equal(next.due_date, dateFromToday(9));
        assert.equal(next.completed, false);
        assert.equal(next.title, 'Problem set');
        assert.equal(next.description, 'Odd questions');
        assert.equal(next.priority, 'high');
        assert.equal(next.category, 'Calculus');
        assert.equal(next.recurrence, 'weekly');
        assert.equal(next.recurrence_until, dateFromToday(60));
        assert.equal(next.reminder_days_before, 1);
        assert.ok(next.remind_at, 'the reminder moves with the new due date');
        assert.equal(next.reminder_sent_at, null);

        const list = await api.get('/todos?limit=50');
        assert.equal(list.body.total, 2);
    });

    test('un-ticking and re-ticking does not create a second copy', async () => {
        const api = as(await createUser());
        const { todo } = (await api.post('/todos', {
            title: 'Reading', due_date: dateFromToday(1), recurrence: 'daily', recurrence_until: dateFromToday(10),
        })).body;

        const first = await tick(api, todo);
        assert.ok(first.body.next_todo);
        await tick(api, first.body.todo, false);
        const again = await tick(api, first.body.todo);
        assert.equal(again.status, 200);
        assert.equal(again.body.next_todo, null);
        assert.equal((await api.get('/todos?limit=50')).body.total, 2);
    });

    test('the series stops at its end date', async () => {
        const api = as(await createUser());
        const { todo } = (await api.post('/todos', {
            title: 'Lab', due_date: dateFromToday(3), recurrence: 'weekly', recurrence_until: dateFromToday(9),
        })).body;

        const res = await tick(api, todo);
        assert.equal(res.body.next_todo, null, 'next one would be due after the end date');
        assert.equal((await api.get('/todos?limit=50')).body.total, 1);
    });

    test('a copy due on the end date is still made', async () => {
        const api = as(await createUser());
        const { todo } = (await api.post('/todos', {
            title: 'Quiz', due_date: dateFromToday(3), recurrence: 'biweekly', recurrence_until: dateFromToday(17),
        })).body;
        const res = await tick(api, todo);
        assert.equal(res.body.next_todo?.due_date, dateFromToday(17));
    });

    test('saving other edits does not create a copy, and PUT without recurrence stops repeating', async () => {
        const api = as(await createUser());
        const { todo } = (await api.post('/todos', {
            title: 'Club', due_date: dateFromToday(2), recurrence: 'weekly', recurrence_until: dateFromToday(30),
        })).body;

        const edited = await api.put(`/todos/${todo.todo_id}`, { ...todo, title: 'Club meeting' });
        assert.equal(edited.body.next_todo, null);
        assert.equal(edited.body.todo.recurrence, 'weekly');

        const stopped = await api.put(`/todos/${todo.todo_id}`, { title: 'Club meeting', due_date: todo.due_date });
        assert.equal(stopped.body.todo.recurrence, null);
        assert.equal(stopped.body.todo.recurrence_until, null);
        const ticked = await tick(api, stopped.body.todo);
        assert.equal(ticked.body.next_todo, null);
    });

    test('next dates: weekdays skip the weekend and monthly keeps the day or clamps it', async () => {
        const { nextOccurrence } = await import('../utils/validation.js');
        assert.equal(nextOccurrence('2026-11-27', 'weekdays'), '2026-11-30', 'Friday -> Monday');
        assert.equal(nextOccurrence('2026-11-24', 'weekdays'), '2026-11-25');
        assert.equal(nextOccurrence('2026-11-30', 'daily'), '2026-12-01');
        assert.equal(nextOccurrence('2026-01-15', 'monthly'), '2026-02-15');
        assert.equal(nextOccurrence('2026-01-31', 'monthly'), '2026-02-28');
        assert.equal(nextOccurrence('2026-12-31', 'monthly'), '2027-01-31');
    });

    test('?repeating=open lists only the open copy of each repeating task', async () => {
        const api = as(await createUser());
        const { todo } = (await api.post('/todos', {
            title: 'Seminar', due_date: dateFromToday(1), recurrence: 'weekly', recurrence_until: dateFromToday(40),
        })).body;
        await api.post('/todos', { title: 'One-off', due_date: dateFromToday(2) });
        await tick(api, todo);

        const res = await api.get('/todos?repeating=open&limit=50');
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 1);
        assert.equal(res.body.todos[0].title, 'Seminar');
        assert.equal(res.body.todos[0].completed, false);
        assert.equal(res.body.todos[0].due_date, dateFromToday(8));
    });

    test('repeat settings are validated', async () => {
        const api = as(await createUser());
        const due = dateFromToday(3);
        const cases = [
            [{ title: 'ok', due_date: due, recurrence: 'hourly', recurrence_until: dateFromToday(10) }, /Repeat must be/],
            [{ title: 'ok', recurrence: 'weekly', recurrence_until: dateFromToday(10) }, /due date to make a task repeat/],
            [{ title: 'ok', due_date: due, recurrence: 'weekly' }, /stops repeating/],
            [{ title: 'ok', due_date: due, recurrence: 'weekly', recurrence_until: '2026-02-30' }, /real date/],
            [{ title: 'ok', due_date: due, recurrence: 'weekly', recurrence_until: dateFromToday(1) }, /on or after the due date/],
            [{ title: 'ok', due_date: due, recurrence: 'weekly', recurrence_until: dateFromToday(400) }, /up to a year/],
        ];
        for (const [body, message] of cases) {
            const res = await api.post('/todos', body);
            assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
            assert.match(res.body.message, message);
        }
    });
});
