// Backs a notes folder up to the user's cloud storage (one way: nothing is read back).
//
// Layout in the cloud, under the provider's root ("DoneYet" in Google Drive):
//   <Folder>/                      the synced folder
//     <Subfolder>/<Note>.md        subfolders and notes mirror the app
//     attachments/<id>-<file>      images and PDFs, linked from the notes
//
// cloud_sync_items remembers what each sync uploaded, so the next one only uploads
// what changed (by content hash), renames or moves what was renamed or moved, and
// bins what was deleted in the app. Removed items go to the provider's bin, so a
// mistake is recoverable there.
import pool from '../../db/pool.js';
import { getProvider } from './providers.js';
import { decryptToken, encryptToken, sha256 } from './crypto.js';
import { CloudAuthError, CloudError, CloudReauthError, CloudRetryableError } from './http.js';
import { noteToMarkdown } from './markdown.js';

// A sync that has been "in progress" this long is assumed dead (server restarted).
const STALE_LOCK = '10 minutes';
const REFRESH_EARLY_MS = 2 * 60 * 1000;
const NAME_MAX = 120;

export class SyncBusyError extends Error {
    constructor() {
        super('A backup of this folder is already running');
        this.name = 'SyncBusyError';
    }
}

// A name that's safe as a file or folder name everywhere people might download it.
export function safeName(name, fallback = 'Untitled') {
    const cleaned = String(name ?? '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+/, '')
        .slice(0, NAME_MAX)
        .trim();
    return cleaned || fallback;
}

// Hands out unique names within one folder (case-insensitive): "Notes", "Notes (2)".
function nameAllocator(reserved = []) {
    const used = new Set(reserved.map((n) => n.toLowerCase()));
    return (base, ext = '') => {
        let candidate = `${base}${ext}`;
        for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base} (${i})${ext}`;
        used.add(candidate.toLowerCase());
        return candidate;
    };
}

// ---------- Tokens ----------

// A live access token for the connection, refreshed (and saved) when it's about to
// expire or `force` is set. A refresh token that stopped working marks the connection
// as needing to reconnect.
export async function accessTokenFor(connection, { force = false } = {}) {
    const provider = getProvider(connection.provider);
    const expiresSoon = connection.expires_at && new Date(connection.expires_at).getTime() - Date.now() < REFRESH_EARLY_MS;
    if (!force && !expiresSoon) return decryptToken(connection.access_token_enc);

    const refreshToken = decryptToken(connection.refresh_token_enc);
    try {
        if (!refreshToken) throw new CloudReauthError('No refresh token');
        const fresh = await provider.refresh(refreshToken);
        const accessEnc = encryptToken(fresh.accessToken);
        const refreshEnc = fresh.refreshToken ? encryptToken(fresh.refreshToken) : connection.refresh_token_enc;
        await pool.query(
            'UPDATE cloud_connections SET access_token_enc = $1, refresh_token_enc = $2, expires_at = $3 WHERE id = $4',
            [accessEnc, refreshEnc, fresh.expiresAt, connection.id]
        );
        Object.assign(connection, { access_token_enc: accessEnc, refresh_token_enc: refreshEnc, expires_at: fresh.expiresAt });
        return fresh.accessToken;
    } catch (err) {
        if (err instanceof CloudReauthError) {
            await pool.query("UPDATE cloud_connections SET status = 'reauth' WHERE id = $1", [connection.id]);
            connection.status = 'reauth';
        }
        throw err;
    }
}

// Calls fn(token); if the token is rejected, refreshes it once and tries again.
async function withToken(connection, fn) {
    try {
        return await fn(await accessTokenFor(connection));
    } catch (err) {
        if (!(err instanceof CloudAuthError)) throw err;
        return fn(await accessTokenFor(connection, { force: true }));
    }
}

// ---------- Loading what to sync ----------

async function loadSubtree(userId, folderId) {
    const folders = await pool.query(
        'WITH RECURSIVE down AS ('
        + ' SELECT id, parent_id, name FROM note_folders WHERE id = $1 AND user_id = $2'
        + ' UNION ALL SELECT f.id, f.parent_id, f.name FROM note_folders f JOIN down ON f.parent_id = down.id'
        + ') SELECT id, parent_id, name FROM down',
        [folderId, userId]
    );
    const ids = folders.rows.map((f) => f.id);
    const notes = ids.length === 0 ? { rows: [] } : await pool.query(
        'SELECT id, folder_id, title, content FROM notes WHERE user_id = $1 AND folder_id = ANY($2) ORDER BY lower(title), id',
        [userId, ids]
    );
    const noteIds = notes.rows.map((n) => n.id);
    const attachments = noteIds.length === 0 ? { rows: [] } : await pool.query(
        'SELECT id, note_id, filename, mime_type, size_bytes FROM note_attachments WHERE user_id = $1 AND note_id = ANY($2) ORDER BY id',
        [userId, noteIds]
    );
    return { folders: folders.rows, notes: notes.rows, attachments: attachments.rows };
}

// ---------- One sync ----------

// Claims the sync (so no one else runs it at the same time) and clears `dirty`: edits
// made while it runs set it again, so they're picked up by the next run.
async function claim(syncId) {
    const result = await pool.query(
        'UPDATE cloud_folder_syncs SET syncing_since = NOW(), last_attempt_at = NOW(), dirty = FALSE'
        + ` WHERE id = $1 AND (syncing_since IS NULL OR syncing_since < NOW() - INTERVAL '${STALE_LOCK}')`
        + ' RETURNING *',
        [syncId]
    );
    return result.rows[0] ?? null;
}

// Runs one sync of a folder. Resolves to { uploaded, moved, removed, skipped }; throws
// SyncBusyError if it's already running, or the provider error if it failed (the row
// records the error either way).
export async function syncFolder(syncId) {
    const sync = await claim(syncId);
    if (!sync) throw new SyncBusyError();

    try {
        const connection = (await pool.query('SELECT * FROM cloud_connections WHERE id = $1', [sync.connection_id])).rows[0];
        if (!connection || connection.status !== 'ok') throw new CloudReauthError('Reconnect your account to resume backups');
        const provider = getProvider(connection.provider);
        if (!provider?.isConfigured()) throw new CloudError('This provider is not set up on the server');

        const stats = await runSync({ sync, connection, provider });
        await pool.query(
            'UPDATE cloud_folder_syncs SET syncing_since = NULL, last_synced_at = NOW(), last_error = NULL, failures = 0 WHERE id = $1',
            [sync.id]
        );
        return stats;
    } catch (err) {
        const message = err instanceof CloudReauthError ? 'Reconnect your account to resume backups'
            : err instanceof CloudRetryableError || err instanceof CloudError ? err.message
            : 'Something went wrong while backing up';
        if (!(err instanceof CloudError || err instanceof CloudRetryableError || err instanceof CloudReauthError)) {
            console.error(`[cloud] sync ${sync.id} failed:`, err);
        }
        await pool.query(
            'UPDATE cloud_folder_syncs SET syncing_since = NULL, dirty = TRUE, failures = failures + 1, last_error = $2 WHERE id = $1',
            [sync.id, message.slice(0, 500)]
        );
        throw err;
    }
}

async function runSync({ sync, connection, provider }) {
    const stats = { uploaded: 0, moved: 0, removed: 0, skipped: 0 };
    const call = (fn) => withToken(connection, fn);

    // The provider's root for this account ("DoneYet" in Google Drive), made once.
    if (!connection.root_ref) {
        const root = await call((token) => provider.getRoot(token));
        await pool.query('UPDATE cloud_connections SET root_ref = $1 WHERE id = $2', [root, connection.id]);
        connection.root_ref = root;
    }

    const tree = await loadSubtree(sync.user_id, sync.folder_id);
    if (tree.folders.length === 0) return stats; // folder deleted mid-sync; the row cascades away

    const existing = new Map(
        (await pool.query('SELECT * FROM cloud_sync_items WHERE sync_id = $1', [sync.id])).rows
            .map((row) => [`${row.kind}:${row.local_id}`, row])
    );
    const seen = new Set();

    async function record(kind, localId, ref, name, parentRef, hash = null) {
        await pool.query(
            'INSERT INTO cloud_sync_items (sync_id, kind, local_id, remote_ref, remote_name, parent_ref, content_hash)'
            + ' VALUES ($1, $2, $3, $4, $5, $6, $7)'
            + ' ON CONFLICT (sync_id, kind, local_id) DO UPDATE SET remote_ref = $4, remote_name = $5, parent_ref = $6, content_hash = $7',
            [sync.id, kind, localId, ref, name, parentRef, hash]
        );
        existing.set(`${kind}:${localId}`, { kind, local_id: localId, remote_ref: ref, remote_name: name, parent_ref: parentRef, content_hash: hash });
    }

    // A folder: created, or renamed/moved to match. Recreated if it was deleted in the cloud.
    async function ensureFolder(kind, localId, parentRef, name) {
        const key = `${kind}:${localId}`;
        seen.add(key);
        const item = existing.get(key);
        if (item && item.remote_name === name && item.parent_ref === parentRef) return item.remote_ref;
        if (item) {
            try {
                const moved = await call((token) => provider.move(token, item.remote_ref, { name, parentRef, oldParentRef: item.parent_ref }));
                await record(kind, localId, moved.ref, name, parentRef);
                stats.moved += 1;
                return moved.ref;
            } catch (err) {
                if (!(err instanceof CloudError && err.status === 404)) throw err;
            }
        }
        const created = await call((token) => provider.createFolder(token, parentRef, name));
        await record(kind, localId, created.ref, name, parentRef);
        stats.uploaded += 1;
        return created.ref;
    }

    // A file: uploaded if new or changed (by hash), moved first if its folder changed.
    async function ensureFile(kind, localId, parentRef, name, hash, mimeType, getContent) {
        const key = `${kind}:${localId}`;
        seen.add(key);
        let item = existing.get(key);
        if (item && item.content_hash === hash && item.parent_ref === parentRef) {
            stats.skipped += 1;
            return;
        }
        try {
            if (item && item.parent_ref !== parentRef) {
                const moved = await call((token) => provider.move(token, item.remote_ref, { parentRef, oldParentRef: item.parent_ref }));
                item = { ...item, remote_ref: moved.ref };
                stats.moved += 1;
            }
            const content = await getContent();
            const uploaded = await call((token) => provider.uploadFile(token, parentRef, name, content, mimeType, item?.remote_ref ?? null));
            await record(kind, localId, uploaded.ref, name, parentRef, hash);
        } catch (err) {
            // Deleted in the cloud: upload it again as a new file.
            if (!(item && err instanceof CloudError && err.status === 404)) throw err;
            const content = await getContent();
            const uploaded = await call((token) => provider.uploadFile(token, parentRef, name, content, mimeType, null));
            await record(kind, localId, uploaded.ref, name, parentRef, hash);
        }
        stats.uploaded += 1;
    }

    // Folders by parent, notes by folder, attachments by note.
    const childFolders = new Map();
    for (const f of tree.folders) {
        if (!childFolders.has(f.parent_id)) childFolders.set(f.parent_id, []);
        childFolders.get(f.parent_id).push(f);
    }
    const notesIn = new Map();
    for (const n of tree.notes) {
        if (!notesIn.has(n.folder_id)) notesIn.set(n.folder_id, []);
        notesIn.get(n.folder_id).push(n);
    }

    // Attachments first, so notes can link to them.
    const top = tree.folders.find((f) => f.id === sync.folder_id);
    const topRef = await ensureFolder('folder', top.id, connection.root_ref, safeName(top.name));
    const attachmentNames = new Map();
    if (tree.attachments.length > 0) {
        const attachmentsRef = await ensureFolder('attachments', 0, topRef, 'attachments');
        for (const a of tree.attachments) {
            const name = `${a.id}-${safeName(a.filename, 'file')}`;
            attachmentNames.set(a.id, name);
            await ensureFile('attachment', a.id, attachmentsRef, name, `att:${a.id}:${a.size_bytes}`, a.mime_type, async () => {
                const row = await pool.query('SELECT data FROM note_attachments WHERE id = $1', [a.id]);
                return row.rows[0].data;
            });
        }
    }

    async function walk(folder, folderRef, depth) {
        const allocate = nameAllocator(depth === 0 ? ['attachments'] : []);
        const subfolders = (childFolders.get(folder.id) ?? []).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
        const subNames = subfolders.map((sub) => allocate(safeName(sub.name)));
        for (const [i, sub] of subfolders.entries()) {
            const ref = await ensureFolder('folder', sub.id, folderRef, subNames[i]);
            await walk(sub, ref, depth + 1);
        }
        const prefix = `${'../'.repeat(depth)}attachments/`;
        for (const note of notesIn.get(folder.id) ?? []) {
            const name = allocate(safeName(note.title), '.md');
            const markdown = noteToMarkdown(note, (id) => (attachmentNames.has(id) ? { name: attachmentNames.get(id), path: prefix + attachmentNames.get(id) } : null));
            const content = Buffer.from(markdown, 'utf8');
            await ensureFile('note', note.id, folderRef, name, sha256(`${name}\n${markdown}`), 'text/markdown', async () => content);
        }
    }
    await walk(top, topRef, 0);

    // Whatever was synced before but isn't in the folder any more goes to the bin. Items
    // inside a removed folder go with it, so only the top-most ones are removed.
    const gone = [...existing.entries()].filter(([key]) => !seen.has(key)).map(([, item]) => item);
    const goneFolders = new Set(gone.filter((i) => i.kind === 'folder' || i.kind === 'attachments').map((i) => i.remote_ref));
    for (const item of gone) {
        if (!goneFolders.has(item.parent_ref)) {
            try {
                await call((token) => provider.remove(token, item.remote_ref));
            } catch (err) {
                if (!(err instanceof CloudError && err.status === 404)) throw err;
            }
            stats.removed += 1;
        }
        await pool.query('DELETE FROM cloud_sync_items WHERE sync_id = $1 AND kind = $2 AND local_id = $3', [sync.id, item.kind, item.local_id]);
    }

    return stats;
}

// ---------- Change tracking and the background worker ----------

// Called after the user changes their notes: their backups sync on the next worker
// pass once they've stopped editing for a bit.
export async function markUserDirty(userId) {
    await pool.query('UPDATE cloud_folder_syncs SET dirty = TRUE, dirty_at = NOW() WHERE user_id = $1', [userId]);
}

// Syncs that are due: changed, quiet for QUIET_SECONDS (so typing doesn't trigger a
// sync per keystroke), not running, and past their back-off after failures (1, 2, 4
// ... minutes, up to 6 hours).
const QUIET_SECONDS = 60;
export async function dueSyncs(limit = 5) {
    const result = await pool.query(
        'SELECT s.id FROM cloud_folder_syncs s JOIN cloud_connections c ON c.id = s.connection_id'
        + " WHERE s.dirty AND c.status = 'ok'"
        + ` AND (s.dirty_at IS NULL OR s.dirty_at < NOW() - INTERVAL '${QUIET_SECONDS} seconds')`
        + ` AND (s.syncing_since IS NULL OR s.syncing_since < NOW() - INTERVAL '${STALE_LOCK}')`
        + ' AND (s.last_attempt_at IS NULL OR s.last_attempt_at < NOW() - make_interval(secs => LEAST(60 * power(2, LEAST(s.failures, 10)), 21600)))'
        + ' ORDER BY s.last_attempt_at NULLS FIRST LIMIT $1',
        [limit]
    );
    return result.rows.map((r) => r.id);
}

export async function processDueSyncs() {
    let done = 0;
    for (const id of await dueSyncs()) {
        try {
            await syncFolder(id);
            done += 1;
        } catch (err) {
            if (!(err instanceof SyncBusyError)) console.warn(`[cloud] sync ${id}: ${err.message}`);
        }
    }
    return done;
}

const CHECK_INTERVAL_MS = 60_000;

export function startCloudSyncScheduler() {
    let running = false;
    async function tick() {
        if (running) return;
        running = true;
        try {
            const done = await processDueSyncs();
            if (done > 0) console.log(`[cloud] Backed up ${done} folder(s)`);
        } catch (err) {
            console.error('[cloud] Check failed:', err.message);
        } finally {
            running = false;
        }
    }
    tick();
    const timer = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
}
