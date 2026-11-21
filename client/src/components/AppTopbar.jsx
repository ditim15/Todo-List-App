import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import NudgeLogo from './brand/NudgeLogo';
import ThemeToggle from './ThemeToggle';
import AccountMenu from './account/AccountMenu';
import './AppTopbar.css';

// Top bar for the signed-in app (dashboard and notes): logo, Tasks / Notes tabs, the
// light/dark button and the account menu.
function AppTopbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    function handleLogout() {
        logout();
        navigate('/login');
    }

    return (
        <header className="topbar">
            <div className="topbar-start">
                <Link to="/" className="topbar-brand">
                    <NudgeLogo animate="intro" />
                </Link>
                {/* On phones this becomes a tab bar along the bottom edge (AppTopbar.css). */}
                <nav className="topbar-tabs" aria-label="App sections">
                    <NavLink to="/dashboard" className="topbar-tab">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3.5" y="4" width="5" height="5" rx="1" />
                            <path d="M4.8 16.2l1.4 1.4 2.6-2.8M12 6.5h8.5M12 16.5h8.5" />
                        </svg>
                        <span className="topbar-tab-label">Tasks</span>
                    </NavLink>
                    <NavLink to="/notes" className="topbar-tab">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 3.5h8.5L19 8v12.5H6z" />
                            <path d="M14 3.5V8.5h5M9 13h7M9 16.5h5" />
                        </svg>
                        <span className="topbar-tab-label">Notes</span>
                    </NavLink>
                </nav>
            </div>
            {/* Same light/dark button as the landing and auth pages' top bars. */}
            <div className="topbar-actions">
                <ThemeToggle />
                <AccountMenu user={user} onLogout={handleLogout} />
            </div>
        </header>
    );
}

export default AppTopbar;
