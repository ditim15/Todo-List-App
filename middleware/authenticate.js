import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';

// Checks the access token's signature and expiry, then that it hasn't been revoked:
// its `tv` must match the user's current token_version, which a password reset bumps.
// A deleted account has no row, so its tokens stop working straight away too.
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
        return res.status(401).json({ message: "Invalid or expired token" });
    }

    try {
        const result = await pool.query('SELECT token_version FROM users WHERE id = $1', [decoded.id]);
        if (result.rows.length === 0 || result.rows[0].token_version !== decoded.tv) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }
    } catch (err) {
        return next(err);
    }

    req.user = decoded;
    next();
}

export {
    authenticate
}
