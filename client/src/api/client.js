const API_URL = import.meta.env.VITE_API_URL;

// Base fetch wrapper used by all unauthenticated API calls (login/register/refresh).
// Sets JSON headers, parses the JSON body, and throws on non-2xx responses so callers
// can just await and catch.
export async function apiRequest(endpoint, options = {} ) {
    console.log('API_URL:', API_URL);
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
    }

    return data;
}
