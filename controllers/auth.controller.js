import pool from "../db/pool.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { generateRefreshToken, hashToken } from "../utils/hashToken.js";
import {
    domainAcceptsMail,
    isValidEmailFormat,
    normalizeEmail,
    validatePassword,
} from "../utils/validation.js";
import { sendVerificationEmail } from "../notifications/authEmails.js";

const NAME_MAX_LENGTH = 100;
// Minimum gap between verification or password-reset emails to the same account.
const RESEND_COOLDOWN_SECONDS = 60;

// ---------- Sessions ----------
// The access token (1 hour) goes in the response body and lives in the client's memory.
// The refresh token (7 days, matching refresh_tokens.expires_at) goes in an httpOnly
// cookie, so scripts on the page can never read it. The cookie is only sent to /auth.
const REFRESH_COOKIE = 'nudge_refresh';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// SameSite=Lax works when the site and API share a domain (nudge.app and
// api.nudge.app, or localhost in development). If they're on unrelated domains, set
// COOKIE_SAMESITE=none, which browsers only accept on HTTPS (Secure) cookies.
function refreshCookieOptions() {
    const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
        sameSite,
        path: '/auth',
    };
}

function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

// Starts a session: stores a new refresh token, sets its cookie, and returns the
// access token for the response body.
async function startSession(res, userId) {
    const refreshToken = generateRefreshToken();
    await pool.query(
        'INSERT INTO refresh_tokens (user_id, token_hash) VALUES ($1, $2)',
        [userId, hashToken(refreshToken)]
    );
    res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshCookieOptions(), maxAge: REFRESH_TTL_MS });

    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// Ends every session the user has (password reset, account deletion).
async function revokeAllSessions(userId) {
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

// Creates a fresh verification link for the user (older links stop working) and emails
// it. Returns false if sending failed; the user can ask for another from the app.
async function issueVerificationEmail(user) {
    const token = generateRefreshToken();
    await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [user.id]);
    await pool.query(
        'INSERT INTO email_verification_tokens (user_id, token_hash) VALUES ($1, $2)',
        [user.id, hashToken(token)]
    );

    try {
        await sendVerificationEmail({ name: user.name, email: user.email, token });
        return true;
    } catch (err) {
        console.error(`[auth] Failed to send verification email to user ${user.id}:`, err.message);
        return false;
    }
}

// Register a new user. The account starts unverified: instead of logging the user in,
// this emails a verification link (see verifyEmail).
const registerUser = async (req, res, next) => {
    try {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const email = normalizeEmail(req.body.email);
        const { password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please provide name, email, and password"
            });
        }
        if (name.length > NAME_MAX_LENGTH) {
            return res.status(400).json({ message: `Name must be ${NAME_MAX_LENGTH} characters or fewer` });
        }
        if (!isValidEmailFormat(email)) {
            return res.status(400).json({ message: "Please enter a valid email address" });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ message: passwordError });
        }

        if (!(await domainAcceptsMail(email))) {
            return res.status(400).json({
                message: `We couldn't find a mail server for "${email.split('@')[1]}". Check the email address for typos.`
            });
        }

        const existingUser = await pool.query(
            "SELECT id, email_verified_at FROM users WHERE email = $1", [email]
        );

        const hashedPassword = await bcrypt.hash(password, 10);
        let user;

        if (existingUser.rows.length > 0) {
            if (existingUser.rows[0].email_verified_at) {
                return res.status(409).json({
                    message: "An account with this email already exists"
                });
            }
            // Never verified: nobody has proven they own this address, so let the new
            // sign-up take it over (e.g. someone who lost the first email).
            const updated = await pool.query(
                'UPDATE users SET name = $1, password = $2 WHERE id = $3 RETURNING id, name, email',
                [name, hashedPassword, existingUser.rows[0].id]
            );
            user = updated.rows[0];
        } else {
            const created = await pool.query(
                'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
                [name, email, hashedPassword]
            );
            user = created.rows[0];
        }

        const emailSent = await issueVerificationEmail(user);

        res.status(201).json({
            message: emailSent
                ? "Account created. Check your email to verify your address."
                : "Account created, but we couldn't send the verification email. Try resending it.",
            email: user.email,
            emailSent
        });
    } catch (err) {
        next(err);
    }
};

