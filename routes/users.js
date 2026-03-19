/* ═══════════════════════════════════════════
   Credbusiness — User & Network Routes
   GET  /api/users/me
   PUT  /api/users/me
   GET  /api/users/network
   GET  /api/users/network/tree
   GET  /api/users/dashboard
   ═══════════════════════════════════════════ */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

const router = express.Router();

// Multer for user document uploads
const docStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads', 'user-docs', String(req.user.id));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
    }
});
const uploadDoc = multer({
    storage: docStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

// Helper: user sem password + com referrals
function safeUser(db, user) {
    if (!user) return null;
    const referrals = db.prepare('SELECT id FROM users WHERE sponsor_id = ?').all(user.id).map(r => r.id);
    const { password, ...u } = user;
    u.referrals = referrals;
    u.active = !!u.active;
    return u;
}

// ── Meu Perfil ──
router.get('/me', auth, (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(safeUser(db, user));
});

// ── Atualizar Perfil ──
router.put('/me', auth, (req, res) => {
    const { name, email, phone, avatar, nickname, birth_date, gender, bio, cpf, person_type, cnpj, company_name } = req.body;
    const db = getDB();

    // Check email uniqueness
    if (email) {
        const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?')
            .get(email.toLowerCase().trim(), req.user.id);
        if (existing) return res.json({ success: false, error: 'E-mail já está em uso' });
    }

    const sanitize = (s, max = 200) => s ? String(s).trim().replace(/<[^>]*>/g, '').slice(0, max) : null;

    db.prepare(`UPDATE users SET 
        name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), avatar = COALESCE(?, avatar),
        nickname = COALESCE(?, nickname), birth_date = COALESCE(?, birth_date), gender = COALESCE(?, gender),
        bio = COALESCE(?, bio), cpf = COALESCE(?, cpf), person_type = COALESCE(?, person_type),
        cnpj = COALESCE(?, cnpj), company_name = COALESCE(?, company_name)
        WHERE id = ?`)
        .run(
            sanitize(name), sanitize(email), sanitize(phone), sanitize(avatar, 500),
            sanitize(nickname, 50), sanitize(birth_date, 10), sanitize(gender, 20),
            sanitize(bio, 500), sanitize(cpf, 18), sanitize(person_type, 2),
            sanitize(cnpj, 20), sanitize(company_name),
            req.user.id
        );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, user: safeUser(db, updated) });
});

// ── Upload Avatar ──
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads', 'avatars');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `avatar-${req.user.id}-${Date.now()}${ext}`);
    }
});
const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

router.post('/avatar', auth, uploadAvatar.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem válida (JPG, PNG ou WebP, até 2MB)' });
    const db = getDB();
    const avatarPath = `uploads/avatars/${req.file.filename}`;
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarPath, req.user.id);
    res.json({ success: true, avatar: avatarPath });
});

// ── Minha Rede — Indicados Diretos ──
router.get('/network', auth, (req, res) => {
    const db = getDB();
    const directs = db.prepare('SELECT * FROM users WHERE sponsor_id = ?').all(req.user.id);

    // Get full team (recursive)
    function getTeam(uid) {
        const children = db.prepare('SELECT * FROM users WHERE sponsor_id = ?').all(uid);
        let team = [];
        for (const c of children) {
            team.push(safeUser(db, c));
            team = team.concat(getTeam(c.id));
        }
        return team;
    }

    res.json({
        directs: directs.map(u => safeUser(db, u)),
        team: getTeam(req.user.id)
    });
});

// ── Árvore de Rede ──
router.get('/network/tree', auth, (req, res) => {
    const db = getDB();

    function buildTree(uid) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
        if (!user) return null;
        const children = db.prepare('SELECT * FROM users WHERE sponsor_id = ?').all(uid);
        const safe = safeUser(db, user);
        safe.children = children.map(c => buildTree(c.id)).filter(Boolean);
        return safe;
    }

    res.json(buildTree(req.user.id));
});

