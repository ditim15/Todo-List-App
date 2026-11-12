import { apiRequest } from "./client";

// Auth endpoints. These are unauthenticated (no access token required), unlike the
// todos endpoints in api/todos.js which go through AuthContext's authFetch.

export function loginUser(email, password) {
    return apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({email, password}),
    });
}

// Uses the httpOnly refresh-token cookie (the browser sends it; scripts can't read it).
export function refreshAccessToken() {
    return apiRequest('/auth/refresh', { method: 'POST' });
}

// Revokes this browser's refresh token on the server and clears its cookie.
export function logoutUser() {
    return apiRequest('/auth/logout', { method: 'POST' });
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

// Emails a password reset link. The server gives the same answer whether or not the
// address has an account.
export function forgotPassword(email) {
    return apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });
}

// Sets a new password from the emailed link's token. Logs out every session.
export function resetPassword(token, password) {
    return apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
    });
}
