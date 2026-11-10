import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import { PriorityMock } from '../components/landing/AppMocks';

// Login form: authenticates via AuthContext.login and redirects to the dashboard on success.
function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            // login() throws with a user-facing message (see api/client.js apiRequest).
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <AuthLayout
            aside={
                <>
                    <span className="eyebrow">Welcome back</span>
                    <h2>Your deadlines are right where you left them.</h2>
                    <p>See what's due today, what's overdue and what's coming up next, all in one place.</p>
                    <PriorityMock />
                </>
            }
        >
            <div className="auth-card">
                <h1>Log In</h1>
                <p className="auth-subtitle">Welcome back to Nudge. Pick up where you left off.</p>
                <form onSubmit={handleSubmit} className="auth-form">
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

                    {error && <p className="auth-error">{error}</p>}

                    <button type="submit" disabled={isLoading}>
                        {isLoading ? 'Logging in...' : 'Log In'}
                    </button>
                </form>

                <p className="auth-footer">
                    Don't have an account? <Link to='/register'>Register</Link>
                </p>
            </div>
        </AuthLayout>
    );
}

export default Login;
