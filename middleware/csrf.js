/* ═══════════════════════════════════════════
   Credbusiness — CSRF Protection Middleware
   Double-Submit Cookie Pattern
   ═══════════════════════════════════════════ */

const crypto = require('crypto');

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const TOKEN_LENGTH = 32;

// Safe HTTP methods that don't need CSRF validation
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Middleware: sets CSRF token cookie on every response
 * and validates it on state-changing requests.
 *
 * Skips validation for:
 * - Safe methods (GET, HEAD, OPTIONS)
 * - Requests with valid Bearer JWT (API clients)
 * - Webhook endpoints (server-to-server)
 */
function csrfProtection(options = {}) {
    const skipPaths = options.skipPaths || [
        '/api/payments/webhook',
        '/api/auth/login',
        '/api/auth/admin-login',
        '/api/auth/register',
        '/api/auth/forgot-password',
        '/api/auth/reset-password'
    ];

    return (req, res, next) => {
        // Always set/refresh CSRF cookie if not present
        if (!req.cookies?.[CSRF_COOKIE]) {
            const token = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
            res.cookie(CSRF_COOKIE, token, {
                httpOnly: false, // JS needs to read it
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                path: '/',
                maxAge: 24 * 60 * 60 * 1000 // 24h
            });
        }

        // Skip validation for safe methods
        if (SAFE_METHODS.has(req.method)) return next();

        // Skip for webhook endpoints
        if (skipPaths.some(p => req.path.startsWith(p))) return next();

        // Skip if request has Bearer token (API auth — not vulnerable to CSRF)
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) return next();

        // Validate CSRF for cookie-authenticated/form requests
        const cookieToken = req.cookies?.[CSRF_COOKIE];
        const headerToken = req.headers[CSRF_HEADER];

        if (!cookieToken || !headerToken) {
            return res.status(403).json({ error: 'Token CSRF ausente' });
        }

        // Constant-time comparison to prevent timing attacks
        if (!timingSafeEqual(cookieToken, headerToken)) {
            return res.status(403).json({ error: 'Token CSRF inválido' });
        }

        next();
    };
}

function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = { csrfProtection };
