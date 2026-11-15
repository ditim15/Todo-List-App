// Cloud backup endpoints (server: routes/cloud.js). Each takes `authFetch` from useAuth.

// { providers: [{ name, label, configured, connection }] }
export function getCloudProviders(authFetch) {
    return authFetch('/cloud');
}

// Starts signing in with the provider: resolves to { url } to send the browser to.
// The provider sends the user back to the Notes page (to `folderId`'s settings).
export function startCloudConnect(authFetch, provider, folderId) {
    return authFetch(`/cloud/${provider}/connect`, { method: 'POST', body: JSON.stringify({ folder_id: folderId ?? null }) });
}

export function disconnectCloud(authFetch, provider) {
    return authFetch(`/cloud/${provider}`, { method: 'DELETE' });
}

// { backups: [{ provider, label, configured, connection, backup, covered_by }] }
export function getFolderBackups(authFetch, folderId) {
    return authFetch(`/cloud/folders/${folderId}`);
}

export function enableFolderBackup(authFetch, folderId, provider) {
    return authFetch(`/cloud/folders/${folderId}/${provider}`, { method: 'PUT' });
}

export function disableFolderBackup(authFetch, folderId, provider) {
    return authFetch(`/cloud/folders/${folderId}/${provider}`, { method: 'DELETE' });
}

// Backs up now and waits: resolves to { backup, stats }.
export function syncFolderNow(authFetch, folderId, provider) {
    return authFetch(`/cloud/folders/${folderId}/${provider}/sync`, { method: 'POST' });
}
