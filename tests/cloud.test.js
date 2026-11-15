// Cloud backup: connecting (OAuth with PKCE), per-folder backups and the sync engine.
// Google Drive is replaced by an in-memory fake with the same interface.
import { after, afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { accessTokenFor, app, createUser, pool, resetDatabase } from './helpers.js';
import { setProviderForTests } from '../services/cloud/providers.js';
import { decryptToken, encryptToken } from '../services/cloud/crypto.js';
import { CloudAuthError, CloudReauthError } from '../services/cloud/http.js';
import { dueSyncs, safeName, syncFolder } from '../services/cloud/sync.js';
import { noteToMarkdown } from '../services/cloud/markdown.js';

const PROVIDER = 'google-drive';
const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000'
    + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
    'hex'
);

// An in-memory "Drive": items by ref, plus a log of calls.
function fakeDrive() {
    let next = 1;
    const items = new Map();
    const calls = [];
    const fake = {
        items, calls,
        failNext: null,       // an error to throw from the next API call
        refreshError: null,   // an error to throw from refresh()
        name: PROVIDER,
        label: 'Google Drive',
        isConfigured: () => true,
        authorizeUrl: ({ state, challenge, redirectUri }) => `https://fake.example/auth?${new URLSearchParams({ state, challenge, redirectUri })}`,
        async exchangeCode({ code, verifier }) {
            calls.push(['exchangeCode', code, verifier]);
            return { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: new Date(Date.now() + 3600_000) };
        },
        async refresh(refreshToken) {
            calls.push(['refresh', refreshToken]);
            if (fake.refreshError) throw fake.refreshError;
            return { accessToken: `access-refreshed-${calls.length}`, refreshToken: null, expiresAt: new Date(Date.now() + 3600_000) };
        },
        async getAccount() {
            return { email: 'student@example.com', name: 'Student' };
        },
        async revoke(token) {
            calls.push(['revoke', token]);
        },
    };
    const api = (name, fn) => async (token, ...args) => {
        calls.push([name, token, ...args.map((a) => (Buffer.isBuffer(a) ? a.toString('utf8') : a))]);
        if (fake.failNext) {
            const err = fake.failNext;
            fake.failNext = null;
            throw err;
        }
        return fn(...args);
    };
    Object.assign(fake, {
        getRoot: api('getRoot', () => {
            const ref = `r${next++}`;
            items.set(ref, { name: 'DoneYet', parent: 'root', folder: true });
            return ref;
        }),
        createFolder: api('createFolder', (parent, name) => {
            const ref = `r${next++}`;
            items.set(ref, { name, parent, folder: true });
            return { ref };
        }),
        uploadFile: api('uploadFile', (parent, name, content, mime, existing) => {
            const ref = existing ?? `r${next++}`;
            const old = items.get(ref);
            items.set(ref, { name, parent: existing ? old.parent : parent, content: content.toString('utf8'), mime });
            return { ref };
        }),
        move: api('move', (ref, { name, parentRef }) => {
            const item = items.get(ref);
            if (name) item.name = name;
            if (parentRef) item.parent = parentRef;
            return { ref };
        }),
        remove: api('remove', (ref) => {
            items.get(ref).trashed = true;
        }),
    });
    // "DoneYet/Folder/Note.md"-style paths of everything not in the bin.
    fake.paths = () => {
        const pathOf = (ref) => {
            const item = items.get(ref);
            return item.parent === 'root' ? item.name : `${pathOf(item.parent)}/${item.name}`;
        };
        const binned = (ref) => {
            for (let r = ref; r && items.get(r); r = items.get(r).parent) if (items.get(r).trashed) return true;
            return false;
        };
        return [...items.keys()].filter((r) => !binned(r)).map(pathOf).sort();
    };
    fake.fileAt = (path) => [...items.entries()].find(([ref]) => fake.paths().includes(path) && pathOfRef(ref) === path)?.[1];
    const pathOfRef = (ref) => {
        const item = items.get(ref);
        return item.parent === 'root' ? item.name : `${pathOfRef(item.parent)}/${item.name}`;
    };
    return fake;
}

let drive;
beforeEach(async () => {
    await resetDatabase();
    drive = fakeDrive();
    setProviderForTests(PROVIDER, drive);
});
afterEach(() => setProviderForTests(PROVIDER, null));
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

const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

