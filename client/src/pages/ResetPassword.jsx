import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import PasswordChecklist from '../components/auth/PasswordChecklist';
import { PASSWORD_MAX_LENGTH, passwordMeetsRules } from '../auth/passwordRules';
import { resetPassword } from '../api/auth';

// Target of the emailed reset link (/reset-password?token=...). Sets a new password,
// which also logs out every existing session, then sends the user to log in.
function ResetPassword() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [status, setStatus] = useState('idle'); // 'idle' | 'saving' | 'done'
    const [error, setError] = useState(token ? '' : 'This reset link is missing its token.');
    const [linkInvalid, setLinkInvalid] = useState(!token);

    const mismatch = confirm.length > 0 && confirm !== password;
    const canSubmit = token && passwordMeetsRules(password) && password === confirm && status !== 'saving';

    async function handleSubmit(e) {
        e.preventDefault();
        if (!canSubmit) return;
        setStatus('saving');
        setError('');
        try {
            await resetPassword(token, password);
            setStatus('done');
        } catch (err) {
            setError(err.message);
            setLinkInvalid(err.code === 'INVALID_RESET_TOKEN');
            setStatus('idle');
        }
    }

    if (status === 'done') {
        return (
            <AuthLayout>
                <div className="auth-card auth-card--centered">
                    <h1>Password changed</h1>
                    <p className="auth-subtitle">
                        You've been logged out everywhere. Log in with your new password.
                    </p>
                    <Link to="/login" className="btn btn-primary">Log in</Link>
                </div>
            </AuthLayout>
        );
    }

    if (linkInvalid) {
        return (
            <AuthLayout>
                <div className="auth-card auth-card--centered">
                    <h1>Link didn't work</h1>
                    <p className="auth-subtitle">{error}</p>
                    <Link to="/forgot-password" className="btn btn-primary">Get a new link</Link>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout>
            <div className="auth-card">
                <h1>Choose a new password</h1>
                <p className="auth-subtitle">This logs you out on every device.</p>
                <form onSubmit={handleSubmit} className="auth-form">
                    <label htmlFor="password">New password</label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        aria-describedby="password-rules"
                        value={password}
                        maxLength={PASSWORD_MAX_LENGTH}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <PasswordChecklist id="password-rules" password={password} />
                    <label htmlFor="confirm-password">Confirm new password</label>
                    <input
                        id="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        maxLength={PASSWORD_MAX_LENGTH}
                        onChange={(e) => setConfirm(e.target.value)}
                        aria-invalid={mismatch}
                        required
                    />
                    {mismatch && <p className="auth-hint auth-hint--error">The passwords don't match.</p>}
                    {error && <p className="auth-error">{error}</p>}
                    <button type="submit" disabled={!canSubmit}>
                        {status === 'saving' ? 'Saving...' : 'Change password'}
                    </button>
                </form>
            </div>
        </AuthLayout>
    );
}

export default ResetPassword;
