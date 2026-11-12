import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import { deleteAccount } from '../api/account';

// Account settings: who's signed in, and permanently deleting the account.
function Account() {
    const { user, authFetch, clearSession } = useAuth();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState('');

    async function handleDelete(e) {
        e.preventDefault();
        if (!confirmed || !password) return;
        setIsDeleting(true);
        setError('');
        try {
            await deleteAccount(authFetch, password);
            // The server already ended the session and cleared its cookie.
            clearSession();
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message);
            setIsDeleting(false);
        }
    }

    return (
        <AuthLayout>
            <div className="auth-card account-page">
                <h1>Account</h1>
                <p className="auth-subtitle">
                    <Link to="/dashboard">← Back to your dashboard</Link>
                </p>

                <section className="account-section" aria-labelledby="account-details-heading">
                    <h2 id="account-details-heading">Your details</h2>
                    <dl className="account-details">
                        <dt>Name</dt>
                        <dd>{user?.name}</dd>
                        <dt>Email</dt>
                        <dd>{user?.email}</dd>
                    </dl>
                </section>

                <section className="account-section" aria-labelledby="account-password-heading">
                    <h2 id="account-password-heading">Password</h2>
                    <p>
                        To change your password, <Link to="/forgot-password">send yourself a reset link</Link>.
                        Changing it logs you out on every device.
                    </p>
                </section>

                <section className="account-section account-danger" aria-labelledby="account-delete-heading">
                    <h2 id="account-delete-heading">Delete account</h2>
                    <p>
                        This permanently deletes your account, all of your tasks and lists, scheduled
                        reminders, and your assistant chat history. It can't be undone.
                    </p>
                    <form className="auth-form" onSubmit={handleDelete}>
                        <label htmlFor="delete-password">Enter your password to confirm</label>
                        <input
                            id="delete-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <label className="account-confirm">
                            <input
                                type="checkbox"
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                            />
                            {' '}I understand this deletes everything permanently
                        </label>
                        {error && <p className="auth-error" role="alert">{error}</p>}
                        <button type="submit" className="danger-button" disabled={!confirmed || !password || isDeleting}>
                            {isDeleting ? 'Deleting...' : 'Delete my account'}
                        </button>
                    </form>
                </section>
            </div>
        </AuthLayout>
    );
}

export default Account;
