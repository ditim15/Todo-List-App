import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useInstallPrompt } from '../../pwa/installPrompt';
import InstallHelpDialog from './InstallHelpDialog';
import './InstallPrompts.css';

// A one-time card offering to put DoneYet on the home screen. Rules, so it never nags:
// - Only when signed in, on a phone or tablet (a touch screen), where the browser can
//   install it (or on iPhone/iPad Safari) and it isn't installed already.
// - Once per account on each device: the first time the app is opened after signing in
//   there. "Install"/"Show me how" and "Not now" both stop it coming back; "Install app"
//   in the account menu stays available.
// - A short pause first, so it doesn't land on top of the page as it loads.

const SHOW_DELAY_MS = 2500;
const seenKey = (userId) => `doneyet:install-offer-seen:${userId}`;

function wasSeen(userId) {
    try {
        return localStorage.getItem(seenKey(userId)) === '1';
    } catch {
        return true; // storage blocked: without a way to remember, don't show it at all
    }
}

function markSeen(userId) {
    try {
        localStorage.setItem(seenKey(userId), '1');
    } catch {
        // Nothing to do: it simply may show again next time.
    }
}

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

function AppIcon() {
    return (
        <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
            <rect width="48" height="48" rx="11" fill="var(--accent)" />
            <path d="M12.5 25.2c2.4 1.6 5 4.4 7.6 7.6C24 25 29.5 18.5 36 13.5" fill="none" stroke="var(--on-accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function InstallOffer() {
    const { user } = useAuth();
    const { mode, install } = useInstallPrompt();
    const [visible, setVisible] = useState(false);
    const iosHelpRef = useRef(null);
    const userId = user?.id;

    const eligible = Boolean(userId) && Boolean(mode) && isTouchDevice() && !wasSeen(userId);

    useEffect(() => {
        if (!eligible) {
            setVisible(false);
            return undefined;
        }
        const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
        return () => clearTimeout(timer);
    }, [eligible]);

    function dismiss() {
        markSeen(userId);
        setVisible(false);
    }

    function accept() {
        markSeen(userId);
        setVisible(false);
        if (mode === 'prompt') install();
        else iosHelpRef.current?.showModal();
    }

    return (
        <>
            {visible && (
                <section className="install-offer" role="dialog" aria-labelledby="install-offer-title" aria-describedby="install-offer-text">
                    <AppIcon />
                    <div className="install-offer-body">
                        <h2 id="install-offer-title">Put DoneYet on your home screen</h2>
                        <p id="install-offer-text">Open it in one tap, full screen, like any other app.</p>
                        <div className="install-offer-actions">
                            <button type="button" className="install-offer-accept" onClick={accept}>
                                {mode === 'prompt' ? 'Install' : 'Show me how'}
                            </button>
                            <button type="button" className="install-offer-dismiss" onClick={dismiss}>
                                Not now
                            </button>
                        </div>
                    </div>
                </section>
            )}
            <InstallHelpDialog ref={iosHelpRef} />
        </>
    );
}

export default InstallOffer;
