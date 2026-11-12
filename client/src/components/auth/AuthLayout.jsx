import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import ThemeToggle from '../ThemeToggle';
import NudgeLogo from '../brand/NudgeLogo';
import { CheckIcon } from '../landing/FeatureIcons';
// Reuses the landing page's buttons, brand mark, eyebrow, check-list and app mocks.
import '../../pages/static/Splash.css';
import './AuthLayout.css';

// Checkmark bullet matching the landing page's lists.
export function AuthBullet({ children }) {
    return (
        <li>
            <span className="bullet-icon"><CheckIcon /></span>
            {children}
        </li>
    );
}

// Page shell for Login, Register and Not Found: top bar, centered content and footer.
// `aside` is an optional marketing panel shown beside the card on wide screens.
function AuthLayout({ aside, children }) {
    const { pathname } = useLocation();
    const { isAuthenticated } = useAuth();
    const onLogin = pathname === '/login';
    const onRegister = pathname === '/register';

    return (
        <div className="auth-shell">
            <header className="auth-nav">
                <div className="auth-nav-inner">
                    <Link to="/" className="landing-brand">
                        <NudgeLogo animate="intro" />
                    </Link>
                    <div className="auth-nav-actions">
                        <ThemeToggle />
                        {onLogin && (
                            <>
                                <span className="auth-nav-hint">New to Nudge?</span>
                                <Link to="/register" className="btn btn-ghost btn-sm">Sign up</Link>
                            </>
                        )}
                        {onRegister && (
                            <>
                                <span className="auth-nav-hint">Have an account?</span>
                                <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
                            </>
                        )}
                        {/* Shared pages (privacy, account, not found) can be opened while signed in. */}
                        {!onLogin && !onRegister && (isAuthenticated
                            ? <Link to="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
                            : <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
                        )}
                    </div>
                </div>
            </header>

            <main className={`auth-main${aside ? ' auth-main--split' : ''}`}>
                {aside && <aside className="auth-aside">{aside}</aside>}
                <div className="auth-content">{children}</div>
            </main>

            <footer className="landing-footer">
                <div className="landing-footer-inner">
                    <span>© {new Date().getFullYear()} Nudge · Gentle reminders for busy students</span>
                    <nav aria-label="Footer">
                        <Link to="/">Home</Link>
                        <Link to="/login">Log in</Link>
                        <Link to="/register">Sign up</Link>
                        <Link to="/privacy">Privacy</Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}

export default AuthLayout;
