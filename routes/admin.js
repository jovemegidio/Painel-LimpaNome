/* ═══════════════════════════════════════════
   Credbusiness — Admin Routes (CRUD completo)
   ═══════════════════════════════════════════ */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../database/init');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(auth, adminOnly);

// Helper
function safeUser(db, user) {
    if (!user) return null;
    const referrals = db.prepare('SELECT id FROM users WHERE sponsor_id = ?').all(user.id).map(r => r.id);
    const { password, ...u } = user;
    u.referrals = referrals;
    u.active = !!u.active;
    return u;
}

// ════════════════════════════════════
//   DASHBOARD ADMIN
// ════════════════════════════════════
router.get('/dashboard', (req, res) => {
    const db = getDB();
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE active = 1').get().c;
    const totalProcesses = db.prepare('SELECT COUNT(*) as c FROM processes').get().c;
    const pendingProcesses = db.prepare("SELECT COUNT(*) as c FROM processes WHERE status = 'pendente'").get().c;
    const openTickets = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'aberto'").get().c;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(ABS(amount)),0) as total FROM transactions WHERE type = 'compra'").get().total;
    const totalCommissions = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type IN ('bonus','comissao')").get().total;

    res.json({
        totalUsers, activeUsers, totalProcesses, pendingProcesses,
        openTickets, totalRevenue, totalCommissions
    });
});

// ════════════════════════════════════
//   USERS CRUD
// ════════════════════════════════════
router.get('/users', (req, res) => {
    const db = getDB();
    const users = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
    res.json(users.map(u => safeUser(db, u)));
});

router.get('/users/:id', (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(safeUser(db, user));
});

router.put('/users/:id', (req, res) => {
    const db = getDB();
    const { name, email, phone, cpf, level, points, bonus, balance, plan, active, role } = req.body;

    db.prepare(`UPDATE users SET
        name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone),
        cpf = COALESCE(?, cpf), level = COALESCE(?, level), points = COALESCE(?, points),
        bonus = COALESCE(?, bonus), balance = COALESCE(?, balance), plan = COALESCE(?, plan),
        active = COALESCE(?, active), role = COALESCE(?, role)
        WHERE id = ?
    `).run(name||null, email||null, phone||null, cpf||null, level||null,
           points!=null?points:null, bonus!=null?bonus:null, balance!=null?balance:null,
           plan||null, active!=null?(active?1:0):null, role||null, req.params.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json({ success: true, user: safeUser(db, updated) });
});

router.delete('/users/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

router.post('/users/:id/reset-password', (req, res) => {
    const db = getDB();
    const newPass = req.body.password || '123456';
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPass, 10), req.params.id);
    res.json({ success: true, message: `Senha redefinida para: ${newPass}` });
});

// ════════════════════════════════════
//   PROCESSES CRUD
// ════════════════════════════════════
router.get('/processes', (req, res) => {
    const db = getDB();
    res.json(db.prepare('SELECT * FROM processes ORDER BY created_at DESC').all());
});

router.put('/processes/:id', (req, res) => {
    const db = getDB();
    const { status, type, value, institution } = req.body;
    db.prepare(`UPDATE processes SET status = COALESCE(?,status), type = COALESCE(?,type),
        value = COALESCE(?,value), institution = COALESCE(?,institution), updated_at = date('now')
        WHERE id = ?`).run(status||null, type||null, value!=null?value:null, institution||null, req.params.id);
    res.json({ success: true });
});

