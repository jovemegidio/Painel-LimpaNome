/* ═══════════════════════════════════════════
   Credbusiness — Sync Route
   GET /api/sync — Retorna todos os dados necessários para o cache do frontend
   ═══════════════════════════════════════════ */

const express = require('express');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Helper: user seguro (sem password, com referrals)
function safeUser(db, user) {
    if (!user) return null;
    const referrals = db.prepare('SELECT id FROM users WHERE sponsor_id = ?').all(user.id).map(r => r.id);
    const { password, ...u } = user;
    u.referrals = referrals;
    u.active = !!u.active;
    return u;
}

router.get('/', auth, (req, res) => {
    const db = getDB();

    // ── Dados públicos (todos veem) ──
    const levels = {};
    db.prepare('SELECT * FROM levels').all().forEach(l => {
        levels[l.key] = { name: l.name, minPoints: l.min_points, color: l.color, icon: l.icon, bonus: l.bonus_percent, comission: l.commission_percent };
    });

    const plans = db.prepare('SELECT * FROM plans').all();
    plans.forEach(p => { try { p.features = JSON.parse(p.features); } catch {} });

    const packages = db.prepare('SELECT * FROM packages WHERE active = 1').all();
    const news = db.prepare('SELECT * FROM news ORDER BY date DESC').all();
    const events = db.prepare('SELECT * FROM events ORDER BY date DESC').all();

    const settingsRows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    settingsRows.forEach(s => {
        settings[s.key] = s.value === 'true' ? true : s.value === 'false' ? false : s.value;
    });

    // ── Admin: retorna TUDO ──
    if (req.user.role === 'admin') {
        const admins = db.prepare('SELECT * FROM admins').all().map(a => {
            const { password, ...safe } = a;
            return safe;
        });

        const allUsers = db.prepare('SELECT * FROM users ORDER BY id ASC').all().map(u => safeUser(db, u));

        const allProcesses = db.prepare('SELECT * FROM processes ORDER BY created_at DESC').all();

        const allTransactions = db.prepare('SELECT * FROM transactions ORDER BY date DESC').all();

        const allTickets = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all();
        allTickets.forEach(t => {
            t.responses = db.prepare('SELECT * FROM ticket_responses WHERE ticket_id = ? ORDER BY date ASC').all(t.id);
        });

        return res.json({
            role: 'admin',
            admins,
            users: allUsers,
            levels,
            plans,
            packages,
            limpanome_processes: allProcesses,
            transactions: allTransactions,
            news,
            events,
            tickets: allTickets,
            settings,
            notifications: [],
            customPages: db.prepare('SELECT * FROM custom_pages ORDER BY sort_order ASC, id ASC').all()
        });
    }

    // ── Usuário: dados pessoais + rede ──
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Collect network users (directs + team recursively)
    const networkUsers = new Map();
    networkUsers.set(user.id, safeUser(db, user));

    function collectNetwork(uid) {
        const children = db.prepare('SELECT * FROM users WHERE sponsor_id = ?').all(uid);
        for (const child of children) {
            if (!networkUsers.has(child.id)) {
                networkUsers.set(child.id, safeUser(db, child));
                collectNetwork(child.id);
            }
        }
    }
    collectNetwork(user.id);

    // Also add sponsor chain (upline)
    let currentSponsor = user.sponsor_id;
    while (currentSponsor) {
        const sp = db.prepare('SELECT * FROM users WHERE id = ?').get(currentSponsor);
        if (sp && !networkUsers.has(sp.id)) {
            networkUsers.set(sp.id, safeUser(db, sp));
        }
        currentSponsor = sp ? sp.sponsor_id : null;
    }

    const users = Array.from(networkUsers.values());

    const processes = db.prepare('SELECT * FROM processes WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
    const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC').all(user.id);
    const tickets = db.prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
    tickets.forEach(t => {
        t.responses = db.prepare('SELECT * FROM ticket_responses WHERE ticket_id = ? ORDER BY date ASC').all(t.id);
    });

    // Notifications (unread + recent)
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(user.id);
    const unreadNotifications = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0').get(user.id).c;

    // Custom pages (visible only)
    const customPages = db.prepare('SELECT id,slug,title,icon,section,sort_order FROM custom_pages WHERE visible = 1 ORDER BY sort_order ASC, id ASC').all();

    res.json({
        role: 'user',
        currentUserId: user.id,
        users,
        levels,
        plans,
        packages,
        limpanome_processes: processes,
        transactions,
        news,
        events,
        tickets,
        settings,
        notifications,
        unreadNotifications,
        customPages
    });
});

module.exports = router;
