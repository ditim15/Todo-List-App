import { useEffect, useState } from 'react';
import { resendVerification } from '../../api/auth';

const COOLDOWN_SECONDS = 60; // matches the server's per-account cooldown

// "Resend verification email" control. With a known `email` it's a single button;
// without one it asks for the address first.
function ResendVerification({ email: knownEmail, label = 'Resend verification email' }) {
    const [email, setEmail] = useState(knownEmail ?? '');
    const [status, setStatus] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
    const [message, setMessage] = useState('');
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    async function handleSubmit(e) {
        e.preventDefault();
        setStatus('sending');
        setMessage('');
        try {
            const data = await resendVerification(email.trim());
            setStatus('sent');
            setMessage(data.message);
            setCooldown(COOLDOWN_SECONDS);
        } catch (err) {
            setStatus('error');
            setMessage(err.message);
        }
    }

    const disabled = status === 'sending' || cooldown > 0 || !email.trim();

    return (
        <form className="auth-form resend-verification" onSubmit={handleSubmit}>
            {!knownEmail && (
                <>
                    <label htmlFor="resend-email">Email</label>
                    <input
                        id="resend-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </>
            )}
            <button type="submit" className="auth-secondary-button" disabled={disabled}>
                {status === 'sending' ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : label}
            </button>
            {message && (
                <p className={status === 'error' ? 'auth-error' : 'auth-notice'} role="status">
                    {message}
                </p>
            )}
        </form>
    );
}

export default ResendVerification;
