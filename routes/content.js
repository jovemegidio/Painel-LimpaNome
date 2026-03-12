/* ═══════════════════════════════════════════
   Credbusiness — Content Routes (News, Events, Packages, Plans, Settings)
   ═══════════════════════════════════════════ */

const express = require('express');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');
const { processNetworkCommissions, checkAutoGraduation } = require('./payments');

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

// ── Packages (filtrados pelo nível do usuário) ──
router.get('/packages', auth, (req, res) => {
    try {
        const db = getDB();
        const user = db.prepare('SELECT level FROM users WHERE id = ?').get(req.user.id);
        const userLevel = user ? user.level : 'start';
        const packages = db.prepare('SELECT * FROM packages WHERE active = 1 AND level_key = ? ORDER BY names_count ASC').all(userLevel);
        // Calcular preço por nome para opção personalizada
        const pricePerName = packages.length > 0 ? Math.round((packages[0].price / (packages[0].names_count || 1)) * 100) / 100 : 250;
        res.json({ packages, pricePerName, level: userLevel });
    } catch (err) {
        console.error('Erro packages:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Custom Pages (public for logged users) ──
router.get('/custom-pages', auth, (req, res) => {
    try {
        const db = getDB();
        res.json(db.prepare('SELECT id,slug,title,icon,content,section,sort_order FROM custom_pages WHERE visible = 1 ORDER BY sort_order ASC, id ASC').all());
    } catch (err) {
        console.error('Erro custom-pages:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.get('/custom-pages/:slug', auth, (req, res) => {
    try {
        const db = getDB();
        const page = db.prepare('SELECT id,slug,title,icon,content,section FROM custom_pages WHERE slug = ? AND visible = 1').get(req.params.slug);
        if (!page) return res.status(404).json({ error: 'Página não encontrada' });
        res.json(page);
    } catch (err) {
        console.error('Erro custom-page:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Hierarquia de níveis (decadência: Diamante → Start) ──
const LEVEL_ORDER = { start: 1, bronze: 2, prata: 3, ouro: 4, diamante: 5 };

// ── Comprar Pacote (comissão fixa R$30 por indicação) ──
router.post('/packages/:id/buy', auth, (req, res) => {
    try {
        const db = getDB();
        const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND active = 1').get(req.params.id);
        if (!pkg) return res.status(404).json({ error: 'Pacote não encontrado' });

        // ── Transação atômica ──
        const buyPackage = db.transaction(() => {
            const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

            // Validar cascata de nível: patrocinador deve ter nível superior ao do pacote
            if (user.sponsor_id && pkg.level_key) {
                const sponsor = db.prepare('SELECT level FROM users WHERE id = ?').get(user.sponsor_id);
                if (sponsor) {
                    const sponsorRank = LEVEL_ORDER[sponsor.level] || 0;
                    const packageRank = LEVEL_ORDER[pkg.level_key] || 0;
                    if (sponsorRank > 0 && packageRank >= sponsorRank) {
                        throw new Error('LEVEL_CASCADE');
                    }
                }
            }

            // Verificar saldo
            if (user.balance < pkg.price) {
                throw new Error('INSUFFICIENT_BALANCE');
            }

            // 1. Registrar compra
            const purchase = db.prepare(`INSERT INTO user_packages (user_id, package_id, purchased_at, status, payment_status) VALUES (?, ?, date('now'), 'ativo', 'confirmado')`)
                .run(req.user.id, pkg.id);

            // 2. Debitar saldo, adicionar pontos e créditos de nomes
            const namesCredit = pkg.names_count || 0;
            db.prepare('UPDATE users SET balance = balance - ?, points = points + ?, names_available = names_available + ? WHERE id = ?').run(pkg.price, pkg.points, namesCredit, req.user.id);

            // 3. Registrar transação de compra
            db.prepare(`INSERT INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status) VALUES (?, 'compra', ?, ?, 'package', ?, date('now'), 'concluido')`)
                .run(req.user.id, -pkg.price, `Compra: ${pkg.name}`, purchase.lastInsertRowid);

            // 4. Atualizar nível do usuário com base no pacote + ativar acesso
            if (pkg.level_key) {
                const newRank = LEVEL_ORDER[pkg.level_key] || 0;
                const currentRank = LEVEL_ORDER[user.level] || 0;
                if (newRank > currentRank) {
                    db.prepare('UPDATE users SET level = ? WHERE id = ?').run(pkg.level_key, req.user.id);
                }
            }
            db.prepare('UPDATE users SET has_package = 1 WHERE id = ?').run(req.user.id);

            return true;
        });

        try {
            buyPackage();

            // Processar comissões multi-nível e auto-graduação (fora da transação)
            processNetworkCommissions(db, req.user.id, pkg.price, `Venda pacote ${pkg.name}`);
            checkAutoGraduation(db, req.user.id);

            res.json({ success: true, message: 'Pacote adquirido com sucesso! Acesso ao painel liberado.' });
        } catch (txErr) {
            if (txErr.message === 'INSUFFICIENT_BALANCE') {
                return res.status(400).json({ success: false, error: 'Saldo insuficiente para comprar este pacote' });
            }
            if (txErr.message === 'LEVEL_CASCADE') {
                return res.status(400).json({ success: false, error: 'Seu patrocinador não possui nível superior ao deste pacote. Escolha um pacote de nível inferior.' });
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
            SELECT up.*, p.name, p.price, p.points, p.description, p.names_count
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

// ── Landing Page Content (público) ──
router.get('/landing', (req, res) => {
    try {
        const db = getDB();
        const row = db.prepare("SELECT value FROM settings WHERE key = 'landing_content'").get();
        if (row) {
            try { return res.json(JSON.parse(row.value)); } catch {}
        }
        res.json({});
    } catch (err) {
        console.error('Erro landing:', err.message);
        res.json({});
    }
});

module.exports = router;
