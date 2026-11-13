// Icons shown in the round badge (.auth-icon) at the top of centered auth cards.

export function MailIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
        </svg>
    );
}

export function CheckCircleIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
    );
}

export function LinkBrokenIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.5 14.5l-1.8 1.8a3 3 0 01-4.2-4.2l2.6-2.6a3 3 0 014.2 0" />
            <path d="M14.5 9.5l1.8-1.8a3 3 0 014.2 4.2l-2.6 2.6a3 3 0 01-4.2 0" />
            <path d="M4 4l2 2M20 20l-2-2" />
        </svg>
    );
}
