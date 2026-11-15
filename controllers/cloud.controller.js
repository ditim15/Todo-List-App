import pool from '../db/pool.js';
import { getProvider, listProviders } from '../services/cloud/providers.js';
import { decryptToken, encryptToken, pkcePair, randomState, sha256 } from '../services/cloud/crypto.js';
import { CloudReauthError } from '../services/cloud/http.js';
import { SyncBusyError, syncFolder } from '../services/cloud/sync.js';

// Cloud backup of notes folders (services/cloud/). Connecting uses OAuth 2 with PKCE:
// POST /cloud/:provider/connect returns the provider's sign-in URL; the provider sends
// the browser back to GET /cloud/:provider/callback, which stores the (encrypted)
// tokens and redirects to the Notes page.

const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
// Where the provider sends the browser back to. Must match the redirect URI registered
// with the provider exactly.
export const callbackUrl = (provider) =>
    `${(process.env.API_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/$/, '')}/cloud/${provider}/callback`;

function providerOr404(req, res) {
    const provider = getProvider(req.params.provider);
    if (!provider) {
        res.status(404).json({ message: 'Unknown provider' });
        return null;
    }
    return provider;
}

function connectionJson(row) {
    return row ? { account_email: row.account_email, account_name: row.account_name, status: row.status, connected_at: row.created_at } : null;
}

// GET /cloud -> { providers: [{ name, label, configured, connection }] }
export const listConnections = async (req, res, next) => {
    try {
        const rows = (await pool.query('SELECT * FROM cloud_connections WHERE user_id = $1', [req.user.id])).rows;
        res.status(200).json({
            providers: listProviders().map((p) => ({
                name: p.name,
                label: p.label,
                configured: p.isConfigured(),
                connection: connectionJson(rows.find((r) => r.provider === p.name)),
            })),
        });
    } catch (err) {
        next(err);
    }
};

// POST /cloud/:provider/connect { folder_id? } -> { url }. folder_id is where to send
// the user back to (that folder's settings) afterwards.
export const startConnect = async (req, res, next) => {
    try {
        const provider = providerOr404(req, res);
        if (!provider) return;
        if (!provider.isConfigured()) return res.status(503).json({ message: `${provider.label} backup isn't set up on this server yet` });

        let returnFolderId = null;
        if (req.body?.folder_id !== undefined && req.body.folder_id !== null) {
            const id = Number(req.body.folder_id);
            const owned = Number.isInteger(id) && id > 0
                && (await pool.query('SELECT 1 FROM note_folders WHERE id = $1 AND user_id = $2', [id, req.user.id])).rows.length > 0;
            if (owned) returnFolderId = id;
        }

        const state = randomState();
        const { verifier, challenge } = pkcePair();
        await pool.query('DELETE FROM cloud_oauth_states WHERE expires_at < NOW() OR (user_id = $1 AND provider = $2)', [req.user.id, provider.name]);
        await pool.query(
            'INSERT INTO cloud_oauth_states (state_hash, user_id, provider, code_verifier, return_folder_id) VALUES ($1, $2, $3, $4, $5)',
            [sha256(state), req.user.id, provider.name, verifier, returnFolderId]
        );
        res.status(200).json({ url: provider.authorizeUrl({ state, challenge, redirectUri: callbackUrl(provider.name) }) });
    } catch (err) {
        next(err);
    }
};

// GET /cloud/:provider/callback?code&state (or ?error): no access token here; the
// browser arrives from the provider, and the user is identified by the state.
export const finishConnect = async (req, res, next) => {
    const back = (params) => res.redirect(303, `${appUrl()}/notes?${new URLSearchParams(params)}`);
    try {
        const provider = getProvider(req.params.provider);
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        // Single use: deleted as it's read.
        const pending = state
            ? (await pool.query('DELETE FROM cloud_oauth_states WHERE state_hash = $1 RETURNING *', [sha256(state)])).rows[0]
            : null;
        if (!provider || !pending || pending.provider !== provider.name || new Date(pending.expires_at) < new Date()) {
            return back({ cloud: req.params.provider, cloud_result: 'expired' });
        }
        const result = (outcome) => back({
            ...(pending.return_folder_id && { folder: String(pending.return_folder_id) }),
            cloud: provider.name,
            cloud_result: outcome,
        });
        if (req.query.error || typeof req.query.code !== 'string') return result('cancelled');

        const tokens = await provider.exchangeCode({ code: req.query.code, verifier: pending.code_verifier, redirectUri: callbackUrl(provider.name) });
        if (!tokens.refreshToken) return result('error');
        const account = await provider.getAccount(tokens.accessToken);

        // A different account than before starts fresh (its backups pointed at the old one).
        const previous = (await pool.query('SELECT id, account_email FROM cloud_connections WHERE user_id = $1 AND provider = $2', [pending.user_id, provider.name])).rows[0];
        if (previous && previous.account_email !== account.email) {
            await pool.query('DELETE FROM cloud_connections WHERE id = $1', [previous.id]);
        }
        await pool.query(
            'INSERT INTO cloud_connections (user_id, provider, account_email, account_name, access_token_enc, refresh_token_enc, expires_at)'
            + ' VALUES ($1, $2, $3, $4, $5, $6, $7)'
            + " ON CONFLICT (user_id, provider) DO UPDATE SET account_email = $3, account_name = $4, access_token_enc = $5,"
            + " refresh_token_enc = $6, expires_at = $7, status = 'ok'",
            [pending.user_id, provider.name, account.email, account.name, encryptToken(tokens.accessToken), encryptToken(tokens.refreshToken), tokens.expiresAt]
        );
        // Backups that stopped while it needed reconnecting resume straight away.
        await pool.query(
            'UPDATE cloud_folder_syncs SET dirty = TRUE, dirty_at = NULL, failures = 0, last_attempt_at = NULL'
            + ' WHERE connection_id = (SELECT id FROM cloud_connections WHERE user_id = $1 AND provider = $2)',
            [pending.user_id, provider.name]
        );
        return result('connected');
    } catch (err) {
        console.error(`[cloud] connecting ${req.params.provider} failed:`, err.message);
        if (res.headersSent) return next(err);
        return back({ cloud: req.params.provider, cloud_result: 'error' });
    }
};

