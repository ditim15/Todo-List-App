// Todos endpoints. Each function takes `authFetch` (from AuthContext, via useAuth) as
// its first argument so calls carry the current access token and get transparent
// refresh-and-retry on 401.

export function getTodos(authFetch, page = 1, limit = 10) {
    return authFetch(`/todos?page=${page}&limit=${limit}`);
}

export function createTodo(authFetch, { title, description, completed = false}) {
    return authFetch('/todos', {
        method: 'POST',
        body: JSON.stringify({ title, description, completed }),
    });
}

export function updateTodo(authFetch, id, { title, description, completed }) {
    return authFetch(`/todos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title, description, completed }),
    });
}

export function deleteTodo(authFetch, id) {
    return authFetch(`/todos/${id}`, {
        method: 'DELETE',
    });
}