// Signs the user in to the fake provider through the real connect + callback routes.
async function connect(api, folderId) {
    const started = await api.post(`/cloud/${PROVIDER}/connect`, folderId ? { folder_id: folderId } : {});
    assert.equal(started.status, 200);
    const state = new URL(started.body.url).searchParams.get('state');
    return request(app).get(`/cloud/${PROVIDER}/callback?code=the-code&state=${encodeURIComponent(state)}`);
}

async function syncIdFor(folderId) {
    return (await pool.query('SELECT id FROM cloud_folder_syncs WHERE folder_id = $1', [folderId])).rows[0].id;
}

describe('connecting', () => {
    test('the connect URL carries a state and a PKCE challenge, and the callback stores encrypted tokens', async () => {
        const user = await createUser();
        const api = as(user);
        const started = await api.post(`/cloud/${PROVIDER}/connect`, {});
        const url = new URL(started.body.url);
        const state = url.searchParams.get('state');
        assert.ok(state.length >= 40);
        assert.ok(url.searchParams.get('challenge').length >= 40);
        assert.match(url.searchParams.get('redirectUri'), /\/cloud\/google-drive\/callback$/);

        const back = await request(app).get(`/cloud/${PROVIDER}/callback?code=abc&state=${encodeURIComponent(state)}`);
        assert.equal(back.status, 303);
        assert.match(back.headers.location, /\/notes\?cloud=google-drive&cloud_result=connected$/);

        // The verifier sent with the code is the one whose challenge was in the URL.
        const [, code, verifier] = drive.calls.find((c) => c[0] === 'exchangeCode');
        assert.equal(code, 'abc');
        const crypto = await import('crypto');
        assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'), url.searchParams.get('challenge'));

        const row = (await pool.query('SELECT * FROM cloud_connections WHERE user_id = $1', [user.id])).rows[0];
        assert.equal(row.account_email, 'student@example.com');
        assert.doesNotMatch(row.access_token_enc, /access-1/);
        assert.equal(decryptToken(row.refresh_token_enc), 'refresh-1');

        const listed = (await api.get('/cloud')).body.providers;
        assert.deepEqual(listed.map((p) => [p.name, p.configured, p.connection?.account_email]), [[PROVIDER, true, 'student@example.com']]);
    });

    test('a state works once, and bad or cancelled callbacks connect nothing', async () => {
        const user = await createUser();
        const api = as(user);
        const started = await api.post(`/cloud/${PROVIDER}/connect`, {});
        const state = new URL(started.body.url).searchParams.get('state');

        const cancelled = await request(app).get(`/cloud/${PROVIDER}/callback?error=access_denied&state=${encodeURIComponent(state)}`);
        assert.match(cancelled.headers.location, /cloud_result=cancelled/);
        const reused = await request(app).get(`/cloud/${PROVIDER}/callback?code=abc&state=${encodeURIComponent(state)}`);
        assert.match(reused.headers.location, /cloud_result=expired/);
        const forged = await request(app).get(`/cloud/${PROVIDER}/callback?code=abc&state=made-up`);
        assert.match(forged.headers.location, /cloud_result=expired/);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM cloud_connections')).rows[0].n, 0);
    });

    test('sends the user back to the folder they started from', async () => {
        const api = as(await createUser());
        const folder = (await api.post('/notes/folders', { name: 'Bio' })).body.folder;
        const back = await connect(api, folder.id);
        assert.match(back.headers.location, new RegExp(`/notes\\?folder=${folder.id}&cloud=google-drive&cloud_result=connected$`));
    });

    test('disconnecting revokes the token and stops every backup', async () => {
        const user = await createUser();
        const api = as(user);
        const folder = (await api.post('/notes/folders', { name: 'Bio' })).body.folder;
        await connect(api);
        await api.put(`/cloud/folders/${folder.id}/${PROVIDER}`);

        assert.equal((await api.delete(`/cloud/${PROVIDER}`)).status, 200);
        assert.ok(drive.calls.some((c) => c[0] === 'revoke' && c[1] === 'refresh-1'));
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM cloud_folder_syncs')).rows[0].n, 0);
        assert.equal((await api.delete(`/cloud/${PROVIDER}`)).status, 404);
    });

    test('unknown providers and unconfigured servers are refused', async () => {
        const api = as(await createUser());
        assert.equal((await api.post('/cloud/dropbox/connect', {})).status, 404);
        setProviderForTests(PROVIDER, { ...drive, isConfigured: () => false });
        assert.equal((await api.post(`/cloud/${PROVIDER}/connect`, {})).status, 503);
    });
});