// DELETE /cloud/:provider: stops every backup to it and forgets the account. Files
// already in the cloud stay there.
export const disconnect = async (req, res, next) => {
    try {
        const provider = providerOr404(req, res);
        if (!provider) return;
        const deleted = (await pool.query('DELETE FROM cloud_connections WHERE user_id = $1 AND provider = $2 RETURNING *', [req.user.id, provider.name])).rows[0];
        if (!deleted) return res.status(404).json({ message: 'Not connected' });
        // Best effort: the account is forgotten here either way.
        try {
            await provider.revoke(decryptToken(deleted.refresh_token_enc) ?? decryptToken(deleted.access_token_enc));
        } catch (err) {
            console.warn(`[cloud] couldn't revoke ${provider.name} token: ${err.message}`);
        }
        res.status(200).json({ message: 'Disconnected' });
    } catch (err) {
        next(err);
    }
};

// ---------- Per-folder backups ----------

async function ownedFolder(userId, folderId) {
    if (!/^[1-9]\d{0,9}$/.test(String(folderId))) return null;
    return (await pool.query('SELECT id, name, parent_id FROM note_folders WHERE id = $1 AND user_id = $2', [folderId, userId])).rows[0] ?? null;
}

// The folder's ancestors (nearest first) and descendants, for overlap checks.
async function relatives(folderId) {
    const up = await pool.query(
        'WITH RECURSIVE up AS (SELECT id, parent_id, name, 0 AS depth FROM note_folders WHERE id = $1'
        + ' UNION ALL SELECT f.id, f.parent_id, f.name, up.depth + 1 FROM note_folders f JOIN up ON f.id = up.parent_id)'
        + ' SELECT id, name FROM up WHERE id <> $1 ORDER BY depth',
        [folderId]
    );
    const down = await pool.query(
        'WITH RECURSIVE down AS (SELECT id FROM note_folders WHERE id = $1'
        + ' UNION ALL SELECT f.id FROM note_folders f JOIN down ON f.parent_id = down.id)'
        + ' SELECT id FROM down WHERE id <> $1',
        [folderId]
    );
    return { ancestors: up.rows, descendantIds: down.rows.map((r) => r.id) };
}

function syncJson(row) {
    return {
        last_synced_at: row.last_synced_at,
        last_error: row.last_error,
        pending: row.dirty,
        syncing: Boolean(row.syncing_since),
    };
}

// GET /cloud/folders/:folderId -> { backups: [{ provider, label, configured, connection,
// backup: {...} | null, covered_by: { id, name } | null }] }. covered_by: a parent folder
// whose backup already includes this one.
export const folderBackups = async (req, res, next) => {
    try {
        const folder = await ownedFolder(req.user.id, req.params.folderId);
        if (!folder) return res.status(404).json({ message: 'Folder not found' });
        const { ancestors } = await relatives(folder.id);
        const connections = (await pool.query('SELECT * FROM cloud_connections WHERE user_id = $1', [req.user.id])).rows;
        const syncs = (await pool.query(
            'SELECT s.*, c.provider FROM cloud_folder_syncs s JOIN cloud_connections c ON c.id = s.connection_id'
            + ' WHERE s.user_id = $1 AND s.folder_id = ANY($2)',
            [req.user.id, [folder.id, ...ancestors.map((a) => a.id)]]
        )).rows;

        res.status(200).json({
            backups: listProviders().map((p) => {
                const own = syncs.find((s) => s.provider === p.name && s.folder_id === folder.id);
                const parent = ancestors.find((a) => syncs.some((s) => s.provider === p.name && s.folder_id === a.id));
                return {
                    provider: p.name,
                    label: p.label,
                    configured: p.isConfigured(),
                    connection: connectionJson(connections.find((c) => c.provider === p.name)),
                    backup: own ? syncJson(own) : null,
                    covered_by: !own && parent ? { id: parent.id, name: parent.name } : null,
                };
            }),
        });
    } catch (err) {
        next(err);
    }
};

