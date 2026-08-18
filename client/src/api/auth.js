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

export function registerUser(name, email, password) {
    return apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
    });
}
