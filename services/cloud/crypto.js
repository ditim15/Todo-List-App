// Encrypts the cloud providers' OAuth tokens before they're stored (AES-256-GCM), so a
// leaked database dump doesn't hand out access to people's Drive/OneDrive/Dropbox.
//
// The key comes from CLOUD_TOKEN_KEY (any long random string). Without it, a key is
// derived from JWT_SECRET, which is fine for development; in production server.js
// requires CLOUD_TOKEN_KEY once a provider is configured, so rotating JWT_SECRET can't
// silently break every connection. Changing the key means everyone reconnects.
import crypto from 'crypto';

function key() {
    const secret = process.env.CLOUD_TOKEN_KEY || process.env.JWT_SECRET;
    if (!secret) throw new Error('CLOUD_TOKEN_KEY (or JWT_SECRET) must be set to store cloud tokens');
    return crypto.createHash('sha256').update(`doneyet-cloud-tokens:${secret}`).digest();
}

// "v1.<iv>.<tag>.<ciphertext>", all base64url.
export function encryptToken(plain) {
    if (plain === null || plain === undefined) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decryptToken(stored) {
    if (!stored) return null;
    const [version, iv, tag, data] = stored.split('.');
    if (version !== 'v1') throw new Error('Unknown token format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

// PKCE (RFC 7636): a random verifier and its S256 challenge.
export function pkcePair() {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

export function randomState() {
    return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}
