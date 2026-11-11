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
        // `code` lets callers react to specific failures (e.g. EMAIL_NOT_VERIFIED);
        // `data` carries any extra fields the server sent.
        const error = new Error(data.message || 'Something went wrong');
        error.status = response.status;
        error.code = data.code;
        error.data = data;
        throw error;
    }

    return data;
}
