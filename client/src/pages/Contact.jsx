import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthLayout, { AuthBullet } from '../components/auth/AuthLayout';
import { sendContactMessage } from '../api/contact';

// Keep in sync with controllers/contact.controller.js.
const TOPICS = ['Question', 'Bug report', 'Feature idea', 'Account help', 'Other'];
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;
const SUPPORT_EMAIL = 'support@doneyet.app';

// Contact form. Signed-in users get their name and email filled in. The message is
// emailed to the support inbox with Reply-To set to the address given here.
function Contact() {
    const { user, isAuthenticated } = useAuth();
    const [name, setName] = useState(user?.name ?? '');
    const [email, setEmail] = useState(user?.email ?? '');
    const [topic, setTopic] = useState(TOPICS[0]);
    const [message, setMessage] = useState('');
    const [website, setWebsite] = useState(''); // honeypot, hidden from people
    const [error, setError] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sent, setSent] = useState(null);

    // On a direct visit the session is restored after the first render, so fill in the
    // account's details once they arrive (without overwriting anything typed).
    useEffect(() => {
        if (!user) return;
        setName((current) => current || user.name || '');
        setEmail((current) => current || user.email || '');
    }, [user]);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        if (message.trim().length < MESSAGE_MIN) {
            setError(`Please write at least ${MESSAGE_MIN} characters so we know how to help.`);
            return;
        }
        setIsSending(true);
        try {
            const data = await sendContactMessage({ name, email, topic, message, website });
            setSent({ email: email.trim(), message: data.message });
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSending(false);
        }
    }

    const aside = (
        <>
            <p className="eyebrow">Support</p>
            <h2>Questions, bugs and ideas all land in the same inbox.</h2>
            <p>A real person reads every message and replies by email.</p>
            <ul className="check-list">
                <AuthBullet>Found a bug? Tell us what you clicked and what you expected.</AuthBullet>
                <AuthBullet>Missing a feature? We&apos;d love to hear how you study.</AuthBullet>
                <AuthBullet>Prefer email? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</AuthBullet>
            </ul>
        </>
    );

    if (sent) {
        return (
            <AuthLayout aside={aside}>
                <div className="auth-card auth-card--centered" role="status">
                    <span className="auth-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                    </span>
                    <h1>Message sent</h1>
                    <p className="auth-subtitle">
                        {sent.message} We&apos;ll write back to <strong className="auth-email">{sent.email}</strong>.
                    </p>
                    <Link to={isAuthenticated ? '/dashboard' : '/'} className="btn btn-primary auth-action">
                        {isAuthenticated ? 'Back to your dashboard' : 'Back to the home page'}
                    </Link>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout aside={aside}>
            <div className="auth-card">
                <h1>Contact us</h1>
                <p className="auth-subtitle">Send us a message and we&apos;ll reply by email.</p>
                <form onSubmit={handleSubmit} className="auth-form">
                    <label htmlFor="contact-name">Name</label>
                    <input
                        id="contact-name"
                        type="text"
                        autoComplete="name"
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />

                    <label htmlFor="contact-email">Email</label>
                    <input
                        id="contact-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        aria-describedby="contact-email-hint"
                        required
                    />
                    <p id="contact-email-hint" className="auth-hint">We&apos;ll only use this to reply to you.</p>

                    <label htmlFor="contact-topic">Topic</label>
                    <select id="contact-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                        {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <label htmlFor="contact-message">Message</label>
                    <textarea
                        id="contact-message"
                        rows={6}
                        maxLength={MESSAGE_MAX}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        aria-describedby="contact-message-count"
                        required
                    />
                    <p id="contact-message-count" className="auth-hint contact-count">
                        {message.length.toLocaleString()} / {MESSAGE_MAX.toLocaleString()}
                    </p>

                    {/* Honeypot: off-screen and skipped by keyboard and screen readers.
                        Bots that fill every field get silently dropped by the server. */}
                    <div className="contact-trap" aria-hidden="true">
                        <label htmlFor="contact-website">Website</label>
                        <input
                            id="contact-website"
                            type="text"
                            tabIndex={-1}
                            autoComplete="off"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                        />
                    </div>

                    {error && <p className="auth-error" role="alert">{error}</p>}

                    <button type="submit" disabled={isSending}>
                        {isSending ? 'Sending…' : 'Send message'}
                    </button>
                </form>
                <p className="auth-consent">
                    Your message is emailed to our support inbox. See our <Link to="/privacy">privacy policy</Link>.
                </p>
            </div>
        </AuthLayout>
    );
}

export default Contact;