router.delete('/processes/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM processes WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ════════════════════════════════════
//   TRANSACTIONS
// ════════════════════════════════════
router.get('/transactions', (req, res) => {
    const db = getDB();
    res.json(db.prepare('SELECT t.*, u.name as user_name FROM transactions t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.date DESC').all());
});

router.post('/transactions', (req, res) => {
    const { user_id, type, amount, description, status } = req.body;
    const db = getDB();
    db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status) VALUES (?, ?, ?, ?, date('now'), ?)`)
        .run(user_id, type, amount, description || '', status || 'creditado');

    // Update user balance if credit
    if (amount > 0) {
        db.prepare('UPDATE users SET balance = balance + ?, bonus = bonus + ? WHERE id = ?').run(amount, amount, user_id);
    }

    res.json({ success: true });
});

// ════════════════════════════════════
//   TICKETS
// ════════════════════════════════════
router.get('/tickets', (req, res) => {
    const db = getDB();
    const tickets = db.prepare('SELECT t.*, u.name as user_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC').all();
    tickets.forEach(t => {
        t.responses = db.prepare('SELECT * FROM ticket_responses WHERE ticket_id = ? ORDER BY date ASC').all(t.id);
    });
    res.json(tickets);
});

router.post('/tickets/:id/respond', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem é obrigatória' });
    const db = getDB();
    db.prepare(`INSERT INTO ticket_responses (ticket_id, from_type, message, date) VALUES (?, 'admin', ?, date('now'))`)
        .run(req.params.id, message);
    db.prepare("UPDATE tickets SET status = 'respondido' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
});

router.put('/tickets/:id', (req, res) => {
    const { status, priority } = req.body;
    const db = getDB();
    db.prepare('UPDATE tickets SET status = COALESCE(?,status), priority = COALESCE(?,priority) WHERE id = ?')
        .run(status||null, priority||null, req.params.id);
    res.json({ success: true });
});

// ════════════════════════════════════
//   PACKAGES CRUD
// ════════════════════════════════════
router.get('/packages', (req, res) => {
    const db = getDB();
    res.json(db.prepare('SELECT * FROM packages').all());
});

router.post('/packages', (req, res) => {
    const { name, price, points, description } = req.body;
    const db = getDB();
    const result = db.prepare('INSERT INTO packages (name,price,points,description) VALUES (?,?,?,?)')
        .run(name, price, points || 0, description || '');
    res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/packages/:id', (req, res) => {
    const { name, price, points, description, active } = req.body;
    const db = getDB();
    db.prepare(`UPDATE packages SET name=COALESCE(?,name), price=COALESCE(?,price),
        points=COALESCE(?,points), description=COALESCE(?,description), active=COALESCE(?,active) WHERE id=?`)
        .run(name||null, price!=null?price:null, points!=null?points:null, description||null, active!=null?(active?1:0):null, req.params.id);
    res.json({ success: true });
});

router.delete('/packages/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ════════════════════════════════════
//   NEWS CRUD
// ════════════════════════════════════
router.get('/news', (req, res) => {
    const db = getDB();
    res.json(db.prepare('SELECT * FROM news ORDER BY date DESC').all());
});

router.post('/news', (req, res) => {
    const { title, content, category } = req.body;
    const db = getDB();
    const result = db.prepare("INSERT INTO news (title,content,date,category) VALUES (?,?,date('now'),?)")
        .run(title, content, category || 'novidade');
    res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/news/:id', (req, res) => {
    const { title, content, category } = req.body;
    const db = getDB();
    db.prepare('UPDATE news SET title=COALESCE(?,title), content=COALESCE(?,content), category=COALESCE(?,category) WHERE id=?')
        .run(title||null, content||null, category||null, req.params.id);
    res.json({ success: true });
});

router.delete('/news/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ════════════════════════════════════
//   EVENTS CRUD
// ════════════════════════════════════
router.get('/events', (req, res) => {
    const db = getDB();
    res.json(db.prepare('SELECT * FROM events ORDER BY date DESC').all());
});

router.post('/events', (req, res) => {
    const { title, date, time, type, location, description, status } = req.body;
    const db = getDB();
    const result = db.prepare('INSERT INTO events (title,date,time,type,location,description,status) VALUES (?,?,?,?,?,?,?)')
        .run(title, date, time||'', type||'online', location||'', description||'', status||'proximo');
    res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/events/:id', (req, res) => {
    const { title, date, time, type, location, description, status } = req.body;
    const db = getDB();
    db.prepare(`UPDATE events SET title=COALESCE(?,title), date=COALESCE(?,date), time=COALESCE(?,time),
        type=COALESCE(?,type), location=COALESCE(?,location), description=COALESCE(?,description), status=COALESCE(?,status) WHERE id=?`)
        .run(title||null, date||null, time||null, type||null, location||null, description||null, status||null, req.params.id);
    res.json({ success: true });
});

router.delete('/events/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// ════════════════════════════════════
//   SETTINGS
// ════════════════════════════════════
router.get('/settings', (req, res) => {
    const db = getDB();
    const settings = {};
    db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });
    res.json(settings);
});

router.put('/settings', (req, res) => {
    const db = getDB();
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    Object.entries(req.body).forEach(([key, value]) => {
        stmt.run(key, String(value));
    });
    res.json({ success: true });
});

// ════════════════════════════════════
//   CONTENT BULK UPDATE (for frontend sync)
// ════════════════════════════════════
router.put('/content/news', (req, res) => {
    // Bulk replace news from frontend array
    const db = getDB();
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array esperado' });
    db.prepare('DELETE FROM news').run();
    const stmt = db.prepare("INSERT INTO news (id, title, content, date, category) VALUES (?, ?, ?, ?, ?)");
    items.forEach(n => {
        stmt.run(n.id, n.title, n.content || '', n.date || new Date().toISOString(), n.category || 'novidade');
    });
    res.json({ success: true });
});

router.put('/content/events', (req, res) => {
    const db = getDB();
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array esperado' });
    db.prepare('DELETE FROM events').run();
    const stmt = db.prepare("INSERT INTO events (id, title, date, time, type, location, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    items.forEach(e => {
        stmt.run(e.id, e.title, e.date, e.time || '', e.type || 'online', e.location || '', e.description || '', e.status || 'proximo');
    });
    res.json({ success: true });
});

router.put('/content/packages', (req, res) => {
    const db = getDB();
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array esperado' });
    db.prepare('DELETE FROM packages').run();
    const stmt = db.prepare("INSERT INTO packages (id, name, price, points, description) VALUES (?, ?, ?, ?, ?)");
    items.forEach(p => {
        stmt.run(p.id, p.name, p.price, p.points || 0, p.description || '');
    });
    res.json({ success: true });
});

router.put('/content/faqs', (req, res) => {
    const db = getDB();
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array esperado' });
    db.exec(`CREATE TABLE IF NOT EXISTS faqs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category TEXT DEFAULT 'conta',
        sort_order INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1
    )`);
    db.prepare('DELETE FROM faqs').run();
    const stmt = db.prepare("INSERT INTO faqs (question, answer, category, sort_order) VALUES (?, ?, ?, ?)");
    items.forEach((f, i) => { stmt.run(f.q || f.question, f.a || f.answer, f.cat || f.category || 'conta', i); });
    res.json({ success: true });
});

// ════════════════════════════════════
//   NETWORK (admin view)
// ════════════════════════════════════
router.get('/network', (req, res) => {
    const db = getDB();
    const users = db.prepare('SELECT * FROM users ORDER BY id').all();

    function buildTree(uid) {
        const user = users.find(u => u.id === uid);
        if (!user) return null;
        const children = users.filter(u => u.sponsor_id === uid);
        const safe = safeUser(db, user);
        safe.children = children.map(c => buildTree(c.id)).filter(Boolean);
        return safe;
    }

    // Find root users (no sponsor)
    const roots = users.filter(u => !u.sponsor_id);
    res.json(roots.map(r => buildTree(r.id)).filter(Boolean));
});

module.exports = router;
