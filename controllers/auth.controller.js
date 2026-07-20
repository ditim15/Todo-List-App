import pool from "../db/pool.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { generateRefreshToken, hashToken } from "../utils/hashToken.js";

// Register a new user.
const registerUser = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ 
                message: "Please provide name, email, and password"
            });
        }

        const existingUser = await pool.query(
            "SELECT * FROM users WHERE email = $1", [email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ 
                message: "User already exists" 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
            [name, email.toLowerCase(), hashedPassword]
        );

        const accessToken = jwt.sign(
            { id: newUser.rows[0].id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = generateRefreshToken();
        const hashedRefreshToken = hashToken(refreshToken);

       await pool.query(
            'INSERT INTO refresh_tokens (user_id, token_hash) VALUES ($1, $2)',
            [newUser.rows[0].id, hashedRefreshToken]
        );

        const { password: _, ...safeUser } = newUser.rows[0];

        res.status(201).json({ 
            message: "User registered successfully",
            user: safeUser,
            accessToken: accessToken,
            refreshToken: refreshToken
        });
    } catch (err) {
        next(err);
    }
};

// Logs in an existing user.
const loginUser = async (req, res, next) => {
    try {
        const {email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                message: "Please provide email and password"
            });
        }

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1', [email.toLowerCase()]
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

        const accessToken = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = generateRefreshToken();
        const hashedRefreshToken = hashToken(refreshToken);

        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token_hash) VALUES ($1, $2)',
            [user.id, hashedRefreshToken]
        );

        res.status(200).json({ 
            message: "User logged in successfully",
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            },
            accessToken: accessToken,
            refreshToken: refreshToken
        });

    } catch (err) {
        next(err);
    }
};

const refreshAccessToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                message: "Refresh token is required"
            });
        }

        const tokenHash = hashToken(refreshToken);

        const result = await pool.query(
            'SELECT * FROM refresh_tokens WHERE token_hash = $1', [tokenHash]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid refresh token"
            });
        }

        const storedToken = result.rows[0];

        if (new Date(storedToken.expires_at) < new Date()) {
            return res.status(401).json({
                message: "Refresh token has expired"
            });
        }

        await pool.query(
            'DELETE FROM refresh_tokens WHERE id = $1', [storedToken.id]
        );

        const newRefreshToken = generateRefreshToken();
        const newTokenHash = hashToken(newRefreshToken);

        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token_hash) VALUES ($1, $2)',
            [storedToken.user_id, newTokenHash]
        );

        const accessToken = jwt.sign(
            { id: storedToken.user_id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({
            message: "Access token refreshed successfully",
            accessToken: accessToken,
            refreshToken: newRefreshToken
        });

    } catch (err) {
        next(err);
    }

}

const logoutUser = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({
                message: "Refresh token is required"
            });
        }
        const tokenHash = hashToken(refreshToken);

        await pool.query(
            'DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]
        );

        res.status(200).json({
            message: "User logged out successfully"
        });
    } catch (err) {
        next(err);
    }
}

export {
    registerUser,
    loginUser,
    refreshAccessToken,
    logoutUser
}