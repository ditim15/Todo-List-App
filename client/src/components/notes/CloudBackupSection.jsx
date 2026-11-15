// The "Sync" section of Folder settings: back the folder up to Google Drive. One-way:
// notes are copied to Drive as Markdown files (with their images and PDFs) after you
// edit them; nothing is read back from Drive. Server side: routes/cloud.js.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
    disableFolderBackup,
    disconnectCloud,
    enableFolderBackup,
    getFolderBackups,
    startCloudConnect,
    syncFolderNow,
} from '../../api/cloud';
import { formatEdited } from './noteUtils';

// While a backup is running or hasn't finished its first pass, check again this often.
const POLL_MS = 4000;

function backupStatus(backup) {
    if (backup.syncing) return { text: 'Backing up…' };
    if (backup.last_error) return { text: backup.last_error, tone: 'error' };
    if (!backup.last_synced_at) return { text: 'Waiting for the first backup…' };
    if (backup.pending) return { text: `Last backed up ${formatEdited(backup.last_synced_at)}. Newer changes are backed up about a minute after you stop editing.` };
    return { text: `Up to date · backed up ${formatEdited(backup.last_synced_at)}`, tone: 'ok' };
}

function ProviderRow({ item, folder, onChanged, setError }) {
    const { authFetch } = useAuth();
    const [busy, setBusy] = useState(false);
    const name = item.provider;

    async function run(action) {
        setBusy(true);
        setError('');
        try {
            await action();
            await onChanged();
        } catch (err) {
            setError(err.message);
            await onChanged().catch(() => {});
        } finally {
            setBusy(false);
        }
    }

    async function connect() {
        setBusy(true);
        setError('');
        try {
            const { url } = await startCloudConnect(authFetch, name, folder.id);
            // Off to Google; it sends the browser back to this folder's settings.
            window.location.assign(url);
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    let body;
    if (!item.configured) {
        body = <p className="notes-dialog-hint">{item.label} backup isn&apos;t set up on this server yet.</p>;
    } else if (!item.connection) {
        body = (
            <>
                <p className="notes-dialog-hint">
                    Keep a copy of this folder&apos;s notes in a <strong>DoneYet</strong> folder in your {item.label}, as Markdown files you can open anywhere.
                    DoneYet can only see the files it creates there, nothing else in your Drive.
                </p>
                <div className="folder-sync-actions">
                    <button type="button" className="button-primary" onClick={connect} disabled={busy}>Connect {item.label}</button>
                </div>
            </>
        );
    } else if (item.connection.status === 'reauth') {
        body = (
            <>
                <p className="folder-sync-status is-error">
                    {item.label} stopped accepting DoneYet&apos;s access, so backups are paused. Reconnect to resume them.
                </p>
                <div className="folder-sync-actions">
                    <button type="button" className="button-primary" onClick={connect} disabled={busy}>Reconnect</button>
                </div>
            </>
        );
    } else if (item.covered_by) {
        body = <p className="folder-sync-status is-ok">Backed up as part of “{item.covered_by.name}”.</p>;
    } else if (!item.backup) {
        body = (
            <>
                <p className="notes-dialog-hint">Back up this folder, its subfolders, and their images and PDFs. Changes are copied over about a minute after you stop editing.</p>
                <div className="folder-sync-actions">
                    <button type="button" className="button-primary" onClick={() => run(() => enableFolderBackup(authFetch, folder.id, name))} disabled={busy}>
                        Back up this folder
                    </button>
                </div>
            </>
        );
    } else {
        const status = backupStatus(item.backup);
        body = (
            <>
                <p className={`folder-sync-status${status.tone ? ` is-${status.tone}` : ''}`} role="status">{status.text}</p>
                <div className="folder-sync-actions">
                    <button
                        type="button"
                        className="button-ghost"
                        onClick={() => run(() => syncFolderNow(authFetch, folder.id, name))}
                        disabled={busy || item.backup.syncing}
                    >
                        {busy ? 'Working…' : 'Back up now'}
                    </button>
                    <button
                        type="button"
                        className="button-ghost button-danger"
                        onClick={() => {
                            if (!window.confirm(`Stop backing up "${folder.name}"? What's already in ${item.label} stays there.`)) return;
                            run(() => disableFolderBackup(authFetch, folder.id, name));
                        }}
                        disabled={busy}
                    >
                        Stop backing up
                    </button>
                </div>
            </>
        );
    }

    return (
        <li className="folder-sync-row folder-sync-row--stacked">
            <div className="folder-sync-head">
                <span className="folder-sync-name">{item.label}</span>
                {item.connection && (
                    <span className="folder-sync-account">
                        {item.connection.account_email}
                        {' · '}
                        <button
                            type="button"
                            className="link-button"
                            disabled={busy}
                            onClick={() => {
                                if (!window.confirm(`Disconnect ${item.label}? Backups of all your folders stop. Files already in ${item.label} stay there.`)) return;
                                run(() => disconnectCloud(authFetch, name));
                            }}
                        >
                            Disconnect
                        </button>
                    </span>
                )}
            </div>
            {body}
        </li>
    );
}

export default function CloudBackupSection({ folder }) {
    const { authFetch } = useAuth();
    const [items, setItems] = useState(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        const data = await getFolderBackups(authFetch, folder.id);
        setItems(data.backups);
    }, [authFetch, folder.id]);

    useEffect(() => {
        load().catch((err) => setError(err.message));
    }, [load]);

    // Keep the status fresh while a backup is running or about to.
    const active = items?.some((i) => i.backup && (i.backup.syncing || !i.backup.last_synced_at) && !i.backup.last_error);
    useEffect(() => {
        if (!active) return;
        const t = setInterval(() => load().catch(() => {}), POLL_MS);
        return () => clearInterval(t);
    }, [active, load]);

    return (
        <>
            <h3 className="notes-section-label">Cloud backup</h3>
            {error && <p className="form-error" role="alert">{error}</p>}
            {!items && !error && <p className="notes-dialog-hint">Loading…</p>}
            {items && (
                <ul className="folder-sync-list">
                    {items.map((item) => (
                        <ProviderRow key={item.provider} item={item} folder={folder} onChanged={load} setError={setError} />
                    ))}
                </ul>
            )}
            <p className="notes-dialog-hint folder-sync-footnote">
                Backups are one-way: edits made in the cloud aren&apos;t copied back. Notes deleted here are moved to the cloud&apos;s bin.
            </p>
        </>
    );
}
