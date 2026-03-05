/* ═══════════════════════════════════════════
   MI2 — User & Network Routes
   GET  /api/users/me
   PUT  /api/users/me
   GET  /api/users/network
   GET  /api/users/network/tree
   GET  /api/users/dashboard
   ═══════════════════════════════════════════ */

const express = require('express');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');

const router = express.Router();

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
    const { name, email, phone, avatar } = req.body;
    const db = getDB();

    // Check email uniqueness
    if (email) {
        const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?')
            .get(email.toLowerCase().trim(), req.user.id);
        if (existing) return res.json({ success: false, error: 'E-mail já está em uso' });
    }

    db.prepare('UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), avatar = COALESCE(?, avatar) WHERE id = ?')
        .run(name || null, email || null, phone || null, avatar || null, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, user: safeUser(db, updated) });
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

module.exports = router;
