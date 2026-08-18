import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './static/Login.css';

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
        <div className="login-container">
            <h1>Log In</h1>
            <form onSubmit={handleSubmit} className="login-form">
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

                {error && <p className="login-error">{error}</p>}

                <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Logging in...' : 'Log In'}
                </button>
            </form>

            <p>
                Don't have an account? <Link to='/register'>Register</Link>
            </p>
        </div>
    );
}

export default Login;
