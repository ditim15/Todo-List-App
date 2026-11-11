import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthLayout, { AuthBullet } from '../components/auth/AuthLayout';
import PasswordChecklist from '../components/auth/PasswordChecklist';
import { ListsMock } from '../components/landing/AppMocks';
import { PASSWORD_MAX_LENGTH, passwordMeetsRules } from '../auth/passwordRules';

// Registration form: creates an unverified account via AuthContext.register, then
// sends the user to /check-email to confirm their address before they can log in.
function Register() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { register } = useAuth();

    const passwordValid = passwordMeetsRules(password);
    const passwordsMatch = confirmPassword === '' || password === confirmPassword;

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        // The server enforces the same password rules; checking here gives instant feedback.
        if (!passwordValid) {
            setError('Your password needs to meet every requirement below it.');
            return;
        }
        // Client-side check only; the server does not receive confirmPassword.
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);

        try {
            const data = await register(name.trim(), email.trim(), password);
            navigate('/check-email', { state: { email: data.email, emailSent: data.emailSent } });
        } catch (err) {
            // register() throws with a user-facing message (see api/client.js apiRequest).
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <AuthLayout
            aside={
                <>
                    <span className="eyebrow">Free for students</span>
                    <h2>Every class and deadline in one calm place.</h2>
                    <ul className="check-list">
                        <AuthBullet>A list and progress bar for each course</AuthBullet>
                        <AuthBullet>High, medium and low priorities at a glance</AuthBullet>
                        <AuthBullet>Overdue work flagged so nothing slips</AuthBullet>
                    </ul>
                    <ListsMock />
                </>
            }
        >
            <div className="auth-card">
                <h1>Create your Nudge account</h1>
                <p className="auth-subtitle">Start organizing your day in under a minute.</p>
                <form onSubmit={handleSubmit} className="auth-form">
                    <label htmlFor="name">Name</label>
                    <input
                        id="name"
                        type="text"
                        autoComplete="name"
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        maxLength={100}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <p className="auth-hint">We'll send a link to this address to confirm it's yours.</p>
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        maxLength={PASSWORD_MAX_LENGTH}
                        aria-describedby="password-rules"
                        aria-invalid={password !== '' && !passwordValid}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <PasswordChecklist id="password-rules" password={password} />
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        maxLength={PASSWORD_MAX_LENGTH}
                        aria-invalid={!passwordsMatch}
                        aria-describedby={passwordsMatch ? undefined : 'confirm-mismatch'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                    {!passwordsMatch && (
                        <p className="auth-hint auth-hint--error" id="confirm-mismatch">Passwords don't match yet.</p>
                    )}

                    {error && <p className="auth-error">{error}</p>}

                    <button type="submit" disabled={isLoading}>
                        {isLoading ? 'Creating account...' : 'Create account'}
                    </button>
                </form>

                <p className="auth-footer">
                    Already have an account? <Link to='/login'>Log In</Link>
                </p>
            </div>
        </AuthLayout>
    );
}

export default Register;
