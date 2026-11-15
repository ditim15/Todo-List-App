// Google Drive. Scope drive.file: the app can only see files it created, nothing else
// in the user's Drive. Everything goes in a "DoneYet" folder at the top of their Drive.
// Refs are Drive file ids.
import crypto from 'crypto';
import { request, requestWithHeaders, tokenRequest } from './http.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
// Multipart uploads are for files up to 5 MB; bigger ones use a resumable upload.
const MULTIPART_MAX_BYTES = 5 * 1024 * 1024;

const describe = (d) => d?.error?.message;
const env = () => ({ id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET });

function multipartBody(metadata, content, mimeType) {
    const boundary = `doneyet-${crypto.randomBytes(12).toString('hex')}`;
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        content,
        Buffer.from(`\r\n--${boundary}--`),
    ]);
    return { body, contentType: `multipart/related; boundary=${boundary}` };
}

const google = {
    name: 'google-drive',
    label: 'Google Drive',

    isConfigured: () => Boolean(env().id && env().secret),

    authorizeUrl({ state, challenge, redirectUri }) {
        const params = new URLSearchParams({
            client_id: env().id,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'https://www.googleapis.com/auth/drive.file openid email profile',
            access_type: 'offline',
            // Without consent, Google only returns a refresh token the first time.
            prompt: 'consent',
            include_granted_scopes: 'true',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
        });
        return `${AUTH_URL}?${params}`;
    },

    exchangeCode({ code, verifier, redirectUri }) {
        return tokenRequest(TOKEN_URL, {
            grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri,
            client_id: env().id, client_secret: env().secret,
        });
    },

    refresh(refreshToken) {
        return tokenRequest(TOKEN_URL, {
            grant_type: 'refresh_token', refresh_token: refreshToken, client_id: env().id, client_secret: env().secret,
        }, { isRefresh: true });
    },

    async getAccount(token) {
        const me = await request('https://openidconnect.googleapis.com/v1/userinfo', { token, describe });
        return { email: me.email ?? null, name: me.name ?? null };
    },

    // Creates the "DoneYet" folder the first time.
    async getRoot(token) {
        const folder = await google.createFolder(token, 'root', 'DoneYet');
        return folder.ref;
    },

    async createFolder(token, parentRef, name) {
        const data = await request(`${API}/files?fields=id`, {
            method: 'POST', token, describe,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentRef] }),
        });
        return { ref: data.id };
    },

    // Creates the file, or replaces an existing one's content (and name).
    async uploadFile(token, parentRef, name, content, mimeType, existingRef = null) {
        // mimeType on updates too, so a file that changes type (an old .md backup that is
        // now a .docx) is relabelled rather than keeping its old type.
        const metadata = existingRef ? { name, mimeType } : { name, mimeType, parents: [parentRef] };
        const base = existingRef ? `${UPLOAD}/files/${existingRef}` : `${UPLOAD}/files`;
        const method = existingRef ? 'PATCH' : 'POST';

        if (content.length <= MULTIPART_MAX_BYTES) {
            const { body, contentType } = multipartBody(metadata, content, mimeType);
            const data = await request(`${base}?uploadType=multipart&fields=id`, {
                method, token, describe, headers: { 'Content-Type': contentType }, body,
            });
            return { ref: data.id };
        }

        // Resumable: start a session, then send the whole file in one request.
        const start = await requestWithHeaders(`${base}?uploadType=resumable&fields=id`, {
            method, token, describe,
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': mimeType,
                'X-Upload-Content-Length': String(content.length),
            },
            body: JSON.stringify(metadata),
        });
        const data = await request(start.headers.get('location'), {
            method: 'PUT', token, describe, headers: { 'Content-Type': mimeType }, body: content,
        });
        return { ref: data.id };
    },

    async move(token, ref, { name, parentRef, oldParentRef }) {
        const params = new URLSearchParams({ fields: 'id' });
        if (parentRef && parentRef !== oldParentRef) {
            params.set('addParents', parentRef);
            if (oldParentRef) params.set('removeParents', oldParentRef);
        }
        const data = await request(`${API}/files/${ref}?${params}`, {
            method: 'PATCH', token, describe,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(name ? { name } : {}),
        });
        return { ref: data.id };
    },

    // To the bin (recoverable for 30 days), not deleted outright.
    async remove(token, ref) {
        await request(`${API}/files/${ref}`, {
            method: 'PATCH', token, describe,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trashed: true }),
        });
    },

    async revoke(token) {
        await request(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
    },
};

export default google;
