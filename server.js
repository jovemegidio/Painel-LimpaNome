/* ═══════════════════════════════════════════
   Credbusiness — Escritório Virtual — Backend Server
   Express + SQLite + JWT + API REST
   ═══════════════════════════════════════════ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { initDatabase } = require('./database/init');

// ── Iniciar banco de dados ──
initDatabase();

// ── App Express ──
const app = express();

// ── Segurança ──
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true }
}));
app.use(compression());

// ── CORS restrito ao domínio ──
const allowedOrigins = [
    `http://${process.env.DOMAIN || 'localhost'}`,
    `https://${process.env.DOMAIN || 'localhost'}`,
    'http://localhost:3001',
    'http://127.0.0.1:3001'
];
app.use(cors({
    origin: (origin, cb) => {
        // Permitir requests sem origin (mobile apps, curl, Postman, same-origin)
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Bloqueado por CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '200kb' }));

// ── Rate Limiting ──
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/payments/webhook', // Webhook sem rate limit
    message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/admin-login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// ── Health Check ──
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ── API Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/services', require('./routes/services'));
app.use('/api/content', require('./routes/content'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/university', require('./routes/university'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/lgpd', require('./routes/lgpd'));
app.use('/api/payments', require('./routes/payments'));

// ── Servir SOMENTE arquivos do frontend (whitelist) ──
const publicDirs = ['css', 'js', 'pages', 'admin'];
publicDirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
        app.use(`/${dir}`, express.static(dirPath, { extensions: ['html', 'css', 'js'] }));
    }
});

// Uploads directory (serve uploaded documents)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Arquivos HTML na raiz (whitelist explícita)
const publicFiles = ['index.html', 'login.html', 'register.html', 'password-forgot.html', 'password-reset.html', 'termos-de-uso.html', 'politica-de-privacidade.html'];
publicFiles.forEach(file => {
    app.get(`/${file}`, (req, res) => {
        res.sendFile(path.join(__dirname, file));
    });
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Fallback ──
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Rota não encontrada' });
    }
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// ── Error handler global ──
app.use((err, req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';
    console.error(`❌ [${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
    if (!isProduction) console.error(err.stack);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// ── Graceful Shutdown ──
function shutdown(signal) {
    console.log(`\n⚠️  ${signal} recebido. Encerrando...`);
    server.close(() => {
        console.log('✅ Servidor encerrado.');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Iniciar servidor ──
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════╗
║     Credbusiness — Escritório Virtual             ║
║     Servidor rodando na porta ${PORT}       ║
║     http://localhost:${PORT}                ║
╚══════════════════════════════════════════╝
    `);
});
server.timeout = 30000;
server.keepAliveTimeout = 65000;