// Logs in an existing user. Unverified accounts get a 403 with code
// EMAIL_NOT_VERIFIED (only after the password checks out, so this doesn't reveal which
// emails are registered).
const loginUser = async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body.email);
        const { password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Please provide email and password"
            });
        }

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1', [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        if (!user.email_verified_at) {
            return res.status(403).json({
                message: "Please verify your email before logging in. Check your inbox for the link.",
                code: "EMAIL_NOT_VERIFIED",
                email: user.email
            });
        }

        const accessToken = await startSession(res, user.id);

        res.status(200).json({
            message: "User logged in successfully",
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            },
            accessToken
        });

    } catch (err) {
        next(err);
    }
};

// Confirms an email address from the emailed link's token, then logs the user in.
const verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.body;
        if (typeof token !== 'string' || token.length === 0) {
            return res.status(400).json({ message: "Verification token is required" });
        }

        // Deleting the token as part of the lookup makes it single-use, even if the
        // link is opened twice at the same moment.
        const consumed = await pool.query(
            'DELETE FROM email_verification_tokens WHERE token_hash = $1 RETURNING user_id, expires_at',
            [hashToken(token)]
        );

        if (consumed.rows.length === 0 || new Date(consumed.rows[0].expires_at) < new Date()) {
            return res.status(400).json({
                message: "This verification link is invalid or has expired.",
                code: "INVALID_VERIFICATION_TOKEN"
            });
        }

        const userId = consumed.rows[0].user_id;
        const verified = await pool.query(
            'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW())'
            + ' WHERE id = $1 RETURNING id, name, email',
            [userId]
        );
        await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);

        const accessToken = await startSession(res, userId);

        res.status(200).json({
            message: "Email verified",
            user: verified.rows[0],
            accessToken
        });
    } catch (err) {
        next(err);
    }
};

// Sends a new verification link. Always answers the same way, whether or not the
// email is registered, so it can't be used to discover accounts.
const resendVerification = async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body.email);
        const genericResponse = {
            message: "If that email belongs to an unverified account, we've sent a new verification link."
        };

        if (!isValidEmailFormat(email)) {
            return res.status(400).json({ message: "Please enter a valid email address" });
        }

        const result = await pool.query(
            'SELECT u.id, u.name, u.email, u.email_verified_at,'
            + ' (SELECT MAX(created_at) FROM email_verification_tokens t WHERE t.user_id = u.id) AS last_sent'
            + ' FROM users u WHERE u.email = $1',
            [email]
        );

        const user = result.rows[0];
        if (!user || user.email_verified_at) {
            return res.status(200).json(genericResponse);
        }

        const secondsSinceLast = user.last_sent ? (Date.now() - new Date(user.last_sent).getTime()) / 1000 : Infinity;
        if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
            return res.status(429).json({
                message: `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLast)} seconds before requesting another email.`
            });
        }

        await issueVerificationEmail(user);
        res.status(200).json(genericResponse);
    } catch (err) {
        next(err);
    }
};

// Swaps the refresh-token cookie for a new one plus a new access token (rotation: each
// refresh token works once). Also returns the user, so the client can restore it after
// a page reload.
const refreshAccessToken = async (req, res, next) => {
    try {
        const refreshToken = req.cookies?.[REFRESH_COOKIE];
        if (!refreshToken) {
            return res.status(401).json({ message: "Not logged in" });
        }

        // Deleting as part of the lookup makes the token single-use, even if two
        // requests race with it.
        const consumed = await pool.query(
            'DELETE FROM refresh_tokens WHERE token_hash = $1 RETURNING user_id, expires_at',
            [hashToken(refreshToken)]
        );
        const storedToken = consumed.rows[0];

        if (!storedToken || new Date(storedToken.expires_at) < new Date()) {
            clearRefreshCookie(res);
            return res.status(401).json({
                message: storedToken ? "Your session has expired. Please log in again." : "Invalid refresh token"
            });
        }

        const userResult = await pool.query(
            'SELECT id, name, email FROM users WHERE id = $1', [storedToken.user_id]
        );
        const accessToken = await startSession(res, storedToken.user_id);

        res.status(200).json({
            message: "Access token refreshed successfully",
            user: userResult.rows[0],
            accessToken
        });
    } catch (err) {
        next(err);
    }
};

// Revokes this browser's refresh token and clears its cookie. Succeeds even when
// there's no session, so the client can always call it.
const logoutUser = async (req, res, next) => {
    try {
        const refreshToken = req.cookies?.[REFRESH_COOKIE];
        if (refreshToken) {
            await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)]);
        }
        clearRefreshCookie(res);

        res.status(200).json({
            message: "User logged out successfully"
        });
    } catch (err) {
        next(err);
    }
};

export {
    registerUser,
    loginUser,
    verifyEmail,
    resendVerification,
    refreshAccessToken,
    logoutUser
}
