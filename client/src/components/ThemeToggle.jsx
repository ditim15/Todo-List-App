import { useTheme } from '../theme/ThemeContext';
import './ThemeToggle.css';

function SunIcon() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
            <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
                d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// Light/dark switch. Shows the icon of the mode you'd switch *to*.
// `floating` pins it to the top-right corner (used on pages without a top bar).
function ThemeToggle({ floating = false }) {
    const { theme, toggleTheme } = useTheme();
    const next = theme === 'dark' ? 'light' : 'dark';

    return (
        <button
            type="button"
            className={`theme-toggle${floating ? ' theme-toggle--floating' : ''}`}
            onClick={toggleTheme}
            aria-label={`Switch to ${next} mode`}
            title={`Switch to ${next} mode`}
        >
            {next === 'dark' ? <MoonIcon /> : <SunIcon />}
        </button>
    );
}

export default ThemeToggle;
