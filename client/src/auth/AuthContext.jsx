import { createContext, useContext, useState } from "react";
import { loginUser } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [accessToken, setAccessToken] = useState(null);

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