describe('folder backups', () => {
    test('need a connection, and one backup per branch of folders', async () => {
        const api = as(await createUser());
        const school = (await api.post('/notes/folders', { name: 'School' })).body.folder;
        const bio = (await api.post('/notes/folders', { name: 'Bio', parent_id: school.id })).body.folder;
        assert.equal((await api.put(`/cloud/folders/${bio.id}/${PROVIDER}`)).status, 400, 'not connected yet');

        await connect(api);
        assert.equal((await api.put(`/cloud/folders/${bio.id}/${PROVIDER}`)).status, 201);
        const parent = await api.put(`/cloud/folders/${school.id}/${PROVIDER}`);
        assert.equal(parent.status, 409);
        assert.match(parent.body.message, /folder inside this one \("Bio"\)/);

        await api.delete(`/cloud/folders/${bio.id}/${PROVIDER}`);
        assert.equal((await api.put(`/cloud/folders/${school.id}/${PROVIDER}`)).status, 201);
        const child = await api.put(`/cloud/folders/${bio.id}/${PROVIDER}`);
        assert.equal(child.status, 409);
        assert.match(child.body.message, /part of "School"/);

        const status = (await api.get(`/cloud/folders/${bio.id}`)).body.backups[0];
        assert.equal(status.backup, null);
        assert.deepEqual(status.covered_by, { id: school.id, name: 'School' });
    });

    test("can't touch another user's folders", async () => {
        const owner = as(await createUser());
        const folder = (await owner.post('/notes/folders', { name: 'Private' })).body.folder;
        const stranger = as(await createUser());
        await connect(stranger);
        assert.equal((await stranger.get(`/cloud/folders/${folder.id}`)).status, 404);
        assert.equal((await stranger.put(`/cloud/folders/${folder.id}/${PROVIDER}`)).status, 404);
    });

    test('editing notes flags the backup, and it waits for the user to stop editing', async () => {
        const user = await createUser();
        const api = as(user);
        const folder = (await api.post('/notes/folders', { name: 'Bio' })).body.folder;
        await connect(api);
        await api.put(`/cloud/folders/${folder.id}/${PROVIDER}`);
        const id = await syncIdFor(folder.id);
        await syncFolder(id);
        assert.equal((await pool.query('SELECT dirty FROM cloud_folder_syncs WHERE id = $1', [id])).rows[0].dirty, false);

        await api.post('/notes', { folder_id: folder.id, title: 'New' });
        await new Promise((r) => setTimeout(r, 50)); // the flag is set when the response finishes
        assert.equal((await pool.query('SELECT dirty FROM cloud_folder_syncs WHERE id = $1', [id])).rows[0].dirty, true);
        assert.deepEqual(await dueSyncs(), [], 'just edited: not due yet');

        await pool.query("UPDATE cloud_folder_syncs SET dirty_at = NOW() - INTERVAL '2 minutes', last_attempt_at = NOW() - INTERVAL '2 minutes'");
        assert.deepEqual(await dueSyncs(), [id]);
    });
});

