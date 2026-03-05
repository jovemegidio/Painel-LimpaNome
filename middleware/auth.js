/* ═══════════════════════════════════════════
   MI2 — JWT Authentication Middleware
   ═══════════════════════════════════════════ */

const jwt = require('jsonwebtoken');

// Verifica token JWT
function auth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'Token não fornecido' });

    const token = header.startsWith('Bearer ') ? header.slice(7) : header;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role, username }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

// Verifica se é admin
function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
}

// Gera token
function generateToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
}

module.exports = { auth, adminOnly, generateToken };
