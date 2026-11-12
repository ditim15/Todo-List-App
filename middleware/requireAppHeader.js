// CSRF guard for routes that act on the refresh-token cookie (/auth/refresh,
// /auth/logout). Browsers attach cookies automatically, so without this, another
// website could make a visitor's browser call these routes.
//
// A custom header can't be added to a cross-site request without a CORS preflight, and
// the preflight only passes for the origins allowed in app.js. So a request that
// carries this header came from our own frontend (or from a non-browser client, which
// doesn't have the user's cookie anyway).
export const APP_HEADER = 'x-requested-with';
export const APP_HEADER_VALUE = 'nudge';

export function requireAppHeader(req, res, next) {
    if (req.get(APP_HEADER) !== APP_HEADER_VALUE) {
        return res.status(403).json({ message: "Missing X-Requested-With header" });
    }
    next();
}
