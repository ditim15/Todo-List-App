import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthLayout, { AuthBullet } from '../components/auth/AuthLayout';
import { ListsMock } from '../components/landing/AppMocks';

// Registration form: creates an account via AuthContext.register (which also logs the
// user in) and redirects to the dashboard on success.
function Register() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { register } = useAuth();

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        // Client-side check only; the server does not receive confirmPassword.
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);

        try {
            await register(name, email, password);
            navigate('/dashboard');
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
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />

                    {error && <p className="auth-error">{error}</p>}

                    <button type="submit" disabled={isLoading}>
                        {isLoading ? 'Registering...' : 'Register'}
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
