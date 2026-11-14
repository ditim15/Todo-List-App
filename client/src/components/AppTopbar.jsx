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
                <nav className="topbar-tabs" aria-label="App sections">
                    <NavLink to="/dashboard" className="topbar-tab">Tasks</NavLink>
                    <NavLink to="/notes" className="topbar-tab">Notes</NavLink>
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
