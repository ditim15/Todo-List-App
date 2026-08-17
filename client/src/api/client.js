const API_URL = import.meta.env.VITE_API_URL;

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