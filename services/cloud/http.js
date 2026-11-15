// Shared HTTP helper and error types for the cloud provider clients.

const TIMEOUT_MS = 30_000;

// The access token was rejected: refresh it and try again.
export class CloudAuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CloudAuthError';
    }
}

// The refresh token no longer works (revoked, expired, app removed): the user has to
// connect again.
export class CloudReauthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CloudReauthError';
    }
}

// Rate limited, provider outage or network trouble: try again later.
export class CloudRetryableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CloudRetryableError';
    }
}

// Anything else (a bad request, out of storage, ...): shown to the user.
export class CloudError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'CloudError';
        this.status = status;
    }
}

// fetch with a timeout. Returns the parsed JSON body (or null for empty/non-JSON) and
// throws one of the errors above for failures. `describe` turns an error body into a
// readable message.
export async function request(url, options = {}) {
    return (await requestWithHeaders(url, options)).data;
}

// Same, also returning the response headers.
export async function requestWithHeaders(url, { method = 'GET', token, headers = {}, body, describe } = {}) {
    let res;
    try {
        res = await fetch(url, {
            method,
            headers: { ...(token && { Authorization: `Bearer ${token}` }), ...headers },
            body,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (err) {
        throw new CloudRetryableError(`Couldn't reach the provider (${err.name === 'TimeoutError' ? 'timed out' : err.message})`);
    }

    const text = await res.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }
    if (res.ok) return { data, headers: res.headers };

    const detail = (describe?.(data) ?? (typeof data === 'string' ? data : JSON.stringify(data)) ?? '').toString().slice(0, 300);
    if (res.status === 401) throw new CloudAuthError(detail || 'Unauthorized');
    if (res.status === 429 || res.status >= 500) throw new CloudRetryableError(`Provider busy (${res.status})${detail ? `: ${detail}` : ''}`);
    throw new CloudError(detail || `Request failed (${res.status})`, res.status);
}

// POSTs an OAuth token request (application/x-www-form-urlencoded). invalid_grant on a
// refresh means the user has to reconnect.
export async function tokenRequest(url, params, { isRefresh = false } = {}) {
    try {
        const data = await request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params).toString(),
            describe: (d) => d?.error_description || d?.error,
        });
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? null,
            expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null,
        };
    } catch (err) {
        if (isRefresh && (err instanceof CloudError || err instanceof CloudAuthError)) {
            throw new CloudReauthError(`The connection needs to be renewed (${err.message})`);
        }
        throw err;
    }
}
