import { createContext, useContext, useState, useEffect, useRef } from "react";
import { loginUser, refreshAccessToken } from "../api/auth";

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

    function logout() {
        setUser(null);
        setAccessToken(null);
        localStorage.removeItem('refreshToken');
    }

    const value = {
        user,
        accessToken,
        isAuthenticated: !!accessToken,
        isLoading,
        login,
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