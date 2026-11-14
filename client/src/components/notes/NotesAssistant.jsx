// The notes assistant: a corner button on the Notes page that opens a chat panel. It
// can read the student's notes to give advice and propose edits, which show as cards
// with Apply / Dismiss. Applying goes through the editor (see noteEdits.js), so it can
// be undone with Ctrl+Z like any other change.
//
// The conversation is kept for this browser tab only (sessionStorage), and each message
// sends just the recent history (api/notesAi.js), which keeps every message cheap.
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { getNotesAiStatus, sendNotesChat } from '../../api/notesAi';
import MessageText from '../assistant/MessageText';
import '../assistant/Assistant.css';

const STORAGE_KEY = 'notes:assistant';
const SUGGESTIONS_WITH_NOTE = ['Summarise this note', 'Quiz me on this note', 'What am I missing here?'];
const SUGGESTIONS_NO_NOTE = ['Which of my notes cover exams?', 'Help me plan what to study this week'];

function SparkIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
            <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
        </svg>
    );
}

function SendIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
    );
}

function loadMessages() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

function EditCard({ edit, onApply, onDismiss }) {
    const [busy, setBusy] = useState(false);
    const where = edit.action === 'append' ? `Add to “${edit.note_title}”` : `Change in “${edit.note_title}”`;

    if (edit.status !== 'pending') {
        return (
            <div className={`assistant-card assistant-card--done${edit.status === 'dismissed' ? ' assistant-card--muted' : ''}`}>
                {edit.status === 'applied' ? `Applied to “${edit.note_title}”. Ctrl+Z in the note undoes it.` : 'Dismissed'}
            </div>
        );
    }

    return (
        <div className="assistant-card notes-edit-card">
            <span className="assistant-card-title">{where}</span>
            {edit.action === 'replace' && (
                <p className="notes-edit-diff">
                    <del>{edit.find}</del>
                    <ins>{edit.text}</ins>
                </p>
            )}
            {edit.action === 'append' && (
                <div className="notes-edit-preview"><MessageText text={edit.text.replace(/^#{1,3}\s+/gm, '')} /></div>
            )}
            {edit.error && <p className="assistant-card-error" role="alert">{edit.error}</p>}
            <div className="assistant-card-actions">
                <button type="button" className="link-button" onClick={onDismiss} disabled={busy}>Dismiss</button>
                <button
                    type="button"
                    className="assistant-card-add"
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        await onApply();
                        setBusy(false);
                    }}
                >
                    Apply
                </button>
            </div>
        </div>
    );
}

