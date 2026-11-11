import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import './AccountMenu.css';

function SilhouetteIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="8.5" r="4.25" />
            <path d="M3.75 20.25c0-4.1 3.7-6.75 8.25-6.75s8.25 2.65 8.25 6.75c0 .55-.45 1-1 1H4.75c-.55 0-1-.45-1-1z" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
    );
}

function LogoutIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
    );
}

// Account button for the dashboard top bar. Opens a dropdown with the signed-in user's
// details and account actions. New actions go in the menu list as another
// .account-item (role="menuitem"); keyboard navigation picks them up automatically.
function AccountMenu({ user, onLogout }) {
    const [open, setOpen] = useState(false);
    const { theme, toggleTheme } = useTheme();
    const rootRef = useRef(null);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    const menuId = useId();

    const items = () => Array.from(menuRef.current?.querySelectorAll('[role^="menuitem"]') ?? []);

    function close({ restoreFocus = false } = {}) {
        setOpen(false);
        if (restoreFocus) buttonRef.current?.focus();
    }

    // Focus the first item when the menu opens.
    useEffect(() => {
        if (open) items()[0]?.focus();
    }, [open]);

    // Close on outside click or when focus leaves the menu.
    useEffect(() => {
        if (!open) return;
        function onPointerDown(e) {
            if (!rootRef.current.contains(e.target)) close();
        }
        function onFocusIn(e) {
            if (!rootRef.current.contains(e.target)) close();
        }
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('focusin', onFocusIn);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('focusin', onFocusIn);
        };
    }, [open]);

    function onButtonKeyDown(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
        }
    }

    function onMenuKeyDown(e) {
        const list = items();
        const index = list.indexOf(document.activeElement);
        const focusAt = (i) => list[(i + list.length) % list.length]?.focus();

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                focusAt(index + 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                focusAt(index - 1);
                break;
            case 'Home':
                e.preventDefault();
                focusAt(0);
                break;
            case 'End':
                e.preventDefault();
                focusAt(list.length - 1);
                break;
            case 'Escape':
                e.preventDefault();
                close({ restoreFocus: true });
                break;
            case 'Tab':
                close();
                break;
            default:
        }
    }

    const name = user?.name || 'Your account';
    const isDark = theme === 'dark';

    return (
        <div className="account" ref={rootRef}>
            <button
                ref={buttonRef}
                type="button"
                className="account-button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={menuId}
                aria-label="Account"
                title="Account"
                onClick={() => setOpen((o) => !o)}
                onKeyDown={onButtonKeyDown}
            >
                <SilhouetteIcon />
            </button>

            {open && (
                <div className="account-panel">
                    <div className="account-profile">
                        <span className="account-avatar" aria-hidden="true"><SilhouetteIcon /></span>
                        <span className="account-identity">
                            <span className="account-name">{name}</span>
                            {user?.email && <span className="account-email">{user.email}</span>}
                        </span>
                    </div>

                    <ul
                        id={menuId}
                        ref={menuRef}
                        className="account-menu"
                        role="menu"
                        aria-label="Account"
                        onKeyDown={onMenuKeyDown}
                    >
                        <li role="none">
                            {/* Stays open on toggle so the change can be seen and undone. */}
                            <button
                                type="button"
                                className="account-item"
                                role="menuitemcheckbox"
                                aria-checked={isDark}
                                tabIndex={-1}
                                onClick={toggleTheme}
                            >
                                <MoonIcon />
                                <span>Dark mode</span>
                                <span className={`account-switch${isDark ? ' is-on' : ''}`} aria-hidden="true" />
                            </button>
                        </li>
                        <li role="separator" className="account-separator" />
                        <li role="none">
                            <button
                                type="button"
                                className="account-item"
                                role="menuitem"
                                tabIndex={-1}
                                onClick={() => {
                                    close();
                                    onLogout();
                                }}
                            >
                                <LogoutIcon />
                                <span>Log out</span>
                            </button>
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
}

export default AccountMenu;
