import { createContext, useContext, useState, useEffect, useRef } from "react";
import { loginUser, logoutUser, registerUser, refreshAccessToken, verifyEmail as verifyEmailRequest } from "../api/auth";

const AuthContext = createContext(null);

// Not a secret: just remembers that this browser had a session, so logged-out visitors
// don't make a refresh request on every page load. The real credential is the httpOnly
// refresh-token cookie, which scripts can't read.
const SESSION_HINT_KEY = 'nudge:has-session';
// Where older versions kept the refresh token itself. Removed on load.
const LEGACY_REFRESH_TOKEN_KEY = 'refreshToken';

function setSessionHint(hasSession) {
    try {
        if (hasSession) localStorage.setItem(SESSION_HINT_KEY, '1');
        else localStorage.removeItem(SESSION_HINT_KEY);
    } catch {
        // Storage unavailable (private mode, blocked site data): the hint is optional.
    }
}

function hasSessionHint() {
    try {
        return localStorage.getItem(SESSION_HINT_KEY) === '1';
    } catch {
        // Can't tell, so try the cookie anyway.
        return true;
    }
}

// Provides auth state (user, access token) and auth-related actions to the whole app.
// The access token lives in memory only. The refresh token is an httpOnly cookie set by
// the server, so a session survives page reloads without any script being able to
// read the token.
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    // Guards against React StrictMode/dev double-invoking this effect, which would
    // otherwise fire two concurrent refresh requests on mount.
    const hasRun = useRef(false);
    // The refresh in progress, if any. Refresh tokens are single-use, so concurrent
    // callers must share one request instead of racing (the loser would be logged out).
    const refreshPromiseRef = useRef(null);

    function refreshSession() {
        refreshPromiseRef.current ??= refreshAccessToken()
            .then((data) => {
                setUser(data.user);
                setAccessToken(data.accessToken);
                setSessionHint(true);
                return data;
            })
            .finally(() => {
                refreshPromiseRef.current = null;
            });
        return refreshPromiseRef.current;
    }

    function clearSession() {
        setUser(null);
        setAccessToken(null);
        setSessionHint(false);
    }

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        try {
            localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
        } catch {
            // Nothing to clean up.
        }

        // On load, silently restore the session from the cookie so the user doesn't
        // have to log in again after a page refresh.
        if (!hasSessionHint()) {
            setIsLoading(false);
            return;
        }
        refreshSession()
            .catch(() => clearSession())
            .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function login(email, password) {
        const data = await loginUser(email, password);

        setUser(data.user);
        setAccessToken(data.accessToken);
        setSessionHint(true);

        return data;
    }

    // Registration creates an unverified account and emails a verification link; it
    // does not log in. Resolves with { email, emailSent }.
    async function register(name, email, password) {
        return registerUser(name, email, password);
    }

    // Confirms the email from the verification link's token. The server logs the user
    // in on success, returning the same user/accessToken shape as login.
    async function verifyEmail(token) {
        const data = await verifyEmailRequest(token);

        setUser(data.user);
        setAccessToken(data.accessToken);
        setSessionHint(true);

        return data;
    }

    // Signs out here and revokes the refresh token on the server (which also clears its
    // cookie). The local sign-out happens either way: if the server can't be reached,
    // the token still expires on its own after 7 days.
    function logout() {
        logoutUser().catch(() => {});
        clearSession();
    }

    // Authenticated fetch wrapper for API calls that require a valid access token
    // (e.g. the todos endpoints). On a 401, refreshes the access token once from the
    // cookie and retries the request before giving up.
    async function authFetch(endpoint, options = {}) {
        const makeRequest = (token) =>
            fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { Authorization: `Bearer ${token}` }),
                    ...options.headers,
                },
            });

        let response = await makeRequest(accessToken);

        if (response.status === 401) {
            try {
                const data = await refreshSession();
                response = await makeRequest(data.accessToken);
            } catch {
                clearSession();
                throw new Error('Session expired. Please log in again.');
            }
        }

        const responseData = await response.json();

        if (!response.ok) {
            const error = new Error(responseData.message || 'Something went wrong');
            error.status = response.status;
            throw error;
        }

        return responseData;
    }

    const value = {
        user,
        accessToken,
        isAuthenticated: !!accessToken,
        isLoading,
        authFetch,
        login,
        register,
        verifyEmail,
        logout,
        clearSession,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook for consuming auth state/actions; throws if used outside an AuthProvider so
// misuse fails fast instead of returning undefined values.
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
