// Account endpoints that need the signed-in user. Like api/todos.js, each function
// takes `authFetch` from AuthContext.

// Permanently deletes the account and all of its data. `password` is checked again.
export function deleteAccount(authFetch, password) {
    return authFetch('/auth/account', {
        method: 'DELETE',
        credentials: 'include',
        body: JSON.stringify({ password }),
    });
}