export default function NotesAssistant({ openNote, onBeforeSend, onApply }) {
    const { authFetch } = useAuth();
    const panelId = useId();
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState(null); // { available, remaining_today, daily_limit }
    const [messages, setMessages] = useState(loadMessages);
    const [pendingText, setPendingText] = useState(null);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const inputRef = useRef(null);
    const scrollRef = useRef(null);
    const toggleRef = useRef(null);
    const nextId = useRef(messages.reduce((max, m) => Math.max(max, m.id), 0) + 1);

    useEffect(() => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
        } catch { /* not kept across reloads; still works now */ }
    }, [messages]);

    useEffect(() => {
        if (!isOpen) return;
        inputRef.current?.focus();
        if (!status) {
            getNotesAiStatus(authFetch).then(setStatus).catch((err) => setError(err.message));
        }
    }, [isOpen, status, authFetch]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight });
    }, [messages, pendingText, isOpen, error]);

    function close() {
        setIsOpen(false);
        requestAnimationFrame(() => toggleRef.current?.focus());
    }

    async function send(text) {
        const message = text.trim();
        if (!message || pendingText !== null) return;
        setPendingText(message);
        setInput('');
        setError('');
        try {
            // Save pending typing first, so the assistant reads the note as it is now.
            await onBeforeSend?.();
            const data = await sendNotesChat(authFetch, { message, history: messages, noteId: openNote?.id });
            setMessages((current) => [
                ...current,
                { id: nextId.current++, role: 'user', content: message, edits: [] },
                {
                    id: nextId.current++,
                    role: 'assistant',
                    content: data.reply.content,
                    limited: data.reply.limited,
                    edits: data.reply.edits.map((e) => ({ ...e, status: 'pending' })),
                },
            ]);
            setStatus((s) => s && { ...s, remaining_today: data.remaining_today });
        } catch (err) {
            setInput(message);
            setError(err instanceof TypeError ? "Couldn't reach the server. Check your connection and try again." : err.message);
        } finally {
            setPendingText(null);
            inputRef.current?.focus();
        }
    }

    function updateEdit(messageId, index, changes) {
        setMessages((current) => current.map((m) => (m.id === messageId
            ? { ...m, edits: m.edits.map((e, i) => (i === index ? { ...e, ...changes } : e)) }
            : m)));
    }

    async function apply(message, index) {
        const edit = message.edits[index];
        const result = await onApply(edit);
        updateEdit(message.id, index, result.ok ? { status: 'applied', error: '' } : { error: result.error });
    }

    const available = status?.available !== false;
    const isSending = pendingText !== null;
    const outOfMessages = status && status.remaining_today === 0;
    const suggestions = openNote ? SUGGESTIONS_WITH_NOTE : SUGGESTIONS_NO_NOTE;

    return (
        <>
            {isOpen && (
                <section
                    id={panelId}
                    className="assistant-panel notes-assistant"
                    role="dialog"
                    aria-label="Notes assistant"
                    onKeyDown={(e) => e.key === 'Escape' && close()}
                >
                    <header className="assistant-header">
                        <span className="assistant-header-icon"><SparkIcon /></span>
                        <h2>Notes assistant</h2>
                        {messages.length > 0 && (
                            <button type="button" className="link-button assistant-clear" onClick={() => setMessages([])} disabled={isSending}>
                                New chat
                            </button>
                        )}
                        <button type="button" className="assistant-icon-button" onClick={close} aria-label="Close assistant" title="Close">
                            <CloseIcon />
                        </button>
                    </header>

                    <div className="assistant-messages" ref={scrollRef} aria-live="polite">
                        {!available && (
                            <p className="assistant-status assistant-status--error">The assistant is off right now. Your notes are unaffected.</p>
                        )}
                        {available && messages.length === 0 && !isSending && (
                            <div className="assistant-empty">
                                <p>
                                    {openNote
                                        ? <>I can read “{openNote.title}” and your other notes to explain, quiz you or suggest edits. Try:</>
                                        : <>I can read your notes to give study advice or suggest edits. Open a note to work on it, or try:</>}
                                </p>
                                <div className="assistant-suggestions">
                                    {suggestions.map((s) => (
                                        <button key={s} type="button" onClick={() => send(s)}>{s}</button>
                                    ))}
                                </div>
                                <p className="assistant-privacy">
                                    Your message, the open note and any notes the assistant looks up are sent to Anthropic&apos;s API to answer.
                                    Edits only happen when you press Apply. <Link to="/privacy">Privacy Policy</Link>
                                </p>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div key={m.id} className={`assistant-message assistant-message--${m.role}`}>
                                <div className="assistant-bubble">
                                    {m.role === 'assistant' ? <MessageText text={m.content} /> : m.content}
                                </div>
                                {m.limited && (
                                    <p className="notes-assistant-limit">I stopped early to keep this message within its limits. Ask a narrower question for more.</p>
                                )}
                                {m.edits.map((edit, i) => (
                                    <EditCard
                                        key={i}
                                        edit={edit}
                                        onApply={() => apply(m, i)}
                                        onDismiss={() => updateEdit(m.id, i, { status: 'dismissed' })}
                                    />
                                ))}
                            </div>
                        ))}

                        {isSending && (
                            <>
                                <div className="assistant-message assistant-message--user">
                                    <div className="assistant-bubble">{pendingText}</div>
                                </div>
                                <div className="assistant-message assistant-message--assistant assistant-message--typing">
                                    <div className="assistant-bubble assistant-typing" role="status" aria-label="Assistant is typing">
                                        <span /><span /><span />
                                    </div>
                                </div>
                            </>
                        )}
                        {error && <p className="assistant-status assistant-status--error" role="alert">{error}</p>}
                    </div>

                    <form className="assistant-compose" onSubmit={(e) => { e.preventDefault(); send(input); }}>
                        <textarea
                            ref={inputRef}
                            rows={1}
                            placeholder={!available ? 'The assistant is off' : outOfMessages ? 'No messages left today' : openNote ? `Ask about “${openNote.title}”…` : 'Ask about your notes…'}
                            aria-label="Message the notes assistant"
                            value={input}
                            maxLength={2000}
                            disabled={!available || outOfMessages}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    send(input);
                                }
                            }}
                        />
                        <button type="submit" aria-label="Send" disabled={!available || outOfMessages || isSending || !input.trim()}>
                            <SendIcon />
                        </button>
                    </form>
                    {status?.available && (
                        <p className="notes-assistant-quota">
                            {status.remaining_today} of {status.daily_limit} assistant messages left today
                        </p>
                    )}
                </section>
            )}

            <button
                ref={toggleRef}
                type="button"
                className={`assistant-toggle${isOpen ? ' assistant-toggle--open' : ''}`}
                aria-label={isOpen ? 'Close notes assistant' : 'Open notes assistant'}
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                onClick={() => (isOpen ? close() : setIsOpen(true))}
            >
                {isOpen ? <CloseIcon /> : <SparkIcon />}
            </button>
        </>
    );
}
