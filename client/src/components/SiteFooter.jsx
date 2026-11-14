import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './SiteFooter.css';

// The one footer for every page: the landing page, the auth/info pages (via
// AuthLayout) and the dashboard. `compact` is a slimmer single row for the dashboard,
// whose desktop layout fills the viewport.
function SiteFooter({ compact = false }) {
    const { isAuthenticated } = useAuth();

    return (
        <footer className={`site-footer${compact ? ' site-footer--compact' : ''}`}>
            <div className="site-footer-inner">
                <span>© {new Date().getFullYear()} DoneYet? · Gentle reminders for busy students</span>
                <nav aria-label="Footer">
                    <Link to="/">Home</Link>
                    {isAuthenticated ? (
                        <Link to="/dashboard">Dashboard</Link>
                    ) : (
                        <>
                            <Link to="/login">Log in</Link>
                            <Link to="/register">Sign up</Link>
                        </>
                    )}
                    <Link to="/contact">Contact us</Link>
                    <Link to="/privacy">Privacy</Link>
                </nav>
            </div>
        </footer>
    );
}

export default SiteFooter;
