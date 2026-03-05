/* ═══════════════════════════════════════════
   MI2 — Content Routes (News, Events, Packages, Plans, Settings)
   ═══════════════════════════════════════════ */

const express = require('express');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── News ──
router.get('/news', auth, (req, res) => {
    try {
        const db = getDB();
        res.json(db.prepare('SELECT * FROM news ORDER BY date DESC').all());
    } catch (err) {
        console.error('Erro news:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Events ──
router.get('/events', auth, (req, res) => {
    try {
        const db = getDB();
        res.json(db.prepare('SELECT * FROM events ORDER BY date DESC').all());
    } catch (err) {
        console.error('Erro events:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Plans ──
router.get('/plans', auth, (req, res) => {
    try {
        const db = getDB();
        const plans = db.prepare('SELECT * FROM plans').all();
        plans.forEach(p => { try { p.features = JSON.parse(p.features); } catch {} });
        res.json(plans);
    } catch (err) {
        console.error('Erro plans:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Levels ──
router.get('/levels', auth, (req, res) => {
    try {
        const db = getDB();
        const rows = db.prepare('SELECT * FROM levels').all();
        const levels = {};
        rows.forEach(l => {
            levels[l.key] = { name: l.name, minPoints: l.min_points, color: l.color, icon: l.icon, bonus: l.bonus_percent, comission: l.commission_percent };
        });
        res.json(levels);
    } catch (err) {
        console.error('Erro levels:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Packages ──
router.get('/packages', auth, (req, res) => {
    try {
        const db = getDB();
        res.json(db.prepare('SELECT * FROM packages WHERE active = 1').all());
    } catch (err) {
        console.error('Erro packages:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Comprar Pacote (com comissão multi-nível ATÔMICA) ──
router.post('/packages/:id/buy', auth, (req, res) => {
    try {
        const db = getDB();
        const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND active = 1').get(req.params.id);
        if (!pkg) return res.status(404).json({ error: 'Pacote não encontrado' });

        // ── Transação atômica ──
        const buyPackage = db.transaction(() => {
            const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

            // Verificar se tem saldo suficiente
            if (user.balance < pkg.price) {
                throw new Error('INSUFFICIENT_BALANCE');
            }

            // 1. Registrar compra (status pendente até pagamento confirmado)
            const purchase = db.prepare(`INSERT INTO user_packages (user_id, package_id, purchased_at, status, payment_status) VALUES (?, ?, date('now'), 'ativo', 'confirmado')`)
                .run(req.user.id, pkg.id);

            // 2. Debitar saldo e adicionar pontos
            db.prepare('UPDATE users SET balance = balance - ?, points = points + ? WHERE id = ?').run(pkg.price, pkg.points, req.user.id);

            // 3. Registrar transação de compra
            db.prepare(`INSERT INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status) VALUES (?, 'compra', ?, ?, 'package', ?, date('now'), 'concluido')`)
                .run(req.user.id, -pkg.price, `Compra: ${pkg.name}`, purchase.lastInsertRowid);

            // 4. Check level upgrade
            const updatedUser = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
            const levels = db.prepare('SELECT * FROM levels ORDER BY min_points DESC').all();
            for (const level of levels) {
                if (updatedUser.points >= level.min_points) {
                    db.prepare('UPDATE users SET level = ? WHERE id = ?').run(level.key, req.user.id);
                    break;
                }
            }

            // 5. ═══ COMISSÃO MULTI-NÍVEL (3 níveis) ═══
            const settings = {};
            db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });

            const commissionRates = [
                Number(settings.commissionLevel1) || 10,
                Number(settings.commissionLevel2) || 5,
                Number(settings.commissionLevel3) || 3
            ];

            let currentUserId = user.id;
            for (let lvl = 0; lvl < commissionRates.length; lvl++) {
                const currentUser = db.prepare('SELECT sponsor_id FROM users WHERE id = ?').get(currentUserId);
                if (!currentUser || !currentUser.sponsor_id) break;

                const sponsorId = currentUser.sponsor_id;
                const sponsor = db.prepare('SELECT id, active FROM users WHERE id = ?').get(sponsorId);
                if (!sponsor || !sponsor.active) break;

                const rate = commissionRates[lvl];
                const bonusAmount = Math.round((pkg.price * rate / 100) * 100) / 100;

                if (bonusAmount > 0) {
                    // Creditar comissão
                    db.prepare('UPDATE users SET bonus = bonus + ?, balance = balance + ? WHERE id = ?')
                        .run(bonusAmount, bonusAmount, sponsorId);

                    // Registrar transação
                    db.prepare(`INSERT INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status) VALUES (?, 'comissao', ?, ?, 'package', ?, date('now'), 'creditado')`)
                        .run(sponsorId, bonusAmount, `Comissão Nível ${lvl + 1} - ${user.name} (${pkg.name})`, purchase.lastInsertRowid);

                    // Registrar na tabela de comissões
                    db.prepare(`INSERT INTO commissions (from_user_id, to_user_id, level, amount, source_type, source_id, date) VALUES (?, ?, ?, ?, 'package', ?, date('now'))`)
                        .run(user.id, sponsorId, lvl + 1, bonusAmount, purchase.lastInsertRowid);
                }

                // Subir para o próximo nível da rede
                currentUserId = sponsorId;
            }

            return true;
        });

        try {
            buyPackage();
            res.json({ success: true, message: 'Pacote adquirido com sucesso!' });
        } catch (txErr) {
            if (txErr.message === 'INSUFFICIENT_BALANCE') {
                return res.status(400).json({ success: false, error: 'Saldo insuficiente para comprar este pacote' });
            }
            throw txErr;
        }
    } catch (err) {
        console.error('Erro comprar pacote:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Meus Pacotes ──
router.get('/my-packages', auth, (req, res) => {
    try {
        const db = getDB();
        const packages = db.prepare(`
            SELECT up.*, p.name, p.price, p.points, p.description
            FROM user_packages up JOIN packages p ON up.package_id = p.id
            WHERE up.user_id = ? ORDER BY up.purchased_at DESC
        `).all(req.user.id);
        res.json(packages);
    } catch (err) {
        console.error('Erro meus pacotes:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Minhas Comissões ──
router.get('/commissions', auth, (req, res) => {
    try {
        const db = getDB();
        const commissions = db.prepare(`
            SELECT c.*, u.name as from_name, u.username as from_username
            FROM commissions c JOIN users u ON c.from_user_id = u.id
            WHERE c.to_user_id = ? ORDER BY c.date DESC LIMIT 100
        `).all(req.user.id);
        res.json(commissions);
    } catch (err) {
        console.error('Erro comissões:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Upgrade de Plano ──
router.post('/plans/:id/upgrade', auth, (req, res) => {
    try {
        const db = getDB();
        const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
        if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (user.plan === plan.id) return res.status(400).json({ error: 'Você já está neste plano' });

        // Verificar se é upgrade (preço maior)
        const currentPlan = db.prepare('SELECT * FROM plans WHERE id = ?').get(user.plan);
        if (currentPlan && plan.price <= currentPlan.price) {
            return res.status(400).json({ error: 'Só é possível fazer upgrade para um plano superior' });
        }

        const upgradeCost = currentPlan ? plan.price - currentPlan.price : plan.price;

        const doUpgrade = db.transaction(() => {
            const freshUser = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
            if (freshUser.balance < upgradeCost) throw new Error('INSUFFICIENT_BALANCE');

            db.prepare('UPDATE users SET plan = ?, balance = balance - ? WHERE id = ?').run(plan.id, upgradeCost, req.user.id);
            db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status) VALUES (?, 'upgrade', ?, ?, date('now'), 'concluido')`)
                .run(req.user.id, -upgradeCost, `Upgrade para plano ${plan.name}`);
        });

        try {
            doUpgrade();
            res.json({ success: true, message: `Plano atualizado para ${plan.name}!` });
        } catch (txErr) {
            if (txErr.message === 'INSUFFICIENT_BALANCE') {
                return res.status(400).json({ success: false, error: 'Saldo insuficiente para o upgrade' });
            }
            throw txErr;
        }
    } catch (err) {
        console.error('Erro upgrade plano:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── FAQs ──
router.get('/faqs', auth, (req, res) => {
    try {
        const db = getDB();
        // Create faqs table if not exists
        db.exec(`CREATE TABLE IF NOT EXISTS faqs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            category TEXT DEFAULT 'conta',
            sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1
        )`);
        const faqs = db.prepare('SELECT * FROM faqs WHERE active = 1 ORDER BY sort_order, id').all();
        res.json(faqs.map(f => ({ q: f.question, a: f.answer, cat: f.category, id: f.id })));
    } catch (err) {
        console.error('Erro faqs:', err.message);
        res.json([]); // Return empty instead of error, frontend has fallback
    }
});

// ── Settings (público, mas filtrando dados sensíveis) ──
router.get('/settings', (req, res) => {
    try {
        const db = getDB();
        const settings = {};
        const publicKeys = ['siteName', 'siteTitle', 'logoText', 'faviconEmoji', 'primaryColor', 'accentColor', 'footerText', 'loginBg', 'maintenanceMode'];
        db.prepare('SELECT * FROM settings').all().forEach(s => {
            if (publicKeys.includes(s.key)) settings[s.key] = s.value;
        });
        if (settings.maintenanceMode) settings.maintenanceMode = settings.maintenanceMode === 'true';
        res.json(settings);
    } catch (err) {
        console.error('Erro settings:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Settings completo (autenticado) ──
router.get('/settings/all', auth, (req, res) => {
    try {
        const db = getDB();
        const settings = {};
        db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });
        if (settings.maintenanceMode) settings.maintenanceMode = settings.maintenanceMode === 'true';
        res.json(settings);
    } catch (err) {
        console.error('Erro settings all:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
