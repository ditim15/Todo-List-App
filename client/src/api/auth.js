import { apiRequest } from "./client";

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