// Simple line icons for the landing page feature grid. Decorative (aria-hidden).

function Icon({ children }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

export function CalendarIcon() {
    return (
        <Icon>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4M8 15h3" />
        </Icon>
    );
}

export function ListsIcon() {
    return (
        <Icon>
            <path d="M9 6h11M9 12h11M9 18h11" />
            <circle cx="4.5" cy="6" r="1.2" />
            <circle cx="4.5" cy="12" r="1.2" />
            <circle cx="4.5" cy="18" r="1.2" />
        </Icon>
    );
}

export function FlagIcon() {
    return (
        <Icon>
            <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </Icon>
    );
}

export function SearchIcon() {
    return (
        <Icon>
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
        </Icon>
    );
}

export function BoltIcon() {
    return (
        <Icon>
            <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />
        </Icon>
    );
}

export function MoonIcon() {
    return (
        <Icon>
            <path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.5 6.5 0 0 0 10 10z" />
        </Icon>
    );
}

export function CheckIcon() {
    return (
        <Icon>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
        </Icon>
    );
}