describe('syncing', () => {
    async function setUp() {
        const user = await createUser();
        const api = as(user);
        const folder = (await api.post('/notes/folders', { name: 'Biology' })).body.folder;
        const sub = (await api.post('/notes/folders', { name: 'Labs', parent_id: folder.id })).body.folder;
        const cells = (await api.post('/notes', { folder_id: folder.id, title: 'Cells' })).body.note;
        const att = (await api.upload(`/notes/${cells.id}/attachments`, PNG, 'image/png', 'cell.png')).body.attachment;
        await api.put(`/notes/${cells.id}`, {
            content: {
                type: 'doc',
                content: [paragraph('Cells have a nucleus.'), { type: 'image', attrs: { src: att.url, alt: 'A cell', attachmentId: att.id } }],
            },
        });
        const lab = (await api.post('/notes', { folder_id: sub.id, title: 'Lab 1' })).body.note;
        await api.put(`/notes/${lab.id}`, { content: { type: 'doc', content: [{ type: 'image', attrs: { src: att.url, attachmentId: att.id } }] } });
        await connect(api);
        await api.put(`/cloud/folders/${folder.id}/${PROVIDER}`);
        return { user, api, folder, sub, cells, lab, att, syncId: await syncIdFor(folder.id) };
    }

    test('mirrors the folder as Markdown with attachments, then only uploads changes', async () => {
        const { syncId, att } = await setUp();
        const first = await syncFolder(syncId);
        assert.deepEqual(drive.paths(), [
            'DoneYet',
            'DoneYet/Biology',
            'DoneYet/Biology/Cells.md',
            'DoneYet/Biology/Labs',
            'DoneYet/Biology/Labs/Lab 1.md',
            'DoneYet/Biology/attachments',
            `DoneYet/Biology/attachments/${att.id}-cell.png`,
        ]);
        assert.equal(first.uploaded, 6);

        const cells = drive.fileAt('DoneYet/Biology/Cells.md');
        assert.equal(cells.mime, 'text/markdown');
        assert.equal(cells.content, `# Cells\n\nCells have a nucleus.\n\n![A cell](attachments/${att.id}-cell.png)\n`);
        assert.match(drive.fileAt('DoneYet/Biology/Labs/Lab 1.md').content, new RegExp(`\\(\\.\\./attachments/${att.id}-cell\\.png\\)`));

        const again = await syncFolder(syncId);
        assert.deepEqual({ uploaded: again.uploaded, moved: again.moved, removed: again.removed }, { uploaded: 0, moved: 0, removed: 0 });
    });

    test('renames, moves and deletions in the app follow into the cloud (deletions to the bin)', async () => {
        const { api, syncId, folder, sub, cells, lab } = await setUp();
        await syncFolder(syncId);
        const cellsRef = [...drive.items.entries()].find(([, i]) => i.name === 'Cells.md')[0];

        await api.put(`/notes/${cells.id}`, { title: 'Cell biology' });
        await api.put(`/notes/folders/${sub.id}`, { name: 'Practicals' });
        await api.put(`/notes/folders/${folder.id}`, { name: 'Bio 101' });
        await syncFolder(syncId);
        assert.ok(drive.paths().includes('DoneYet/Bio 101/Cell biology.md'));
        assert.ok(drive.paths().includes('DoneYet/Bio 101/Practicals/Lab 1.md'));
        assert.equal(drive.items.get(cellsRef).name, 'Cell biology.md', 'the same file was updated, not a copy');

        await api.put(`/notes/${cells.id}`, { folder_id: sub.id });
        await api.delete(`/notes/${lab.id}`);
        const stats = await syncFolder(syncId);
        assert.ok(drive.paths().includes('DoneYet/Bio 101/Practicals/Cell biology.md'));
        assert.ok(!drive.paths().some((p) => p.endsWith('Lab 1.md')));
        assert.equal(stats.removed, 1);

        // Deleting a subfolder bins the folder itself, not each file in it. (Its note owned
        // the only attachment, so the now-empty attachments folder goes too.)
        const refOf = (name) => [...drive.items.entries()].find(([, i]) => i.name === name)[0];
        const [practicals, attachments] = [refOf('Practicals'), refOf('attachments')];
        const removesBefore = drive.calls.filter((c) => c[0] === 'remove').length;
        await api.delete(`/notes/folders/${sub.id}`);
        await syncFolder(syncId);
        const removed = drive.calls.filter((c) => c[0] === 'remove').slice(removesBefore).map((c) => c[2]).sort();
        assert.deepEqual(removed, [practicals, attachments].sort());
        assert.deepEqual(drive.paths(), ['DoneYet', 'DoneYet/Bio 101']);
    });

    test('duplicate names get numbered, and unsafe characters are replaced', async () => {
        const user = await createUser();
        const api = as(user);
        const folder = (await api.post('/notes/folders', { name: 'Exam: prep?' })).body.folder;
        await api.post('/notes', { folder_id: folder.id, title: 'Plan' });
        await api.post('/notes', { folder_id: folder.id, title: 'plan' });
        await api.post('/notes', { folder_id: folder.id, title: 'a/b' });
        await connect(api);
        await api.put(`/cloud/folders/${folder.id}/${PROVIDER}`);
        await syncFolder(await syncIdFor(folder.id));
        const files = drive.paths().filter((p) => p.endsWith('.md')).map((p) => p.split('/').pop()).sort();
        assert.deepEqual(files, ['Plan.md', 'a-b.md', 'plan (2).md']);
        assert.ok(drive.paths().includes('DoneYet/Exam- prep-'));
        assert.equal(safeName('  ..hidden  '), 'hidden');
        assert.equal(safeName(''), 'Untitled');
    });

    test('an expired access token is refreshed first, and a rejected one is refreshed and retried', async () => {
        const { syncId } = await setUp();
        await pool.query("UPDATE cloud_connections SET expires_at = NOW() - INTERVAL '1 minute'");
        await syncFolder(syncId);
        assert.equal(drive.calls.filter((c) => c[0] === 'refresh').length, 1);
        assert.match(drive.calls.find((c) => c[0] === 'getRoot')[1], /^access-refreshed/);

        await pool.query("UPDATE cloud_connections SET expires_at = NOW() + INTERVAL '1 hour'");
        await pool.query('UPDATE cloud_folder_syncs SET dirty = TRUE');
        await pool.query("UPDATE notes SET title = 'Changed'"); // something to upload
        drive.failNext = new CloudAuthError('expired');
        await syncFolder(syncId);
        assert.equal(drive.calls.filter((c) => c[0] === 'refresh').length, 2);
    });

    test('a refresh token that stopped working asks the user to reconnect', async () => {
        const { api, folder, syncId } = await setUp();
        await pool.query("UPDATE cloud_connections SET expires_at = NOW() - INTERVAL '1 minute'");
        drive.refreshError = new CloudReauthError('revoked');

        const res = await api.post(`/cloud/folders/${folder.id}/${PROVIDER}/sync`);
        assert.equal(res.status, 409, 'not 401, which the app would read as its own login expiring');
        assert.equal(res.body.code, 'CLOUD_REAUTH');
        assert.equal((await pool.query('SELECT status FROM cloud_connections')).rows[0].status, 'reauth');
        const row = (await pool.query('SELECT * FROM cloud_folder_syncs WHERE id = $1', [syncId])).rows[0];
        assert.equal(row.dirty, true);
        assert.match(row.last_error, /Reconnect/);
        assert.deepEqual(await dueSyncs(), [], "the worker doesn't retry until they reconnect");

        // Reconnecting resumes it.
        drive.refreshError = null;
        await connect(api);
        assert.equal((await pool.query('SELECT status FROM cloud_connections')).rows[0].status, 'ok');
        await pool.query("UPDATE cloud_connections SET expires_at = NOW() + INTERVAL '1 hour'");
        assert.equal((await api.post(`/cloud/folders/${folder.id}/${PROVIDER}/sync`)).status, 200);
    });

    test('"Back up now" reports what it did, and a second one at the same time is refused', async () => {
        const { api, folder, syncId } = await setUp();
        const res = await api.post(`/cloud/folders/${folder.id}/${PROVIDER}/sync`);
        assert.equal(res.status, 200);
        assert.equal(res.body.stats.uploaded, 6);
        assert.ok(res.body.backup.last_synced_at);

        await pool.query('UPDATE cloud_folder_syncs SET syncing_since = NOW() WHERE id = $1', [syncId]);
        assert.equal((await api.post(`/cloud/folders/${folder.id}/${PROVIDER}/sync`)).status, 409);
    });
});

