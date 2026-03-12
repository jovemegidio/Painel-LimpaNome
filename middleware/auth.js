/* ═══════════════════════════════════════════
   Credbusiness — JWT Authentication Middleware
   ═══════════════════════════════════════════ */

const jwt = require('jsonwebtoken');
const { getDB } = require('../database/init');

// JWT_SECRET obrigatório em produção
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ FATAL: JWT_SECRET não definido no .env — aplicação não pode iniciar em produção');
        process.exit(1);
    }
    console.warn('⚠️  JWT_SECRET não definido no .env — gerando chave temporária (tokens não persistem entre reinícios)');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

// Verifica token JWT
function auth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'Token não fornecido' });

    const token = header.startsWith('Bearer ') ? header.slice(7) : header;

    try {
        const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);
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

// Verifica se o usuário tem pacote ativo (libera acesso total ao painel)
function requirePackage(req, res, next) {
    try {
        const db = getDB();
        const user = db.prepare('SELECT has_package, access_blocked FROM users WHERE id = ?').get(req.user.id);
        if (!user || !user.has_package) {
            return res.status(403).json({ error: 'Você precisa adquirir um pacote para acessar esta funcionalidade.', code: 'PACKAGE_REQUIRED' });
        }
        if (user.access_blocked) {
            return res.status(403).json({ error: 'Seu acesso está bloqueado por mensalidade pendente. Efetue o pagamento para reativar.', code: 'MONTHLY_FEE_REQUIRED' });
        }
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao verificar acesso' });
    }
}

// Gera token
function generateToken(payload) {
    return jwt.sign(payload, EFFECTIVE_JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
}

module.exports = { auth, adminOnly, requirePackage, generateToken, EFFECTIVE_JWT_SECRET };
