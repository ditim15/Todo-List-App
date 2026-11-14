import { useEffect, useRef, useState } from 'react';
import { FOLDER_COLORS } from './folderColors';

// Folder settings: a dialog with one section per group of options. "Appearance" sets
// the folder's background colour (saved as soon as it's picked). "Sync" is where cloud
// storage (Google Drive, OneDrive, ...) will plug in; each provider is listed but not
// connectable yet. New sections go in SECTIONS and get a case in the body below.
const SECTIONS = [
    { key: 'appearance', label: 'Appearance' },
    { key: 'sync', label: 'Sync' },
];

const SYNC_PROVIDERS = [
    { key: 'google-drive', label: 'Google Drive' },
    { key: 'onedrive', label: 'OneDrive' },
    { key: 'dropbox', label: 'Dropbox' },
];

function FolderSettings({ folder, noteCount, onClose, onColor }) {
    const dialogRef = useRef(null);
    const [section, setSection] = useState('appearance');

    // Opens as a modal when mounted (the page mounts it only while it's open).
    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className="notes-dialog folder-settings"
            onClose={onClose}
            aria-labelledby="folder-settings-title"
            // Click on the backdrop closes it (the dialog element itself is the backdrop target).
            onClick={(e) => e.target === e.currentTarget && dialogRef.current.close()}
        >
            <div className="notes-dialog-head">
                <h2 id="folder-settings-title">Folder settings</h2>
                <button type="button" className="link-button" onClick={() => dialogRef.current.close()}>Done</button>
            </div>

            <div className="folder-settings-layout">
                <nav className="folder-settings-nav" aria-label="Settings sections">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            className={section === s.key ? 'is-active' : ''}
                            aria-current={section === s.key ? 'true' : undefined}
                            onClick={() => setSection(s.key)}
                        >
                            {s.label}
                        </button>
                    ))}
                </nav>

                <div className="folder-settings-body">
                    {section === 'appearance' && (
                        <>
                            <h3 className="notes-section-label">Background colour</h3>
                            <div className="folder-swatches" role="radiogroup" aria-label="Folder colour">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={!folder.color}
                                    className="folder-swatch folder-swatch--none"
                                    onClick={() => onColor(null)}
                                >
                                    <span className="folder-swatch-chip" aria-hidden="true" />
                                    <span>Default</span>
                                </button>
                                {FOLDER_COLORS.map((c) => (
                                    <button
                                        key={c.key}
                                        type="button"
                                        role="radio"
                                        aria-checked={folder.color === c.key}
                                        className="folder-swatch"
                                        data-folder-color={c.key}
                                        onClick={() => onColor(c.key)}
                                    >
                                        <span className="folder-swatch-chip" aria-hidden="true" />
                                        <span>{c.label}</span>
                                    </button>
                                ))}
                            </div>

                            <h3 className="notes-section-label">Preview</h3>
                            <div className="notes-card notes-card--folder folder-settings-preview" data-folder-color={folder.color || undefined} aria-hidden="true">
                                <span className="notes-card-title">
                                    <svg className="notes-icon notes-folder-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                    </svg>
                                    {folder.name}
                                </span>
                                <span className="notes-card-preview">{noteCount} note{noteCount === 1 ? '' : 's'}</span>
                            </div>
                        </>
                    )}

                    {section === 'sync' && (
                        <>
                            <h3 className="notes-section-label">Cloud storage</h3>
                            <p className="notes-dialog-hint">
                                Keep a copy of this folder's notes in your own cloud storage. Connecting accounts isn't available yet.
                            </p>
                            <ul className="folder-sync-list">
                                {SYNC_PROVIDERS.map((p) => (
                                    <li key={p.key} className="folder-sync-row">
                                        <span className="folder-sync-name">{p.label}</span>
                                        <span className="folder-sync-badge">Coming soon</span>
                                        <button type="button" className="button-ghost" disabled>Connect</button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </div>
        </dialog>
    );
}

export default FolderSettings;
