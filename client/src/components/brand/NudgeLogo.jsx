import './NudgeLogo.css';

// DoneYet? wordmark: an arrow, the word, and a checkbox.
//
// animate:
//   'none'  - static mark (arrow at rest, box checked). Default.
//   'intro' - when it mounts, the arrow shoots through the word, striking it out, and
//             clicks the box checked. Each page renders its own header, so this plays
//             on every page change as well as on load. Re-renders don't replay it.
//   'loop'  - the same motion repeating, used as a loading indicator.
//
// Size follows font-size, so set it from the parent.
function NudgeLogo({ animate = 'none', className = '' }) {
    const mode = animate === 'loop' ? 'loop' : animate === 'intro' ? 'intro' : 'static';

    return (
        <span className={`nudge-logo nudge-logo--${mode} ${className}`.trim()} role="img" aria-label="DoneYet?">
            {/* Invisible copy that reserves the word's space in the layout. */}
            <span className="nudge-logo-word" aria-hidden="true">DoneYet?</span>
            {/* The visible word is drawn twice over the same spot: normal ("todo") and
                greyed + struck through ("done"). The arrow's head is the boundary. */}
            <span className="nudge-logo-stage" aria-hidden="true">
                <span className="nudge-logo-text nudge-logo-text--todo">DoneYet?</span>
                <span className="nudge-logo-text nudge-logo-text--done">
                    {/* Crossed off with the site's hand-drawn strike (same path as the
                        landing page's Strike in components/landing/AppMocks). */}
                    <span className="nudge-logo-done-word">
                        DoneYet?
                        <svg className="nudge-logo-strike" viewBox="0 0 100 12" preserveAspectRatio="none">
                            <path d="M1 7.5C18 5 34 8.5 52 6.2S84 4.8 99 6.5" />
                        </svg>
                    </span>
                </span>
                <span className="nudge-logo-arrow">
                    <span className="nudge-logo-shaft" />
                    <svg className="nudge-logo-head" viewBox="0 0 10 14" fill="none">
                        <path d="M2.5 1.5L8 7l-5.5 5.5" />
                    </svg>
                </span>
            </span>
            <span className="nudge-logo-box" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                    {/* Slightly hand-drawn tick, matching the favicon. */}
                    <path d="M6 12.6c1.3.8 2.6 2.2 4 4C12.6 12.4 15 9.6 18.2 7.4" pathLength="1" />
                </svg>
            </span>
        </span>
    );
}

// Full-area loading state built on the looping logo.
export function NudgeLoader({ label = 'Loading' }) {
    return (
        <div className="nudge-loader" role="status">
            <NudgeLogo animate="loop" />
            <span className="nudge-loader-label">{label}…</span>
        </div>
    );
}

export default NudgeLogo;
