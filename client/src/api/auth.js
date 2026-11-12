import { apiRequest } from "./client";

// Auth endpoints. These are unauthenticated (no access token required), unlike the
// todos endpoints in api/todos.js which go through AuthContext's authFetch.

export function loginUser(email, password) {
    return apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({email, password}),
    });
}

export function refreshAccessToken(refreshToken) {
    return apiRequest('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
    });
}

// Revokes the refresh token on the server, so it can't be used again even if it was
// copied from this browser.
export function logoutUser(refreshToken) {
    return apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
    });
}

// Exchanges the token from the emailed link for a verified account + session.
export function verifyEmail(token) {
    return apiRequest('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
    });
}

// Emails a new verification link (the server answers the same whether or not the
// address is registered).
export function resendVerification(email) {
    return apiRequest('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });
}

// Creates an unverified account and emails a verification link. Does not log in.
export function registerUser(name, email, password) {
    return apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
    });
}
