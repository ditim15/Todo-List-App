import { createContext, useContext, useState, useEffect, useRef } from "react";
import { loginUser, registerUser, refreshAccessToken } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

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

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}