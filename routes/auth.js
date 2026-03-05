/* ═══════════════════════════════════════════
   MI2 — Auth Routes
   POST /api/auth/login
   POST /api/auth/admin-login
   POST /api/auth/register
   POST /api/auth/forgot-password
   POST /api/auth/reset-password
   POST /api/auth/change-password
   POST /api/auth/verify-2fa
   POST /api/auth/2fa/setup
   POST /api/auth/2fa/enable
   POST /api/auth/2fa/disable
   ═══════════════════════════════════════════ */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { getDB } = require('../database/init');
const { generateToken, auth } = require('../middleware/auth');
const { sendPasswordResetEmail, send2FAEnabledEmail } = require('../utils/email');

const router = express.Router();

// ── Helpers de validação ──
function sanitize(str) { return str ? String(str).trim().replace(/<[^>]*>/g, '') : ''; }
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function isValidCPF(c) { return /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(c); }

// ── Login de Usuário ──
router.post('/login', (req, res) => {
    try {
        const username = sanitize(req.body.username);
        const password = req.body.password;
        if (!username || !password) return res.status(400).json({ success: false, error: 'Preencha todos os campos' });

        const db = getDB();
        const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(username.toLowerCase());

        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ success: false, error: 'Usuário ou senha inválidos' });
        }
        if (!user.active) return res.status(403).json({ success: false, error: 'Conta desativada. Entre em contato com o suporte.' });

        // Verificar se 2FA está habilitado
        if (user.totp_enabled) {
            // Gerar token temporário para etapa 2FA
            const tempToken = crypto.randomBytes(32).toString('hex');
            db.prepare("UPDATE users SET totp_temp_token = ?, totp_temp_expires = datetime('now', '+5 minutes') WHERE id = ?")
                .run(tempToken, user.id);
            return res.json({ 
                success: true, 
                requires2FA: true, 
                tempToken,
                message: 'Informe o código do autenticador'
            });
        }

        // Atualizar último login
        db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

        const token = generateToken({ id: user.id, role: 'user', username: user.username });
        const referrals = db.prepare('SELECT id FROM users WHERE sponsor_id = ?').all(user.id).map(r => r.id);
        const { password: _, totp_secret: _s, totp_temp_token: _t, ...safeUser } = user;
        safeUser.referrals = referrals;
        safeUser.role = 'user';

        res.json({ success: true, token, user: safeUser });
    } catch (err) {
        console.error('Erro login:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ── Verificar 2FA (segunda etapa do login) ──
router.post('/verify-2fa', (req, res) => {
    try {
        const tempToken = sanitize(req.body.tempToken);
        const totpCode = sanitize(req.body.code);
        if (!tempToken || !totpCode) return res.status(400).json({ success: false, error: 'Preencha todos os campos' });

        const db = getDB();
        const user = db.prepare("SELECT * FROM users WHERE totp_temp_token = ? AND totp_temp_expires > datetime('now')").get(tempToken);

        if (!user) return res.status(401).json({ success: false, error: 'Sessão expirada. Faça login novamente.' });

        const verified = speakeasy.totp.verify({
            secret: user.totp_secret,
            encoding: 'base32',
            token: totpCode,
            window: 1
        });

        if (!verified) return res.status(401).json({ success: false, error: 'Código 2FA inválido' });

        // Limpar token temporário e atualizar último login
        db.prepare("UPDATE users SET totp_temp_token = NULL, totp_temp_expires = NULL, last_login = datetime('now') WHERE id = ?")
            .run(user.id);

        const token = generateToken({ id: user.id, role: 'user', username: user.username });
        const referrals = db.prepare('SELECT id FROM users WHERE sponsor_id = ?').all(user.id).map(r => r.id);
        const { password: _, totp_secret: _s, totp_temp_token: _t, ...safeUser } = user;
        safeUser.referrals = referrals;
        safeUser.role = 'user';

        res.json({ success: true, token, user: safeUser });
    } catch (err) {
        console.error('Erro verify-2fa:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ── Login de Admin ──
router.post('/admin-login', (req, res) => {
    try {
        const username = sanitize(req.body.username);
        const password = req.body.password;
        if (!username || !password) return res.status(400).json({ success: false, error: 'Preencha todos os campos' });

        const db = getDB();
        const admin = db.prepare('SELECT * FROM admins WHERE LOWER(username) = ?').get(username.toLowerCase());

        if (!admin || !bcrypt.compareSync(password, admin.password)) {
            return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        }

        const token = generateToken({ id: admin.id, role: 'admin', username: admin.username });
        const { password: _, ...safeAdmin } = admin;

        res.json({ success: true, token, admin: safeAdmin });
    } catch (err) {
        console.error('Erro admin login:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ── Registro ──
router.post('/register', (req, res) => {
    try {
        const username = sanitize(req.body.username);
        const password = req.body.password;
        const name = sanitize(req.body.name);
        const email = sanitize(req.body.email);
        const cpf = sanitize(req.body.cpf);
        const phone = sanitize(req.body.phone);
        const sponsor = sanitize(req.body.sponsor);

        if (!username || !password || !name || !email) {
            return res.status(400).json({ success: false, error: 'Preencha os campos obrigatórios' });
        }
        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ success: false, error: 'Usuário deve ter entre 3 e 30 caracteres' });
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
            return res.status(400).json({ success: false, error: 'Usuário só pode conter letras, números, ponto, hífen e underline' });
        }
        if (password.length < 6 || password.length > 100) {
            return res.status(400).json({ success: false, error: 'A senha deve ter entre 6 e 100 caracteres' });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, error: 'E-mail inválido' });
        }
        if (cpf && !isValidCPF(cpf)) {
            return res.status(400).json({ success: false, error: 'CPF inválido' });
        }

        const db = getDB();

        if (db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username.toLowerCase())) {
            return res.status(409).json({ success: false, error: 'Nome de usuário já existe.' });
        }
        if (db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email.toLowerCase())) {
            return res.status(409).json({ success: false, error: 'E-mail já cadastrado.' });
        }
        if (cpf && db.prepare('SELECT id FROM users WHERE cpf = ?').get(cpf)) {
            return res.status(409).json({ success: false, error: 'CPF já cadastrado.' });
        }

        let sponsorId = null;
        if (sponsor) {
            const sp = db.prepare('SELECT id FROM users WHERE LOWER(username) = ? OR id = ?')
                .get(sponsor.toLowerCase(), isNaN(sponsor) ? -1 : Number(sponsor));
            if (!sp) return res.status(404).json({ success: false, error: 'Patrocinador não encontrado.' });
            sponsorId = sp.id;
        }

        const hashedPassword = bcrypt.hashSync(password, 12);

        const result = db.prepare(`
            INSERT INTO users (username, password, name, email, phone, cpf, sponsor_id, plan, level, points, bonus, balance, active, role, lgpd_consent, lgpd_consent_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'basico', 'prata', 0, 0, 0, 1, 'user', 1, datetime('now'), date('now'))
        `).run(username.toLowerCase(), hashedPassword, name, email.toLowerCase(), phone || '', cpf || '', sponsorId);

        res.status(201).json({ success: true, userId: result.lastInsertRowid });
    } catch (err) {
        console.error('Erro registro:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ── Recuperar Senha (envia email com token) ──
router.post('/forgot-password', async (req, res) => {
    try {
        const username = sanitize(req.body.username);
        const email = sanitize(req.body.email);
        if (!username || !email) return res.status(400).json({ success: false, error: 'Preencha todos os campos' });

        const db = getDB();
        const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ? AND LOWER(email) = ?')
            .get(username.toLowerCase(), email.toLowerCase());

        // Sempre retorna sucesso (não revela se conta existe)
        if (!user) {
            return res.json({ success: true, message: 'Se os dados estiverem corretos, você receberá um email com instruções.' });
        }

        // Invalidar tokens anteriores
        db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

        // Gerar token seguro
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

        db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
            .run(user.id, token, expiresAt);

        // Enviar email
        await sendPasswordResetEmail(user.email, user.name, token);

        res.json({ 
            success: true, 
            message: 'Se os dados estiverem corretos, você receberá um email com instruções.'
        });
    } catch (err) {
        console.error('Erro forgot-password:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ── Redefinir Senha (via token do email) ──
router.post('/reset-password', (req, res) => {
    try {
        const token = sanitize(req.body.token);
        const newPassword = req.body.newPassword;
        if (!token || !newPassword) return res.status(400).json({ success: false, error: 'Preencha todos os campos' });
        if (newPassword.length < 6 || newPassword.length > 100) {
            return res.status(400).json({ success: false, error: 'A senha deve ter entre 6 e 100 caracteres' });
        }

        const db = getDB();
        const resetToken = db.prepare(
            "SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')"
        ).get(token);

        if (!resetToken) {
            return res.status(400).json({ success: false, error: 'Link inválido ou expirado. Solicite um novo.' });
        }

        // Atualizar senha
        const hashed = bcrypt.hashSync(newPassword, 12);
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, resetToken.user_id);

        // Marcar token como usado
        db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(resetToken.id);

        res.json({ success: true, message: 'Senha redefinida com sucesso! Faça login com a nova senha.' });
    } catch (err) {
        console.error('Erro reset-password:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ── Alterar Senha ──
router.post('/change-password', auth, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: 'Preencha todos os campos' });
        if (newPassword.length < 6 || newPassword.length > 100) {
            return res.status(400).json({ success: false, error: 'A nova senha deve ter entre 6 e 100 caracteres' });
        }

        const db = getDB();
        const table = req.user.role === 'admin' ? 'admins' : 'users';
        const user = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        if (!bcrypt.compareSync(currentPassword, user.password)) {
            return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
        }

        const hashed = bcrypt.hashSync(newPassword, 12);
        db.prepare(`UPDATE ${table} SET password = ? WHERE id = ?`).run(hashed, req.user.id);

        res.json({ success: true });
    } catch (err) {
        console.error('Erro change-password:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ══════════════════════════════════════════
//   2FA — Autenticação em Dois Fatores
// ══════════════════════════════════════════

// ── Gerar QR Code para configurar 2FA ──
router.post('/2fa/setup', auth, async (req, res) => {
    try {
        const db = getDB();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

        if (user.totp_enabled) {
            return res.status(400).json({ success: false, error: '2FA já está ativado na sua conta' });
        }

        // Gerar secret
        const secret = speakeasy.generateSecret({
            name: `MI2 (${user.username})`,
            issuer: 'MI2',
            length: 20
        });

        // Salvar secret temporariamente (ainda não habilitado)
        db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret.base32, user.id);

        // Gerar QR Code como Data URL
        const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

        res.json({
            success: true,
            secret: secret.base32,
            qrCode: qrDataUrl
        });
    } catch (err) {
        console.error('Erro 2fa/setup:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ── Ativar 2FA (verifica código e habilita) ──
router.post('/2fa/enable', auth, async (req, res) => {
    try {
        const code = sanitize(req.body.code);
        if (!code) return res.status(400).json({ success: false, error: 'Informe o código do autenticador' });

        const db = getDB();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        if (!user.totp_secret) return res.status(400).json({ success: false, error: 'Execute o setup primeiro' });
        if (user.totp_enabled) return res.status(400).json({ success: false, error: '2FA já está ativado' });

        const verified = speakeasy.totp.verify({
            secret: user.totp_secret,
            encoding: 'base32',
            token: code,
            window: 1
        });

        if (!verified) return res.status(401).json({ success: false, error: 'Código inválido. Tente novamente.' });

        db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);

        // Enviar email de confirmação
        await send2FAEnabledEmail(user.email, user.name);

        res.json({ success: true, message: '2FA ativado com sucesso!' });
    } catch (err) {
        console.error('Erro 2fa/enable:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ── Desativar 2FA ──
router.post('/2fa/disable', auth, (req, res) => {
    try {
        const password = req.body.password;
        if (!password) return res.status(400).json({ success: false, error: 'Informe sua senha para desativar o 2FA' });

        const db = getDB();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ success: false, error: 'Senha incorreta' });
        }

        db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(user.id);

        res.json({ success: true, message: '2FA desativado com sucesso' });
    } catch (err) {
        console.error('Erro 2fa/disable:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ── Status do 2FA ──
router.get('/2fa/status', auth, (req, res) => {
    try {
        const db = getDB();
        const user = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

        res.json({ success: true, enabled: !!user.totp_enabled });
    } catch (err) {
        console.error('Erro 2fa/status:', err.message);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

module.exports = router;
