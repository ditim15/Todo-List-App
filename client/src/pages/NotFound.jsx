import { Link } from 'react-router-dom';

// Catch-all page rendered for any route that doesn't match a defined path (see App.jsx).
function NotFound() {
    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1>Page not found</h1>
                <p className="auth-subtitle">The page you're looking for doesn't exist or has moved.</p>
                <p className="auth-footer">
                    <Link to="/">Back to home</Link>
                </p>
            </div>
        </div>
    );
}

export default NotFound;