// ── Dashboard Stats ──
router.get('/dashboard', auth, (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const directs = db.prepare('SELECT COUNT(*) as c FROM users WHERE sponsor_id = ?').get(req.user.id);

    // Team count (recursive)
    function countTeam(uid) {
        const children = db.prepare('SELECT id FROM users WHERE sponsor_id = ?').all(uid);
        let count = children.length;
        for (const c of children) count += countTeam(c.id);
        return count;
    }

    const levels = {};
    db.prepare('SELECT * FROM levels').all().forEach(l => {
        levels[l.key] = { name: l.name, minPoints: l.min_points, color: l.color, icon: l.icon, bonus: l.bonus_percent, comission: l.commission_percent };
    });

    const currentLevel = levels[user.level] || levels.prata;
    const levelKeys = Object.keys(levels);
    const currentIdx = levelKeys.indexOf(user.level);
    const nextLevelKey = currentIdx < levelKeys.length - 1 ? levelKeys[currentIdx + 1] : null;
    const nextLevel = nextLevelKey ? levels[nextLevelKey] : null;

    res.json({
        indicados: directs.c,
        equipe: countTeam(req.user.id),
        bonus: user.bonus,
        saldo: user.balance,
        points: user.points,
        level: currentLevel,
        levelKey: user.level,
        nextLevel,
        nextLevelKey,
        progressToNext: nextLevel ? Math.min(100, (user.points / nextLevel.minPoints) * 100) : 100
    });
});

