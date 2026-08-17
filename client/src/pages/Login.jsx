import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginUser } from '../api/auth';
import './Login.css';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const data = await loginUser(email, password);
            console.log('Login successful: ', data);
            // store tokens, update auth context

            navigate('/dashboard');
        } catch (err) {
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