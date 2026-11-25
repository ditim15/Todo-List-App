import { useId } from 'react';
import './InstallPrompts.css';

function ShareIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </svg>
    );
}

// Safari on iPhone and iPad can't install from a button, so this explains the Share
// sheet route. A native <dialog>: open it with ref.current.showModal(); Esc or the
// button closes it. Used by the account menu and the install offer card.
function InstallHelpDialog({ ref }) {
    const titleId = useId();
    return (
        <dialog ref={ref} className="install-help" aria-labelledby={titleId}>
            <h2 id={titleId}>Add DoneYet to your Home Screen</h2>
            <ol>
                <li>Tap the Share button <ShareIcon /> in Safari&apos;s toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong>. DoneYet then opens full screen from its icon.</li>
            </ol>
            <form method="dialog">
                <button type="submit" className="install-help-close">Got it</button>
            </form>
        </dialog>
    );
}

export default InstallHelpDialog;
