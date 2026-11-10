import { createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

// Must match the key read by the inline script in index.html.
const STORAGE_KEY = 'theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let fallbackTimer;

const ThemeContext = createContext(null);

function readStoredTheme() {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return value === 'light' || value === 'dark' ? value : null;
    } catch {
        return null; // storage blocked (e.g. some private modes)
    }
}

// Provides the current theme ('light' | 'dark') and a toggle. Until the user picks one,
// the theme follows the system setting (and updates live if it changes). The pick is
// saved to localStorage and applied as data-theme on <html>, which index.css keys off.
export function ThemeProvider({ children }) {
    const [preference, setPreference] = useState(readStoredTheme); // null = follow system
    const [systemDark, setSystemDark] = useState(darkQuery.matches);

    useEffect(() => {
        const onChange = (e) => setSystemDark(e.matches);
        darkQuery.addEventListener('change', onChange);
        return () => darkQuery.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        if (preference) root.dataset.theme = preference;
        else delete root.dataset.theme;
    }, [preference]);

    const theme = preference ?? (systemDark ? 'dark' : 'light');

    function toggleTheme() {
        const next = theme === 'dark' ? 'light' : 'dark';
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Not persisted, but still applied for this visit.
        }

        const root = document.documentElement;
        // Apply synchronously so a view transition can snapshot the new state.
        const apply = () => {
            root.dataset.theme = next;
            flushSync(() => setPreference(next));
        };

        if (reducedMotionQuery.matches) {
            apply();
        } else if (document.startViewTransition) {
            // Cross-fades the whole page between the old and new theme (see index.css).
            document.startViewTransition(apply);
        } else {
            // Fallback: briefly transition colors on every element.
            root.classList.add('theme-transition');
            apply();
            window.clearTimeout(fallbackTimer);
            fallbackTimer = window.setTimeout(() => root.classList.remove('theme-transition'), 450);
        }
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