describe('Google Drive client (with fetch stubbed)', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    // Replies to each fetch in turn; records what was sent.
    function stubFetch(...replies) {
        const sent = [];
        globalThis.fetch = async (url, init) => {
            sent.push({ url: String(url), ...init });
            const r = replies.shift();
            return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers ?? {} });
        };
        return sent;
    }

    test('small files are a multipart upload into the parent folder', async () => {
        const { default: google } = await import('../services/cloud/google.js');
        const sent = stubFetch({ body: { id: 'file1' } });
        const result = await google.uploadFile('tok', 'parent1', 'Cells.md', Buffer.from('# Cells'), 'text/markdown');
        assert.deepEqual(result, { ref: 'file1' });
        assert.equal(sent[0].method, 'POST');
        assert.equal(sent[0].url, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
        assert.equal(sent[0].headers.Authorization, 'Bearer tok');
        assert.match(sent[0].headers['Content-Type'], /^multipart\/related; boundary=/);
        const body = sent[0].body.toString();
        assert.match(body, /\{"name":"Cells\.md","parents":\["parent1"\]\}/);
        assert.match(body, /Content-Type: text\/markdown\r\n\r\n# Cells\r\n/);
    });

    test('updating a file PATCHes it by id; big files use a resumable upload', async () => {
        const { default: google } = await import('../services/cloud/google.js');
        let sent = stubFetch({ body: { id: 'file1' } });
        await google.uploadFile('tok', 'parent1', 'New name.md', Buffer.from('x'), 'text/markdown', 'file1');
        assert.equal(sent[0].method, 'PATCH');
        assert.match(sent[0].url, /\/upload\/drive\/v3\/files\/file1\?uploadType=multipart/);
        assert.doesNotMatch(sent[0].body.toString(), /parents/);

        const big = Buffer.alloc(6 * 1024 * 1024, 1);
        sent = stubFetch({ headers: { location: 'https://upload.example/session1' } }, { body: { id: 'big1' } });
        assert.deepEqual(await google.uploadFile('tok', 'p', 'scan.pdf', big, 'application/pdf'), { ref: 'big1' });
        assert.match(sent[0].url, /uploadType=resumable/);
        assert.equal(sent[0].headers['X-Upload-Content-Length'], String(big.length));
        assert.equal(sent[1].url, 'https://upload.example/session1');
        assert.equal(sent[1].method, 'PUT');
        assert.equal(sent[1].body.length, big.length);
    });

    test('moving, binning, and the connect URL', async () => {
        const { default: google } = await import('../services/cloud/google.js');
        const sent = stubFetch({ body: { id: 'f' } }, { body: {} });
        await google.move('tok', 'f', { name: 'Renamed', parentRef: 'new', oldParentRef: 'old' });
        assert.match(sent[0].url, /\/drive\/v3\/files\/f\?fields=id&addParents=new&removeParents=old$/);
        assert.equal(sent[0].body, '{"name":"Renamed"}');
        await google.remove('tok', 'f');
        assert.equal(sent[1].body, '{"trashed":true}', 'to the bin, not deleted');

        process.env.GOOGLE_CLIENT_ID = 'client-123';
        try {
            const url = new URL(google.authorizeUrl({ state: 's', challenge: 'c', redirectUri: 'http://localhost:4000/cloud/google-drive/callback' }));
            assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file openid email profile');
            assert.equal(url.searchParams.get('access_type'), 'offline');
            assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
            assert.equal(url.searchParams.get('client_id'), 'client-123');
        } finally {
            delete process.env.GOOGLE_CLIENT_ID;
        }
    });

    test('errors map to refresh / reconnect / retry', async () => {
        const { default: google } = await import('../services/cloud/google.js');
        stubFetch({ status: 401, body: { error: { message: 'Invalid Credentials' } } });
        await assert.rejects(google.createFolder('tok', 'p', 'x'), { name: 'CloudAuthError' });
        stubFetch({ status: 503, body: {} });
        await assert.rejects(google.createFolder('tok', 'p', 'x'), { name: 'CloudRetryableError' });
        stubFetch({ status: 403, body: { error: { message: 'The user\'s Drive storage quota has been exceeded.' } } });
        await assert.rejects(google.createFolder('tok', 'p', 'x'), { name: 'CloudError', message: /quota/ });
        stubFetch({ status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } });
        await assert.rejects(google.refresh('old'), { name: 'CloudReauthError' });
    });
});