// ── User Preferences (notification prefs etc) ──
router.get('/preferences', auth, (req, res) => {
    const db = getDB();
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS user_preferences (
            user_id INTEGER NOT NULL,
            pref_key TEXT NOT NULL,
            pref_value TEXT,
            PRIMARY KEY (user_id, pref_key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
        const rows = db.prepare('SELECT pref_key, pref_value FROM user_preferences WHERE user_id = ?').all(req.user.id);
        const prefs = {};
        rows.forEach(r => { try { prefs[r.pref_key] = JSON.parse(r.pref_value); } catch { prefs[r.pref_key] = r.pref_value; }});
        res.json(prefs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/preferences', auth, (req, res) => {
    const db = getDB();
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS user_preferences (
            user_id INTEGER NOT NULL,
            pref_key TEXT NOT NULL,
            pref_value TEXT,
            PRIMARY KEY (user_id, pref_key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
        const upsert = db.prepare('INSERT INTO user_preferences (user_id, pref_key, pref_value) VALUES (?, ?, ?) ON CONFLICT(user_id, pref_key) DO UPDATE SET pref_value = excluded.pref_value');
        const tx = db.transaction(() => {
            for (const [key, value] of Object.entries(req.body)) {
                upsert.run(req.user.id, key, JSON.stringify(value));
            }
        });
        tx();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════
//   ADDRESS
// ════════════════════════════════════

router.get('/address', auth, (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, address_country FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(user);
});

router.put('/address', auth, (req, res) => {
    const db = getDB();
    const fields = ['address_street', 'address_number', 'address_complement', 'address_neighborhood', 'address_city', 'address_state', 'address_zip', 'address_country'];
    const sanitize = (s) => s ? String(s).trim().replace(/<[^>]*>/g, '').slice(0, 200) : '';
    const updates = {};
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = sanitize(req.body[f]); });

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values);
    res.json({ success: true, message: 'Endereço atualizado com sucesso' });
});

// ════════════════════════════════════
//   USER DOCUMENTS (KYC)
// ════════════════════════════════════

router.get('/documents', auth, (req, res) => {
    const db = getDB();
    const docs = db.prepare('SELECT * FROM user_documents WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(docs);
});

router.post('/documents', auth, uploadDoc.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Arquivo é obrigatório' });
    const type = (['rg', 'cpf', 'cnh', 'comprovante_residencia', 'selfie', 'outro'].includes(req.body.type)) ? req.body.type : 'outro';

    const db = getDB();
    const result = db.prepare('INSERT INTO user_documents (user_id, type, filename, original_name, mimetype, size) VALUES (?, ?, ?, ?, ?, ?)')
        .run(req.user.id, type, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size);

    res.json({ success: true, id: result.lastInsertRowid, message: 'Documento enviado com sucesso' });
});

router.delete('/documents/:id', auth, (req, res) => {
    const db = getDB();
    const doc = db.prepare('SELECT * FROM user_documents WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });

    // Delete file
    const filePath = path.join(__dirname, '..', 'uploads', 'user-docs', String(req.user.id), doc.filename);
    try { fs.unlinkSync(filePath); } catch {}

    db.prepare('DELETE FROM user_documents WHERE id = ?').run(doc.id);
    res.json({ success: true, message: 'Documento removido' });
});

// ════════════════════════════════════
//   CONTRACTS
// ════════════════════════════════════

router.get('/contracts', auth, (req, res) => {
    const db = getDB();
    const contracts = db.prepare('SELECT c.*, uc.accepted, uc.accepted_at FROM contracts c LEFT JOIN user_contracts uc ON uc.contract_id = c.id AND uc.user_id = ? WHERE c.active = 1 ORDER BY c.created_at DESC').all(req.user.id);
    res.json(contracts);
});

router.get('/contracts/:id', auth, (req, res) => {
    const db = getDB();
    const contract = db.prepare('SELECT c.*, uc.accepted, uc.accepted_at FROM contracts c LEFT JOIN user_contracts uc ON uc.contract_id = c.id AND uc.user_id = ? WHERE c.id = ?').get(req.user.id, req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });
    res.json(contract);
});

router.post('/contracts/:id/accept', auth, (req, res) => {
    const db = getDB();
    const contract = db.prepare('SELECT id FROM contracts WHERE id = ? AND active = 1').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    db.prepare('INSERT INTO user_contracts (user_id, contract_id, accepted, accepted_at, ip) VALUES (?, ?, 1, datetime(\'now\'), ?) ON CONFLICT(user_id, contract_id) DO UPDATE SET accepted = 1, accepted_at = datetime(\'now\'), ip = ?')
        .run(req.user.id, contract.id, ip, ip);

    res.json({ success: true, message: 'Contrato aceito com sucesso' });
});

router.post('/contracts/:id/send', auth, async (req, res) => {
    const db = getDB();
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });
    const contract = db.prepare('SELECT id, title FROM contracts WHERE id = ? AND active = 1').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });

    const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const contractTitle = esc(contract.title);
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);
    const senderName = esc(user?.name || 'Consultor Credbusiness');

    // Generate link server-side using configured domain
    const domain = process.env.DOMAIN || req.get('host') || 'localhost:3001';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const link = `${protocol}://${domain}/contrato.html?id=${contract.id}`;

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#6366f1">Credbusiness</h2>
            <p>Olá!</p>
            <p><strong>${senderName}</strong> compartilhou o contrato "<strong>${contractTitle}</strong>" com você.</p>
            <p>Clique no botão abaixo para visualizar o documento:</p>
            <p style="text-align:center;margin:32px 0">
                <a href="${link}" style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Visualizar Contrato</a>
            </p>
            <p style="font-size:12px;color:#94a3b8;margin-top:32px">Este e-mail foi enviado pela plataforma Credbusiness.</p>
        </div>
    `;

    try {
        const sent = await sendEmail(email, `Credbusiness — ${contract.title}`, html);
        if (!sent) {
            console.error('Falha ao enviar contrato por email para:', email);
            return res.status(500).json({ error: 'Falha ao enviar e-mail. Verifique a configuração SMTP.' });
        }
        res.json({ success: true, message: 'Contrato enviado por e-mail!' });
    } catch (err) {
        console.error('Erro ao enviar contrato por email:', err.message);
        res.status(500).json({ error: 'Erro ao enviar e-mail. Tente novamente.' });
    }
});

router.get('/contracts/:id/acceptances', auth, (req, res) => {
    const db = getDB();
    const contract = db.prepare('SELECT id FROM contracts WHERE id = ? AND active = 1').get(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });
    const acceptances = db.prepare('SELECT id, client_name, client_cpf, client_email, accepted_at FROM contract_acceptances WHERE contract_id = ? ORDER BY accepted_at DESC').all(req.params.id);
    res.json(acceptances);
});

// ════════════════════════════════════
//   SUBSCRIPTIONS
// ════════════════════════════════════

router.get('/subscriptions', auth, (req, res) => {
    const db = getDB();
    const subs = db.prepare('SELECT s.*, p.name as plan_name, p.price as plan_price, p.features as plan_features FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ? ORDER BY s.created_at DESC').all(req.user.id);
    subs.forEach(s => { try { s.plan_features = JSON.parse(s.plan_features); } catch { s.plan_features = []; } });
    res.json(subs);
});

router.get('/subscriptions/:id', auth, (req, res) => {
    const db = getDB();
    const sub = db.prepare('SELECT s.*, p.name as plan_name, p.price as plan_price, p.features as plan_features FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.id = ? AND s.user_id = ?').get(req.params.id, req.user.id);
    if (!sub) return res.status(404).json({ error: 'Assinatura não encontrada' });
    try { sub.plan_features = JSON.parse(sub.plan_features); } catch { sub.plan_features = []; }
    res.json(sub);
});

// ════════════════════════════════════
//   REFERRAL / INDICAÇÃO REPORT
// ════════════════════════════════════

router.get('/referral-report', auth, (req, res) => {
    const db = getDB();

    const directs = db.prepare('SELECT id, name, username, email, phone, level, points, active, created_at FROM users WHERE sponsor_id = ? ORDER BY created_at DESC').all(req.user.id);

    // Commissions from referral
    const commissions = db.prepare("SELECT c.*, u.name as from_name, u.username as from_username FROM commissions c JOIN users u ON u.id = c.from_user_id WHERE c.to_user_id = ? ORDER BY c.date DESC LIMIT 50").all(req.user.id);

    const totalCommissions = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM commissions WHERE to_user_id = ?").get(req.user.id);

    // Monthly stats
    const monthlyStats = db.prepare(`
        SELECT strftime('%Y-%m', date) as month, SUM(amount) as total, COUNT(*) as count
        FROM commissions WHERE to_user_id = ?
        GROUP BY strftime('%Y-%m', date) ORDER BY month DESC LIMIT 12
    `).all(req.user.id);

    res.json({
        directs,
        commissions,
        totalCommissions: totalCommissions.total,
        monthlyStats,
        totalDirects: directs.length,
        activeDirects: directs.filter(d => d.active).length
    });
});

// ════════════════════════════════════
//   LIMPA NOME DASHBOARD
// ════════════════════════════════════

router.get('/limpanome-dashboard', auth, (req, res) => {
    const db = getDB();

    const total = db.prepare('SELECT COUNT(*) as c FROM processes WHERE user_id = ?').get(req.user.id);
    const pendentes = db.prepare("SELECT COUNT(*) as c FROM processes WHERE user_id = ? AND status = 'pendente'").get(req.user.id);
    const emAndamento = db.prepare("SELECT COUNT(*) as c FROM processes WHERE user_id = ? AND status = 'em_andamento'").get(req.user.id);
    const concluidos = db.prepare("SELECT COUNT(*) as c FROM processes WHERE user_id = ? AND status = 'concluido'").get(req.user.id);
    const rejeitados = db.prepare("SELECT COUNT(*) as c FROM processes WHERE user_id = ? AND status = 'rejeitado'").get(req.user.id);

    const totalValue = db.prepare('SELECT COALESCE(SUM(value), 0) as total FROM processes WHERE user_id = ?').get(req.user.id);
    const cleanedValue = db.prepare("SELECT COALESCE(SUM(value), 0) as total FROM processes WHERE user_id = ? AND status = 'concluido'").get(req.user.id);

    const recent = db.prepare('SELECT * FROM processes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5').all(req.user.id);

    res.json({
        total: total.c,
        pendentes: pendentes.c,
        emAndamento: emAndamento.c,
        concluidos: concluidos.c,
        rejeitados: rejeitados.c,
        totalValue: totalValue.total,
        cleanedValue: cleanedValue.total,
        recent
    });
});

module.exports = router;
