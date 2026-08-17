import { apiRequest } from "./client";

export function loginUser(email, password) {
    return apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({email, password}),
    });
}