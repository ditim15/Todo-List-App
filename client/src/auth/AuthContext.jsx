import { createContext, useContext, useState, useEffect, useRef } from "react";
import { loginUser, registerUser, refreshAccessToken } from "../api/auth";

const AuthContext = createContext(null);

// Provides auth state (user, access token) and auth-related actions to the whole app.
// Access tokens are kept in memory only; refresh tokens are persisted to localStorage
// so a session can be restored across page reloads.
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    // Guards against React StrictMode/dev double-invoking this effect, which would
    // otherwise fire two concurrent refresh requests on mount.
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        // On load, try to silently re-authenticate using a stored refresh token so the
        // user doesn't have to log in again after a page refresh. Note: this only
        // restores accessToken, not `user` — the user object is unavailable until a
        // fresh login/register call.
        async function restoreSession() {
            const storedRefreshToken = localStorage.getItem('refreshToken');

            if (!storedRefreshToken) {
                setIsLoading(false);
                return;
            }

            try {
                const data = await refreshAccessToken(storedRefreshToken);
                setAccessToken(data.accessToken);
                localStorage.setItem('refreshToken', data.refreshToken);
            } catch (error) {
                console.error('Refresh failed:', error.message);
                localStorage.removeItem('refreshToken');
            } finally {
                setIsLoading(false);
            }
        }

        restoreSession();
    }, []);

    async function login(email, password) {
        const data = await loginUser(email, password);

        setUser(data.user);
        setAccessToken(data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        return data;
    }

    // Registration also logs the user in: the backend returns the same
    // user/accessToken/refreshToken shape as login.
    async function register(name, email, password) {
        const data = await registerUser(name, email, password);

        setUser(data.user);
        setAccessToken(data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        return data;
    }

    function logout() {
        setUser(null);
        setAccessToken(null);
        localStorage.removeItem('refreshToken');
    }

    // Authenticated fetch wrapper for API calls that require a valid access token
    // (e.g. the todos endpoints). On a 401, transparently refreshes the access token
    // once using the stored refresh token and retries the request before giving up.
    async function authFetch(endpoint, options = {}) {
        const makeRequest = (token) =>
            fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...AuthContext(token && { Authorization: `Bearer ${token}` }),
                    ...options.headers,
                },
            });

        let response = await makeRequest(accessToken);

        if (response.status === 401) {
            const storedRefreshToken = localStorage.getItem('refreshToken');
            if (!storedRefreshToken) {
                logout();
                throw new Error('Session expired. Please log in again.');
            }

            try {
                const data = await refreshAccessToken(storedRefreshToken);
                setAccessToken(data.accessToken);
                localStorage.setItem('refreshToken', data.refreshToken);
                response = await makeRequest(data.accessToken);
            } catch (err) {
                logout();
                throw new Error('Session expired. Please log in again.');
            }
        }

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.message || 'Something went wrong');
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
        logout,
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
