import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import { forgotPassword } from '../api/auth';

// "Forgot your password?": emails a reset link to the address. The server answers the
// same way whether or not the address has an account, so this page does too.
function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle'); // 'idle' | 'sending' | 'sent'
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        setStatus('sending');
        setError('');
        try {
            const data = await forgotPassword(email.trim());
            setMessage(data.message);
            setStatus('sent');
        } catch (err) {
            setError(err.message);
            setStatus('idle');
        }
    }

    return (
        <AuthLayout>
            <div className="auth-card">
                <h1>Reset your password</h1>
                {status === 'sent' ? (
                    <>
                        <p className="auth-notice" role="status">{message}</p>
                        <p className="auth-hint">
                            Can't find it? Check your spam folder. You can ask for another link in a minute.
                        </p>
                        <button type="button" className="btn btn-ghost" onClick={() => setStatus('idle')}>
                            Send another link
                        </button>
                    </>
                ) : (
                    <>
                        <p className="auth-subtitle">Enter your account's email and we'll send you a link to choose a new password.</p>
                        <form onSubmit={handleSubmit} className="auth-form">
                            <label htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                            {error && <p className="auth-error">{error}</p>}
                            <button type="submit" disabled={status === 'sending' || !email.trim()}>
                                {status === 'sending' ? 'Sending...' : 'Send reset link'}
                            </button>
                        </form>
                    </>
                )}
                <p className="auth-footer">
                    Remembered it? <Link to="/login">Log in</Link>
                </p>
            </div>
        </AuthLayout>
    );
}

export default ForgotPassword;
