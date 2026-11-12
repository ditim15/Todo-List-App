import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import ResendVerification from '../components/auth/ResendVerification';

// Landing page for the emailed link (/verify-email?token=...). Asks for the account's
// password, then confirms the address, which also logs the user in, and continues to
// the dashboard.
//
// The password is asked for because anyone can sign up with an address before it's
// verified. Without it, someone could register a student's email with their own
// password, and the student, clicking the link, would confirm an account the other
// person can log into. If the password doesn't match, the way forward is a password
// reset, which also proves the inbox and lets the student choose their own.
function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const { verifyEmail } = useAuth();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState(token ? 'idle' : 'error'); // 'idle' | 'verifying' | 'done' | 'error'
    const [error, setError] = useState(token ? '' : 'This verification link is missing its token.');
    // Set when the password doesn't match the one the account was created with.
    const [passwordMismatch, setPasswordMismatch] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!password || status === 'verifying') return;
        setStatus('verifying');
        setError('');
        setPasswordMismatch(false);

        try {
            await verifyEmail(token, password);
            setStatus('done');
            setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
        } catch (err) {
            setError(err.message);
            if (err.code === 'VERIFY_PASSWORD_MISMATCH') {
                // The link is still good; let them try again or reset.
                setPasswordMismatch(true);
                setStatus('idle');
            } else {
                setStatus('error');
            }
        }
    }

    if (status === 'done') {
        return (
            <AuthLayout>
                <div className="auth-card auth-card--centered">
                    <h1>Email confirmed</h1>
                    <p className="auth-subtitle">You're all set. Taking you to your dashboard...</p>
                    <p className="auth-footer">
                        <Link to="/dashboard" replace>Go now</Link>
                    </p>
                </div>
            </AuthLayout>
        );
    }

    if (status === 'error') {
        return (
            <AuthLayout>
                <div className="auth-card auth-card--centered">
                    <h1>Link didn't work</h1>
                    <p className="auth-subtitle">
                        {error} If you already confirmed your email, you can just log in.
                    </p>
                    <p className="auth-hint">Otherwise, enter your email to get a new link.</p>
                    <ResendVerification label="Send a new link" />
                    <p className="auth-footer">
                        <Link to="/login">Log in</Link>
                    </p>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout>
            <div className="auth-card">
                <h1>Confirm your email</h1>
                <p className="auth-subtitle">Enter the password you signed up with to finish creating your account.</p>
                <form onSubmit={handleSubmit} className="auth-form">
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={passwordMismatch}
                        required
                    />
                    {error && <p className="auth-error">{error}</p>}
                    <button type="submit" disabled={!password || status === 'verifying'}>
                        {status === 'verifying' ? 'Confirming...' : 'Confirm email'}
                    </button>
                </form>
                <p className="auth-footer">
                    {passwordMismatch ? "Don't know the password? " : 'Forgot your password? '}
                    <Link to="/forgot-password">Reset it</Link>
                </p>
            </div>
        </AuthLayout>
    );
}

export default VerifyEmail;