describe('helpers', () => {
    test('tokens are encrypted and tampering is detected', () => {
        const stored = encryptToken('secret-token');
        assert.notEqual(stored, encryptToken('secret-token'), 'random IV each time');
        assert.equal(decryptToken(stored), 'secret-token');
        const parts = stored.split('.');
        parts[3] = Buffer.from('forged').toString('base64url');
        assert.throws(() => decryptToken(parts.join('.')));
    });

    test('notes become readable Markdown', () => {
        const md = noteToMarkdown({
            title: 'Week #1',
            content: {
                type: 'doc',
                content: [
                    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plan' }] },
                    { type: 'paragraph', content: [
                        { type: 'text', text: 'Read ' },
                        { type: 'text', text: 'chapter 3', marks: [{ type: 'bold' }] },
                        { type: 'text', text: ' and ' },
                        { type: 'text', text: 'notes', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
                    ] },
                    { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('one')] }, { type: 'listItem', content: [paragraph('two')] }] },
                    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [paragraph('done')] }] },
                    { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [paragraph('first')] }] },
                    { type: 'blockquote', content: [paragraph('quoted')] },
                    { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'x = 1' }] },
                    { type: 'fileAttachment', attrs: { attachmentId: 9, filename: 'syllabus.pdf' } },
                ],
            },
        }, (id) => (id === 9 ? { name: '9-syllabus.pdf', path: 'attachments/9-syllabus.pdf' } : null));
        assert.equal(md, [
            '# Week \\#1', '', '## Plan', '', 'Read **chapter 3** and [notes](https://example.com)', '',
            '- one\n- two', '', '- [x] done', '', '1. first', '', '> quoted', '', '```js\nx = 1\n```', '',
            '📎 [syllabus.pdf](attachments/9-syllabus.pdf)', '',
        ].join('\n'));
    });
});
