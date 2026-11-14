import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { accessTokenFor, app, createUser, pool, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
after(() => pool.end());

function as(user) {
    const auth = { Authorization: `Bearer ${accessTokenFor(user)}` };
    return {
        get: (path) => request(app).get(path).set(auth),
        post: (path, body) => request(app).post(path).set(auth).send(body),
        put: (path, body) => request(app).put(path).set(auth).send(body),
        delete: (path) => request(app).delete(path).set(auth),
        upload: (path, buffer, type, filename) => request(app).post(path).set(auth)
            .set('Content-Type', type).set('X-Filename', encodeURIComponent(filename)).send(buffer),
    };
}

// The smallest valid PNG (1x1 transparent pixel).
const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000'
    + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
    'hex'
);

const doc = (...paragraphs) => ({
    type: 'doc',
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

describe('folders', () => {
    test('nest, rename, move to the top level, and delete with everything inside', async () => {
        const api = as(await createUser());
        const school = (await api.post('/notes/folders', { name: '  School  ' })).body.folder;
        assert.equal(school.name, 'School');
        const bio = (await api.post('/notes/folders', { name: 'Biology', parent_id: school.id })).body.folder;
        assert.equal(bio.parent_id, school.id);
        const note = (await api.post('/notes', { folder_id: bio.id, title: 'Cells' })).body.note;

        const renamed = await api.put(`/notes/folders/${bio.id}`, { name: 'Bio 101', parent_id: null });
        assert.equal(renamed.status, 200);
        assert.equal(renamed.body.folder.name, 'Bio 101');
        assert.equal(renamed.body.folder.parent_id, null);

        assert.equal((await api.delete(`/notes/folders/${bio.id}`)).status, 200);
        assert.equal((await api.get(`/notes/${note.id}`)).status, 404, 'notes inside are deleted too');
        const tree = (await api.get('/notes/tree')).body;
        assert.deepEqual(tree.folders.map((f) => f.name), ['School']);
    });

    test('limits nesting depth and refuses to move a folder inside itself', async () => {
        const api = as(await createUser());
        let parent = null;
        const chain = [];
        for (let level = 1; level <= 5; level += 1) {
            const res = await api.post('/notes/folders', { name: `Level ${level}`, parent_id: parent });
            assert.equal(res.status, 201);
            parent = res.body.folder.id;
            chain.push(parent);
        }
        const tooDeep = await api.post('/notes/folders', { name: 'Level 6', parent_id: parent });
        assert.equal(tooDeep.status, 400);

        const intoChild = await api.put(`/notes/folders/${chain[0]}`, { parent_id: chain[2] });
        assert.equal(intoChild.status, 400);
        assert.match(intoChild.body.message, /inside itself/);
    });
});

describe('notes', () => {
    test('save content, show a text preview, and reject malformed documents', async () => {
        const api = as(await createUser());
        const note = (await api.post('/notes', {})).body.note;
        assert.equal(note.title, 'Untitled note');

        const saved = await api.put(`/notes/${note.id}`, { title: 'Exam topics', content: doc('Mitosis phases', 'Krebs cycle') });
        assert.equal(saved.status, 200);
        assert.equal(saved.body.note.content.content.length, 2);

        const [listed] = (await api.get('/notes/tree')).body.notes;
        assert.equal(listed.title, 'Exam topics');
        assert.equal(listed.preview, 'Mitosis phases Krebs cycle');
        assert.equal(listed.content, undefined, 'the tree leaves bodies out');

        assert.equal((await api.put(`/notes/${note.id}`, { content: { type: 'paragraph' } })).status, 400);
        assert.equal((await api.put(`/notes/${note.id}`, { content: 'hello' })).status, 400);
    });

    test("another user can't read, change or delete them", async () => {
        const owner = as(await createUser());
        const stranger = as(await createUser());
        const folder = (await owner.post('/notes/folders', { name: 'Private' })).body.folder;
        const note = (await owner.post('/notes', { folder_id: folder.id, title: 'Diary' })).body.note;

        assert.equal((await stranger.get(`/notes/${note.id}`)).status, 404);
        assert.equal((await stranger.put(`/notes/${note.id}`, { title: 'Mine now' })).status, 404);
        assert.equal((await stranger.delete(`/notes/${note.id}`)).status, 404);
        assert.equal((await stranger.put(`/notes/folders/${folder.id}`, { name: 'x' })).status, 404);
        assert.equal((await stranger.post('/notes', { folder_id: folder.id })).status, 404, "can't add notes to someone else's folder");
        assert.equal((await stranger.get('/notes/tree')).body.folders.length, 0);
        assert.equal((await owner.get(`/notes/${note.id}`)).body.note.title, 'Diary');
    });
});

describe('task folders', () => {
    test('importing a task makes one folder for it, linked from the task list', async () => {
        const user = await createUser();
        const api = as(user);
        const todo = (await api.post('/todos', { title: 'Biology midterm', due_date: '2030-05-01', priority: 'high' })).body.todo;

        const first = await api.post('/notes/task-folders', { todo_id: todo.todo_id });
        assert.equal(first.status, 201);
        assert.equal(first.body.folder.name, 'Biology midterm');
        assert.equal(first.body.folder.task_due_date, '2030-05-01');
        assert.equal(first.body.folder.task_priority, 'high');

        const again = await api.post('/notes/task-folders', { todo_id: todo.todo_id });
        assert.equal(again.status, 200);
        assert.equal(again.body.folder.id, first.body.folder.id, 'the same folder comes back');

        const [listed] = (await api.get('/todos')).body.todos;
        assert.equal(listed.notes_folder_id, first.body.folder.id);

        // Deleting the task keeps the folder and its notes.
        await api.post('/notes', { folder_id: first.body.folder.id, title: 'Study plan' });
        await api.delete(`/todos/${todo.todo_id}`);
        const tree = (await api.get('/notes/tree')).body;
        assert.equal(tree.folders[0].todo_id, null);
        assert.equal(tree.notes[0].title, 'Study plan');
    });

    test("can't import someone else's task", async () => {
        const owner = as(await createUser());
        const todo = (await owner.post('/todos', { title: 'Secret' })).body.todo;
        const res = await as(await createUser()).post('/notes/task-folders', { todo_id: todo.todo_id });
        assert.equal(res.status, 404);
    });
});

describe('attachments', () => {
    test('upload an image, serve it from a signed link, and refuse forged or mislabeled files', async () => {
        const api = as(await createUser());
        const note = (await api.post('/notes', { title: 'Diagrams' })).body.note;

        const uploaded = await api.upload(`/notes/${note.id}/attachments`, PNG, 'image/png', 'cell diagram.png');
        assert.equal(uploaded.status, 201);
        const { attachment } = uploaded.body;
        assert.equal(attachment.filename, 'cell diagram.png');
        assert.equal(attachment.size_bytes, PNG.length);

        // Works without the access token (an <img> tag can't send one).
        const file = await request(app).get(attachment.url).buffer(true).parse((res, cb) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
        assert.equal(file.status, 200);
        assert.equal(file.headers['content-type'], 'image/png');
        assert.equal(file.headers['cross-origin-resource-policy'], 'cross-origin');
        assert.ok(Buffer.from(file.body).equals(PNG));

        const forged = attachment.url.replace(/sig=[^&]+/, 'sig=AAAA');
        assert.equal((await request(app).get(forged)).status, 403);
        const otherId = attachment.url.replace(`/attachments/${attachment.id}/`, `/attachments/${attachment.id + 1}/`);
        assert.equal((await request(app).get(otherId)).status, 403, "a link only works for its own file");

        const fakePng = await api.upload(`/notes/${note.id}/attachments`, Buffer.from('<html><script>alert(1)</script></html>'), 'image/png', 'evil.png');
        assert.equal(fakePng.status, 415);
        const svg = await api.upload(`/notes/${note.id}/attachments`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml', 'a.svg');
        assert.equal(svg.status, 415);

        // Loading the note gives image nodes a fresh link to their file.
        await api.put(`/notes/${note.id}`, {
            content: { type: 'doc', content: [{ type: 'image', attrs: { attachmentId: attachment.id, src: 'stale' } }] },
        });
        const loaded = (await api.get(`/notes/${note.id}`)).body.note;
        assert.match(loaded.content.content[0].attrs.src, new RegExp(`^/notes/attachments/${attachment.id}/file\\?exp=`));
        assert.equal(loaded.attachments.length, 1);

        // Deleting the note deletes its files.
        await api.delete(`/notes/${note.id}`);
        assert.equal((await request(app).get(attachment.url)).status, 404);
    });

    test("can't attach files to someone else's note", async () => {
        const owner = as(await createUser());
        const note = (await owner.post('/notes', {})).body.note;
        const res = await as(await createUser()).upload(`/notes/${note.id}/attachments`, PNG, 'image/png', 'x.png');
        assert.equal(res.status, 404);
    });
});
