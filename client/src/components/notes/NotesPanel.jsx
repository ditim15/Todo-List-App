import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { createNote, getRecentNotes } from '../../api/notes';
import { formatEdited } from './noteUtils';

function ExpandIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
        </svg>
    );
}

// Dashboard panel under "My lists": the latest notes, and a way into the full Notes view.
function NotesPanel() {
    const { authFetch } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        getRecentNotes(authFetch, 4)
            .then(setData)
            .catch((err) => setError(err.message));
    }, [authFetch]);

    async function newNote() {
        try {
            const note = await createNote(authFetch);
            navigate(`/notes?note=${note.id}`);
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <section className="panel notes-panel" aria-labelledby="notes-panel-heading">
            <div className="panel-header">
                <h2 id="notes-panel-heading">
                    <Link to="/notes" className="notes-panel-heading-link">Notes</Link>
                </h2>
                <Link to="/notes" className="notes-panel-expand" aria-label="Open Notes" title="Open Notes">
                    <ExpandIcon />
                </Link>
            </div>

            {error && <p className="panel-hint">{error}</p>}
            {data && data.notes.length === 0 && (
                <p className="panel-hint notes-panel-empty">Plans, lecture notes and study guides, next to your tasks.</p>
            )}
            {data && data.notes.length > 0 && (
                <ul className="notes-panel-list">
                    {data.notes.map((note) => (
                        <li key={note.id}>
                            <Link to={`/notes?note=${note.id}`} className="notes-panel-note">
                                <span className="notes-panel-title">{note.title}</span>
                                <span className="notes-panel-meta">
                                    {note.folder_name ? `${note.folder_name} · ` : ''}{formatEdited(note.updated_at)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            <div className="notes-panel-actions">
                <button type="button" className="link-button" onClick={newNote}>+ New note</button>
                {data && data.total > data.notes.length && (
                    <Link to="/notes" className="link-button">All {data.total} notes</Link>
                )}
            </div>
        </section>
    );
}

export default NotesPanel;
