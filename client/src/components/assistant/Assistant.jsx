// The Nudge assistant: a button in the bottom-right corner that opens a chat panel. It
// can talk through how to approach a task and propose tasks as cards. The user adds a
// card with the normal create call; the assistant never saves anything itself.
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { clearChat, getChat, sendChat, updateDraft } from '../../api/ai';
import { createTodo } from '../../api/todos';
import MessageText from './MessageText';
import TaskDraftCard from './TaskDraftCard';
import './Assistant.css';

const SUGGESTIONS = [
    'Add chem quiz friday, remind me the day before',
    'How should I approach my essay?',
    "What's due this week?",
];

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

function ExpandIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
    );
}

function CollapseIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
        </svg>
    );
}

// Whether the panel opens full screen. Remembered per browser; storage can be
// unavailable (private mode, blocked site data), so every access is guarded.
const EXPANDED_STORAGE_KEY = 'nudge:assistant-expanded';

function loadExpanded() {
    try {
        return localStorage.getItem(EXPANDED_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

function saveExpanded(expanded) {
    try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, String(expanded));
    } catch {
        // Not remembered; it still works for this visit.
    }
}

function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function SendIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
    );
}

// `onTaskAdded()` refreshes the dashboard after a card is added. `listsDatalistId` is
// the dashboard's <datalist> of list names, for the cards' list field.
export default function Assistant({ onTaskAdded, listsDatalistId }) {
    const { authFetch } = useAuth();
    const panelId = useId();
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(loadExpanded);
    const [loadState, setLoadState] = useState('idle'); // idle | loading | ready | error
    // Messages with a higher id arrived in this visit and animate in; the history that
    // was already there when the panel loaded just appears.
    const [lastLoadedId, setLastLoadedId] = useState(Infinity);
    const [available, setAvailable] = useState(true);
    const [messages, setMessages] = useState([]);
    // The user's message while its reply is on the way (not saved until the reply is).
    const [pendingText, setPendingText] = useState(null);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');

    const toggleRef = useRef(null);
    const inputRef = useRef(null);
    const scrollRef = useRef(null);

    // Load the saved conversation the first time the panel opens.
    useEffect(() => {
        if (!isOpen || loadState !== 'idle') return;
        setLoadState('loading');
        getChat(authFetch)
            .then((data) => {
                setMessages(data.messages);
                setLastLoadedId(data.messages.at(-1)?.id ?? 0);
                setAvailable(data.available);
                setLoadState('ready');
            })
            .catch((err) => {
                setError(err.message);
                setLoadState('error');
            });
    }, [isOpen, loadState, authFetch]);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    // Keep the newest message in view: a jump when the panel opens, a smooth scroll as
    // new messages arrive.
    const hasScrolledRef = useRef(false);
    useEffect(() => {
        if (!isOpen) {
            hasScrolledRef.current = false;
            return;
        }
        const el = scrollRef.current;
        if (!el) return;
        const smooth = hasScrolledRef.current && !prefersReducedMotion();
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        hasScrolledRef.current = true;
    }, [messages, pendingText, isOpen, error]);

    function close() {
        setIsOpen(false);
        // The corner button is hidden in full screen, so focus it once it's back.
        requestAnimationFrame(() => toggleRef.current?.focus());
    }

    function toggleExpanded() {
        setIsExpanded((current) => {
            saveExpanded(!current);
            return !current;
        });
    }

    async function send(text) {
        const message = text.trim();
        if (!message || pendingText !== null) return;

        setPendingText(message);
        setInput('');
        setError('');
        try {
            const data = await sendChat(authFetch, message);
            setMessages((current) => [...current, ...data.messages]);
        } catch (err) {
            // Nothing was saved, so put the text back for another try.
            setInput(message);
            setError(err instanceof TypeError
                ? "Couldn't reach the server. Check your connection and try again."
                : err.message);
        } finally {
            setPendingText(null);
            inputRef.current?.focus();
        }
    }

    async function handleClear() {
        if (!window.confirm('Clear this conversation? Tasks you already added stay on your list.')) return;
        try {
            await clearChat(authFetch);
            setMessages([]);
            setError('');
        } catch (err) {
            setError(err.message);
        }
    }

    function replaceMessage(updated) {
        setMessages((current) => current.map((m) => (m.id === updated.id ? updated : m)));
    }

    // Saves the card as a task, then marks the card as added. If only the second step
    // fails, the task is saved anyway, so the card still shows as added.
    async function handleAddDraft(message, index, fields) {
        await createTodo(authFetch, fields);
        try {
            const data = await updateDraft(authFetch, message.id, index, { status: 'added', draft: fields });
            replaceMessage(data.message);
        } catch {
            replaceMessage({
                ...message,
                drafts: message.drafts.map((d, i) => (i === index ? { ...d, ...fields, status: 'added' } : d)),
            });
        }
        onTaskAdded?.();
    }

    async function handleDismissDraft(message, index) {
        const data = await updateDraft(authFetch, message.id, index, { status: 'dismissed' });
        replaceMessage(data.message);
    }

    const isSending = pendingText !== null;
    const isEmpty = loadState === 'ready' && messages.length === 0 && !isSending;

    return (
        <>
            {isOpen && (
                <section
                    id={panelId}
                    className={`assistant-panel${isExpanded ? ' assistant-panel--expanded' : ''}`}
                    role="dialog"
                    aria-label="Assistant"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') close();
                    }}
                >
                    <header className="assistant-header">
                        <span className="assistant-header-icon"><SparkIcon /></span>
                        <h2>Assistant</h2>
                        {messages.length > 0 && (
                            <button type="button" className="link-button assistant-clear" onClick={handleClear} disabled={isSending}>
                                Clear chat
                            </button>
                        )}
                        <button
                            type="button"
                            className="assistant-icon-button"
                            onClick={toggleExpanded}
                            aria-label={isExpanded ? 'Exit full screen' : 'Full screen'}
                            aria-pressed={isExpanded}
                            title={isExpanded ? 'Exit full screen' : 'Full screen'}
                        >
                            {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
                        </button>
                        <button type="button" className="assistant-icon-button" onClick={close} aria-label="Close assistant" title="Close">
                            <CloseIcon />
                        </button>
                    </header>

                    <div className="assistant-messages" ref={scrollRef} aria-live="polite">
                        {loadState === 'loading' && <p className="assistant-status">Loading...</p>}
                        {!available && (
                            <p className="assistant-status assistant-status--error">
                                The assistant is off right now. You can still add tasks with the form.
                            </p>
                        )}
                        {isEmpty && available && (
                            <div className="assistant-empty">
                                <p>Hi! I can add tasks for you or help you plan how to tackle one. Try:</p>
                                <div className="assistant-suggestions">
                                    {SUGGESTIONS.map((suggestion) => (
                                        <button key={suggestion} type="button" onClick={() => send(suggestion)}>
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                                <p className="assistant-privacy">
                                    Messages, your list names and your open tasks are sent to Anthropic&apos;s API to answer.{' '}
                                    <Link to="/privacy">Privacy Policy</Link>
                                </p>
                            </div>
                        )}

                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`assistant-message assistant-message--${message.role}${
                                    // A saved user message replaces its pending bubble, which
                                    // already animated in, so only replies animate here.
                                    message.role === 'assistant' && message.id > lastLoadedId ? ' assistant-message--new' : ''
                                }`}
                            >
                                <div className="assistant-bubble">
                                    {message.role === 'assistant' ? <MessageText text={message.content} /> : message.content}
                                </div>
                                {message.drafts.map((draft, index) => (
                                    <TaskDraftCard
                                        key={index}
                                        draft={draft}
                                        listsDatalistId={listsDatalistId}
                                        onAdd={(fields) => handleAddDraft(message, index, fields)}
                                        onDismiss={() => handleDismissDraft(message, index)}
                                    />
                                ))}
                            </div>
                        ))}

                        {isSending && (
                            <>
                                <div className="assistant-message assistant-message--user assistant-message--new">
                                    <div className="assistant-bubble">{pendingText}</div>
                                </div>
                                <div className="assistant-message assistant-message--assistant assistant-message--new assistant-message--typing">
                                    <div className="assistant-bubble assistant-typing" role="status" aria-label="Assistant is typing">
                                        <span /><span /><span />
                                    </div>
                                </div>
                            </>
                        )}
                        {error && <p className="assistant-status assistant-status--error" role="alert">{error}</p>}
                    </div>

                    <form
                        className="assistant-compose"
                        onSubmit={(e) => {
                            e.preventDefault();
                            send(input);
                        }}
                    >
                        <textarea
                            ref={inputRef}
                            rows={1}
                            placeholder={available ? 'Ask or add a task...' : 'The assistant is off'}
                            aria-label="Message the assistant"
                            value={input}
                            maxLength={2000}
                            disabled={!available}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                // Enter sends; Shift+Enter adds a new line.
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    send(input);
                                }
                            }}
                        />
                        <button type="submit" aria-label="Send" disabled={!available || isSending || !input.trim()}>
                            <SendIcon />
                        </button>
                    </form>
                </section>
            )}

            {/* In full screen it would cover the send button; the header has a close button. */}
            {!(isOpen && isExpanded) && <button
                ref={toggleRef}
                type="button"
                className={`assistant-toggle${isOpen ? ' assistant-toggle--open' : ''}`}
                aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                onClick={() => (isOpen ? close() : setIsOpen(true))}
            >
                {isOpen ? <CloseIcon /> : <SparkIcon />}
            </button>}
        </>
    );
}