// Runs a sync in the background (not awaited). Off in tests, which call syncFolder
// themselves so nothing runs after a test has finished.
function kick(syncId) {
    if (process.env.NODE_ENV === 'test') return;
    setImmediate(() => syncFolder(syncId).catch((err) => {
        if (!(err instanceof SyncBusyError)) console.warn(`[cloud] sync ${syncId}: ${err.message}`);
    }));
}

// PUT /cloud/folders/:folderId/:provider: back the folder (and everything inside it) up.
export const enableBackup = async (req, res, next) => {
    try {
        const provider = providerOr404(req, res);
        if (!provider) return;
        const folder = await ownedFolder(req.user.id, req.params.folderId);
        if (!folder) return res.status(404).json({ message: 'Folder not found' });
        const connection = (await pool.query('SELECT * FROM cloud_connections WHERE user_id = $1 AND provider = $2', [req.user.id, provider.name])).rows[0];
        if (!connection) return res.status(400).json({ message: `Connect ${provider.label} first` });
        if (connection.status !== 'ok') return res.status(400).json({ message: `Reconnect ${provider.label} first` });

        // One backup per branch of folders, so nothing is uploaded twice.
        const { ancestors, descendantIds } = await relatives(folder.id);
        const overlapping = (await pool.query(
            'SELECT s.folder_id, f.name FROM cloud_folder_syncs s JOIN note_folders f ON f.id = s.folder_id'
            + ' WHERE s.connection_id = $1 AND s.folder_id = ANY($2)',
            [connection.id, [...ancestors.map((a) => a.id), ...descendantIds]]
        )).rows;
        const parent = overlapping.find((o) => ancestors.some((a) => a.id === o.folder_id));
        if (parent) return res.status(409).json({ message: `Already backed up as part of "${parent.name}"` });
        if (overlapping.length > 0) {
            return res.status(409).json({ message: `A folder inside this one ("${overlapping[0].name}") is already backed up. Stop that backup first, then back up this whole folder.` });
        }

        const created = await pool.query(
            'INSERT INTO cloud_folder_syncs (user_id, connection_id, folder_id) VALUES ($1, $2, $3)'
            + ' ON CONFLICT (connection_id, folder_id) DO NOTHING RETURNING *',
            [req.user.id, connection.id, folder.id]
        );
        const row = created.rows[0]
            ?? (await pool.query('SELECT * FROM cloud_folder_syncs WHERE connection_id = $1 AND folder_id = $2', [connection.id, folder.id])).rows[0];
        if (created.rows.length > 0) kick(row.id);
        res.status(created.rows.length > 0 ? 201 : 200).json({ backup: syncJson(row) });
    } catch (err) {
        next(err);
    }
};

// DELETE /cloud/folders/:folderId/:provider: stops the backup. What's in the cloud stays.
export const disableBackup = async (req, res, next) => {
    try {
        const provider = providerOr404(req, res);
        if (!provider) return;
        const deleted = await pool.query(
            'DELETE FROM cloud_folder_syncs s USING cloud_connections c'
            + ' WHERE c.id = s.connection_id AND s.user_id = $1 AND s.folder_id = $2 AND c.provider = $3 RETURNING s.id',
            [req.user.id, Number(req.params.folderId) || 0, provider.name]
        );
        if (deleted.rows.length === 0) return res.status(404).json({ message: 'This folder isn\'t backed up' });
        res.status(200).json({ message: 'Backup stopped' });
    } catch (err) {
        next(err);
    }
};

// POST /cloud/folders/:folderId/:provider/sync: backs up now and waits for it.
export const syncNow = async (req, res, next) => {
    try {
        const provider = providerOr404(req, res);
        if (!provider) return;
        const row = (await pool.query(
            'SELECT s.id FROM cloud_folder_syncs s JOIN cloud_connections c ON c.id = s.connection_id'
            + ' WHERE s.user_id = $1 AND s.folder_id = $2 AND c.provider = $3',
            [req.user.id, Number(req.params.folderId) || 0, provider.name]
        )).rows[0];
        if (!row) return res.status(404).json({ message: 'This folder isn\'t backed up' });

        try {
            const stats = await syncFolder(row.id);
            const updated = (await pool.query('SELECT * FROM cloud_folder_syncs WHERE id = $1', [row.id])).rows[0];
            res.status(200).json({ backup: syncJson(updated), stats });
        } catch (err) {
            if (err instanceof SyncBusyError) return res.status(409).json({ message: err.message });
            const updated = (await pool.query('SELECT * FROM cloud_folder_syncs WHERE id = $1', [row.id])).rows[0];
            // Not 401: the app reads that as its own login expiring.
            const status = err instanceof CloudReauthError ? 409 : 502;
            res.status(status).json({
                message: updated?.last_error ?? err.message,
                ...(err instanceof CloudReauthError && { code: 'CLOUD_REAUTH' }),
                backup: updated && syncJson(updated),
            });
        }
    } catch (err) {
        next(err);
    }
};
