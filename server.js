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
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const { initDatabase } = require('./database/init');
const { addClient, clientCount } = require('./utils/sse');
const jwt = require('jsonwebtoken');

// ── Iniciar banco de dados ──
initDatabase();

// ── Backup automático diário do SQLite ──
const DB_PATH = path.join(__dirname, 'database', 'credbusiness.db');
const BACKUP_DIR = path.join(__dirname, 'backups');

function runDailyBackup() {
    try {
        if (!fs.existsSync(DB_PATH)) return;
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const date = new Date().toISOString().slice(0, 10);
        const backupFile = path.join(BACKUP_DIR, `credbusiness_${date}.db`);
        fs.copyFileSync(DB_PATH, backupFile);
        // Manter apenas últimos 7 backups
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('credbusiness_') && f.endsWith('.db')).sort();
        while (files.length > 7) { fs.unlinkSync(path.join(BACKUP_DIR, files.shift())); }
        console.log(`[Backup] ${date} — OK (${(fs.statSync(backupFile).size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (err) {
        console.error('[Backup] Erro:', err.message);
    }
}

// Backup ao iniciar + a cada 24h
runDailyBackup();
setInterval(runDailyBackup, 24 * 60 * 60 * 1000);

// ── Verificação automática de mensalidades vencidas ──
function checkMonthlyFees() {
    try {
        const { getDB } = require('./database/init');
        const db = getDB();
        const today = new Date().toISOString().slice(0, 10);

        // Bloquear usuários com mensalidade vencida (que tenham pacote ativo e não estejam já bloqueados)
        const overdue = db.prepare(
            "UPDATE users SET access_blocked = 1 WHERE has_package = 1 AND access_blocked = 0 AND monthly_fee_paid_until IS NOT NULL AND monthly_fee_paid_until < ?"
        ).run(today);

        if (overdue.changes > 0) {
            console.log(`[Mensalidade] ${overdue.changes} usuário(s) bloqueado(s) por mensalidade vencida`);

            // Notificar usuários bloqueados
            const blocked = db.prepare(
                "SELECT id FROM users WHERE has_package = 1 AND access_blocked = 1 AND monthly_fee_paid_until < ?"
            ).all(today);

            const { createNotification } = require('./utils/notifications');
            for (const u of blocked) {
                try {
                    createNotification(u.id, 'warning', 'Mensalidade vencida',
                        'Sua mensalidade está vencida e seu acesso foi bloqueado. Efetue o pagamento para reativar.');
                } catch {}
            }
        }
    } catch (err) {
        console.error('[Mensalidade] Erro verificação:', err.message);
    }
}

// Verificar mensalidades ao iniciar + a cada 1 hora
setTimeout(checkMonthlyFees, 10000); // 10s após iniciar
setInterval(checkMonthlyFees, 60 * 60 * 1000);

// ── Auto-verificação de pagamentos PIX/Boleto pendentes ──
async function checkPendingPayments() {
    try {
        const asaas = require('./utils/asaas');
        if (!asaas.isConfigured()) return;

        const allowTimeBasedAutoApproval = process.env.ALLOW_TIME_BASED_PAYMENT_AUTO_APPROVAL === 'true';

        const { getDB } = require('./database/init');
        const db = getDB();

        // Buscar pagamentos pendentes (cartão até 5h, boleto até 3 dias, outros até 48h)
        const pending = db.prepare(
            "SELECT * FROM payments WHERE status = 'pendente' AND asaas_payment_id IS NOT NULL AND created_at >= datetime('now', '-3 days')"
        ).all();

        if (pending.length === 0) return;
        console.log(`[AutoCheck] Verificando ${pending.length} pagamento(s) pendente(s)...`);

        const { createNotification } = require('./utils/notifications');

        for (const p of pending) {
            try {
                let shouldActivate = false;

                // 1. Verificar com o gateway Asaas
                const asaasPayment = await asaas.getPaymentStatus(p.asaas_payment_id);
                if (asaasPayment) {
                    const newStatus = asaas.mapPaymentStatus(asaasPayment.status);
                    if (newStatus === 'pago' && p.status !== 'pago') {
                        console.log(`[AutoCheck] Pagamento ${p.asaas_payment_id} CONFIRMADO pelo gateway — ativando...`);
                        shouldActivate = true;
                    }
                }

                // 2. Auto-ativação por tempo é insegura e fica desabilitada por padrão.
                if (!shouldActivate && allowTimeBasedAutoApproval) {
                    const createdAt = new Date(p.created_at + (p.created_at.includes('Z') ? '' : 'Z'));
                    const hoursElapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
                    if (p.method === 'credit_card' && hoursElapsed >= 5) {
                        console.log(`[AutoCheck] Pagamento ${p.asaas_payment_id} (cartão) — ${Math.round(hoursElapsed)}h decorridas, auto-ativando...`);
                        shouldActivate = true;
                    } else if (p.method === 'boleto' && hoursElapsed >= 72) {
                        console.log(`[AutoCheck] Pagamento ${p.asaas_payment_id} (boleto) — ${Math.round(hoursElapsed)}h decorridas, auto-ativando...`);
                        shouldActivate = true;
                    }
                }

                if (shouldActivate && p.status !== 'pago') {
                    db.prepare("UPDATE payments SET status = 'pago', paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status != 'pago'")
                        .run(p.id);

                    // Ativar pacote/plano
                    if (p.type === 'package' && p.reference_id) {
                        const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(p.reference_id);
                        if (pkg) {
                            const userBefore = db.prepare('SELECT has_package FROM users WHERE id = ?').get(p.user_id);
                            const isFirstPackage = !userBefore || userBefore.has_package === 0;
                            const namesCredit = pkg.names_count || 0;
                            db.prepare('UPDATE users SET points = points + ?, names_available = names_available + ? WHERE id = ?').run(pkg.points, namesCredit, p.user_id);
                            db.prepare('UPDATE users SET has_package = 1 WHERE id = ?').run(p.user_id);
                            if (isFirstPackage) {
                                const now = new Date();
                                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                                const freeUntilStr = endOfMonth.toISOString().split('T')[0];
                                db.prepare('UPDATE users SET monthly_fee_paid_until = ?, access_blocked = 0, active = 1 WHERE id = ?')
                                    .run(freeUntilStr, p.user_id);
                            } else {
                                db.prepare('UPDATE users SET active = 1 WHERE id = ? AND active = 0 AND has_package = 0').run(p.user_id);
                            }
                            if (pkg.level_key) {
                                const LEVEL_ORDER = { start: 1, bronze: 2, prata: 3, ouro: 4, diamante: 5 };
                                const user = db.prepare('SELECT level FROM users WHERE id = ?').get(p.user_id);
                                const newRank = LEVEL_ORDER[pkg.level_key] || 0;
                                const currentRank = LEVEL_ORDER[user?.level] || 0;
                                if (newRank > currentRank) {
                                    db.prepare('UPDATE users SET level = ? WHERE id = ?').run(pkg.level_key, p.user_id);
                                }
                            }
                            db.prepare(`UPDATE user_packages SET status = 'ativo', payment_status = 'pago'
                                WHERE user_id = ? AND package_id = ? AND payment_status = 'pendente'
                                ORDER BY id DESC LIMIT 1`)
                                .run(p.user_id, pkg.id);
                            createNotification(p.user_id, 'purchase', 'Pacote ativado!',
                                `Seu pacote "${pkg.name}" foi ativado. +${pkg.points} pontos e ${namesCredit} nome(s) adicionados!`);
                        }
                    }
                    if (p.type === 'plan') {
                        const ref = p.external_reference || '';
                        const match = ref.match(/^plan_(.+?)_user_/);
                        if (match) {
                            db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(match[1], p.user_id);
                            createNotification(p.user_id, 'plan', 'Plano ativado!', 'Seu plano foi ativado com sucesso.');
                        }
                    }
                    if (p.type === 'deposit') {
                        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(p.amount, p.user_id);
                        createNotification(p.user_id, 'success', 'Depósito confirmado!',
                            `R$ ${p.amount.toFixed(2)} foram creditados na sua carteira.`);
                        db.prepare(`INSERT INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status)
                            VALUES (?, 'deposito', ?, 'Depósito confirmado', 'payment', ?, date('now'), 'concluido')`)
                            .run(p.user_id, p.amount, p.id);
                    }
                    if (p.type === 'monthly_fee') {
                        const now = new Date();
                        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
                        const paidUntilStr = nextMonth.toISOString().slice(0, 10);
                        db.prepare('UPDATE users SET monthly_fee_paid_until = ?, access_blocked = 0 WHERE id = ?')
                            .run(paidUntilStr, p.user_id);
                        createNotification(p.user_id, 'success', 'Mensalidade paga!',
                            `Sua mensalidade foi confirmada. Acesso liberado até ${paidUntilStr}.`);
                    }
                    // Registrar transação
                    if (p.type !== 'deposit' && p.type !== 'monthly_fee') {
                        db.prepare(`INSERT OR IGNORE INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status)
                            VALUES (?, 'pagamento', ?, ?, 'payment', ?, date('now'), 'concluido')`)
                            .run(p.user_id, p.amount, `Pagamento ${p.type} via ${p.method}`, p.id);
                    }
                }
            } catch (e) {
                console.error(`[AutoCheck] Erro verificando ${p.asaas_payment_id}:`, e.message);
            }
        }
    } catch (err) {
        console.error('[AutoCheck] Erro geral:', err.message);
    }
}

// Verificar pagamentos pendentes a cada 2 minutos
setTimeout(checkPendingPayments, 30000); // 30s após iniciar
setInterval(checkPendingPayments, 2 * 60 * 1000);

// ── App Express ──
const app = express();

// ── Trust proxy (behind Nginx) ──
app.set('trust proxy', 1);

// ── Segurança ──
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            manifestSrc: ["'self'"],
            workerSrc: ["'self'"]
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
    'http://127.0.0.1:3001',
    'http://177.153.58.152',
    'https://177.153.58.152',
    'http://mkt-credbusiness.vps-kinghost.net',
    'https://mkt-credbusiness.vps-kinghost.net',
    'http://credbusinessconsultoria.com.br',
    'https://credbusinessconsultoria.com.br',
    'http://www.credbusinessconsultoria.com.br',
    'https://www.credbusinessconsultoria.com.br'
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
app.use(cookieParser());

// ── CSRF Protection ──
const { csrfProtection } = require('./middleware/csrf');
app.use(csrfProtection({ skipPaths: [
    '/api/payments/webhook',
    '/api/auth/login',
    '/api/auth/admin-login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/contracts/public'
] }));

// ── Rate Limiting ──
// Custom keyGenerator to avoid ERR_ERL_INVALID_IP_ADDRESS behind Nginx proxy
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim().replace(/^\//, '');
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
};

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientIp,
    skip: (req) => req.path === '/api/payments/webhook',
    message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
    validate: { ip: false }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    keyGenerator: getClientIp,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    validate: { ip: false }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/admin-login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// ── Favicon (emoji dinâmico das settings) ──
app.get('/favicon.ico', (req, res) => {
    const { getDB } = require('./database/init');
    let emoji = '💎';
    try {
        const row = getDB().prepare("SELECT value FROM settings WHERE key = 'faviconEmoji'").get();
        if (row && row.value) emoji = row.value;
    } catch {}
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(svg);
});

// ── Health Check ──
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ── API pública: contrato para clientes (sem auth) ──
app.get('/api/contracts/public/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const db = require('./database/init').getDB();
    const contract = db.prepare('SELECT id, title, description, content, version, created_at FROM contracts WHERE id = ? AND active = 1').get(id);
    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });
    res.json(contract);
});

// ── API pública: aceite de contrato por cliente externo ──
app.post('/api/contracts/public/:id/accept', (req, res) => {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const { name, cpf, email } = req.body;
    if (!name || !cpf) return res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
    const cpfClean = cpf.replace(/\D/g, '');
    if (cpfClean.length !== 11) return res.status(400).json({ error: 'CPF inválido' });
    const db = require('./database/init').getDB();
    const contract = db.prepare('SELECT id FROM contracts WHERE id = ? AND active = 1').get(id);
    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });
    const already = db.prepare('SELECT id FROM contract_acceptances WHERE contract_id = ? AND client_cpf = ?').get(id, cpfClean);
    if (already) return res.json({ success: true, message: 'Contrato já aceito anteriormente', alreadyAccepted: true });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    db.prepare('INSERT INTO contract_acceptances (contract_id, client_name, client_cpf, client_email, ip) VALUES (?, ?, ?, ?, ?)')
        .run(id, name.trim(), cpfClean, (email || '').trim(), clientIp);
    res.json({ success: true, message: 'Contrato aceito com sucesso!' });
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
app.use('/api/wallet', require('./routes/wallet'));

// ── Trabalhe Conosco (rota pública, sem auth) ──
app.post('/api/careers/apply', (req, res) => {
    try {
        const { nome, email, whatsapp, cidade, area, sobre } = req.body;
        if (!nome || !email) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' });

        const db = require('./database/init').getDB();
        db.exec(`CREATE TABLE IF NOT EXISTS career_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT NOT NULL,
            whatsapp TEXT,
            cidade TEXT,
            area TEXT,
            sobre TEXT,
            status TEXT DEFAULT 'pendente',
            created_at TEXT DEFAULT (datetime('now'))
        )`);

        db.prepare('INSERT INTO career_applications (nome, email, whatsapp, cidade, area, sobre) VALUES (?, ?, ?, ?, ?, ?)')
          .run(nome, email, whatsapp || null, cidade || null, area || null, sobre || null);

        res.json({ ok: true });
    } catch (err) {
        console.error('Erro careers:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── SSE (Server-Sent Events) — Real-time updates ──
app.get('/api/sse', (req, res) => {
    // EventSource can't send headers, so accept token via query
    const token = req.query.token;
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    let decoded;
    try {
        const { EFFECTIVE_JWT_SECRET } = require('./middleware/auth');
        decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Token inválido' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Nginx: disable buffering
    });
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Keep-alive every 30s
    const keepAlive = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch { clearInterval(keepAlive); }
    }, 30000);

    addClient(decoded.id, res);
    req.on('close', () => clearInterval(keepAlive));
});

// ── Servir SOMENTE arquivos do frontend (whitelist) ──
const publicDirs = ['css', 'js', 'pages', 'admin', 'icons'];
publicDirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
        app.use(`/${dir}`, express.static(dirPath, { extensions: ['html', 'css', 'js'] }));
    }
});

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Somente avatares ficam publicamente acessíveis.
const publicAvatarDir = path.join(uploadsDir, 'avatars');
if (!fs.existsSync(publicAvatarDir)) fs.mkdirSync(publicAvatarDir, { recursive: true });
app.use('/uploads/avatars', express.static(publicAvatarDir));

// Arquivos HTML na raiz (whitelist explícita)
const publicFiles = ['index.html', 'login.html', 'register.html', 'password-forgot.html', 'password-reset.html', 'termos-de-uso.html', 'politica-de-privacidade.html', 'contrato.html', 'offline.html', 'manifest.json'];
publicFiles.forEach(file => {
    app.get(`/${file}`, (req, res) => {
        res.sendFile(path.join(__dirname, file));
    });
});

// Service Worker precisa de Service-Worker-Allowed header e sem cache
app.get('/sw.js', (req, res) => {
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'sw.js'));
});

// ── Digital Asset Links (TWA / Android APK verification) ──
app.get('/.well-known/assetlinks.json', (req, res) => {
    const fingerprint = process.env.TWA_SHA256_FINGERPRINT || '';
    const packageName = process.env.TWA_PACKAGE_NAME || 'com.credbusiness.app';
    const links = [];
    // Sempre incluir o fingerprint do ambiente (pode ser vazio durante setup)
    if (fingerprint) {
        links.push({
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
                namespace: 'android_app',
                package_name: packageName,
                sha256_cert_fingerprints: [fingerprint]
            }
        });
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(links);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Custom pages: /pages/custom-{slug}.html → serve template ──
app.get('/pages/custom-*.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'custom-page.html'));
});

// ── Sponsor URL: /register/:sponsor → redirect to register.html?ref=sponsor ──
app.get('/register/:sponsor', (req, res) => {
    const sponsor = encodeURIComponent(req.params.sponsor);
    res.redirect(`/register.html?ref=${sponsor}`);
});

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

module.exports = app;
