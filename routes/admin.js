/* ═══════════════════════════════════════════
   Credbusiness — Admin Routes (CRUD completo)
   ═══════════════════════════════════════════ */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../database/init');
const { auth, adminOnly } = require('../middleware/auth');
const { logAudit, getClientIP } = require('../utils/audit');
const { createNotification, notifyAllUsers } = require('../utils/notifications');
const { sendNotificationEmail } = require('../utils/email');
const { broadcast, sendToUser } = require('../utils/sse');

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
    const pendingProcesses = db.prepare("SELECT COUNT(*) as c FROM processes WHERE status IN ('pendente','em_andamento')").get().c;
    const openTickets = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status IN ('aberto','respondido')").get().c;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(ABS(amount)),0) as total FROM transactions WHERE type = 'compra'").get().total;
    const totalCommissions = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type IN ('bonus','comissao')").get().total;

    const usersByLevel = db.prepare("SELECT level, COUNT(*) as count FROM users GROUP BY level").all();
    const recentTickets = db.prepare("SELECT t.*, u.name as user_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id WHERE t.status != 'fechado' ORDER BY t.created_at DESC LIMIT 5").all();
    const recentProcesses = db.prepare("SELECT p.*, u.name as user_name FROM processes p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC LIMIT 5").all();

    res.json({
        totalUsers, activeUsers, totalProcesses, pendingProcesses,
        openTickets, totalRevenue, totalCommissions,
        usersByLevel, recentTickets, recentProcesses
    });
});

// ════════════════════════════════════
//   USERS CRUD
// ════════════════════════════════════
router.get('/users', (req, res) => {
    const db = getDB();
    const search = req.query.search || '';
    const status = req.query.status; // 'active', 'inactive'
    const level = req.query.level;
    const plan = req.query.plan;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
        where += ' AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(username) LIKE ? OR cpf LIKE ?)';
        const s = `%${search.toLowerCase()}%`;
        params.push(s, s, s, s);
    }
    if (status === 'active') { where += ' AND active = 1'; }
    else if (status === 'inactive') { where += ' AND active = 0'; }
    if (level) { where += ' AND level = ?'; params.push(level); }
    if (plan) { where += ' AND plan = ?'; params.push(plan); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params).c;
    const users = db.prepare(`SELECT * FROM users ${where} ORDER BY id ASC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    res.json({
        users: users.map(u => safeUser(db, u)),
        total,
        page,
        totalPages: Math.ceil(total / limit)
    });
});

router.get('/users/:id', (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(safeUser(db, user));
});

// ── Criar usuário (admin) ──
router.post('/users', (req, res) => {
    try {
        const db = getDB();
        const { username, password, name, email, phone, cpf, level, plan, sponsor_id, active } = req.body;

        if (!username || !name || !email) return res.status(400).json({ error: 'Username, nome e email são obrigatórios' });

        // Verificar duplicatas
        if (db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username.toLowerCase())) {
            return res.status(409).json({ error: 'Username já existe' });
        }
        if (db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email.toLowerCase())) {
            return res.status(409).json({ error: 'Email já cadastrado' });
        }

        const hashedPw = bcrypt.hashSync(password || '123456', 10);
        const result = db.prepare(`
            INSERT INTO users (username, password, name, email, phone, cpf, level, plan, sponsor_id, active, role, email_verified, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', 1, date('now'))
        `).run(
            username.toLowerCase(), hashedPw, name, email.toLowerCase(),
            phone || '', cpf || '', level || 'prata', plan || 'basico',
            sponsor_id || null, active !== undefined ? (active ? 1 : 0) : 1
        );

        const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
        createNotification(result.lastInsertRowid, 'success', 'Bem-vindo!', 'Sua conta foi criada pelo administrador.', '/pages/dashboard.html');
        logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_create_user', entity: 'user', entityId: result.lastInsertRowid, ip: getClientIP(req) });
        broadcast('users', { action: 'created', id: result.lastInsertRowid });

        res.status(201).json({ success: true, user: safeUser(db, newUser) });
    } catch (err) {
        console.error('Erro criar usuário:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.put('/users/:id', (req, res) => {
    const db = getDB();
    const { name, email, phone, cpf, level, points, bonus, balance, plan, active, role } = req.body;

    // Atualizar dados básicos (sem balance/bonus direto)
    db.prepare(`UPDATE users SET
        name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone),
        cpf = COALESCE(?, cpf), level = COALESCE(?, level), points = COALESCE(?, points),
        plan = COALESCE(?, plan), active = COALESCE(?, active), role = COALESCE(?, role)
        WHERE id = ?
    `).run(name||null, email||null, phone||null, cpf||null, level||null,
           points!=null?points:null,
           plan||null, active!=null?(active?1:0):null, role||null, req.params.id);

    // Ajuste de balance/bonus via transação rastreável
    if (balance != null) {
        const current = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.params.id);
        if (current) {
            const diff = Number(balance) - current.balance;
            if (diff !== 0) {
                db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(Number(balance), req.params.id);
                db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status, reference_type) VALUES (?, 'ajuste_admin', ?, ?, date('now'), 'creditado', 'admin')`) 
                    .run(req.params.id, diff, `Ajuste manual por admin #${req.user.id}`);
            }
        }
    }
    if (bonus != null) {
        const current = db.prepare('SELECT bonus FROM users WHERE id = ?').get(req.params.id);
        if (current) {
            const diff = Number(bonus) - current.bonus;
            if (diff !== 0) {
                db.prepare('UPDATE users SET bonus = ? WHERE id = ?').run(Number(bonus), req.params.id);
            }
        }
    }

    logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_update_user', entity: 'user', entityId: Number(req.params.id), details: req.body, ip: getClientIP(req) });

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    sendToUser(Number(req.params.id), 'user_updated', { id: Number(req.params.id) });
    broadcast('users', { action: 'updated', id: Number(req.params.id) });
    res.json({ success: true, user: safeUser(db, updated) });
});

router.delete('/users/:id', (req, res) => {
    const db = getDB();
    logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_delete_user', entity: 'user', entityId: Number(req.params.id), ip: getClientIP(req) });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    broadcast('users', { action: 'deleted', id: Number(req.params.id) });
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
    const search = req.query.search || '';
    const status = req.query.status;
    const type = req.query.type;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
        where += ' AND (LOWER(p.name) LIKE ? OR p.cpf LIKE ? OR LOWER(p.institution) LIKE ? OR LOWER(u.name) LIKE ?)';
        const s = `%${search.toLowerCase()}%`;
        params.push(s, s, s, s);
    }
    if (status) { where += ' AND p.status = ?'; params.push(status); }
    if (type) { where += ' AND p.type = ?'; params.push(type); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM processes p LEFT JOIN users u ON p.user_id = u.id ${where}`).get(...params).c;
    const processes = db.prepare(`SELECT p.*, u.name as user_name, u.email as user_email, u.cpf as user_cpf FROM processes p LEFT JOIN users u ON p.user_id = u.id ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    res.json({ processes, total, page, totalPages: Math.ceil(total / limit) });
});

// Relatório PDF — todos os processos (sem paginação)
router.get('/processes/report', (req, res) => {
    const db = getDB();
    const status = req.query.status;
    const type = req.query.type;

    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND p.status = ?'; params.push(status); }
    if (type) { where += ' AND p.type = ?'; params.push(type); }

    const processes = db.prepare(`SELECT p.*, u.name as user_name, u.email as user_email, u.cpf as user_cpf, u.phone as user_phone, u.plan as user_plan FROM processes p LEFT JOIN users u ON p.user_id = u.id ${where} ORDER BY p.created_at DESC`).all(...params);
    const counts = { total: processes.length, pendente: 0, em_andamento: 0, concluido: 0, cancelado: 0 };
    let totalValue = 0;
    processes.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; totalValue += (p.value || 0); });

    // Incluir consultas realizadas
    const consultations = db.prepare(`SELECT c.*, u.name as user_name, u.email as user_email FROM consultations c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC`).all();

    res.json({ processes, counts, totalValue, consultations });
});

router.post('/processes', (req, res) => {
    try {
        const db = getDB();
        const { user_id, cpf, name, type, value, institution, notes, person_type } = req.body;
        if (!user_id) return res.status(400).json({ error: 'ID do usuário é obrigatório' });
        if (!cpf && !name) return res.status(400).json({ error: 'CPF/CNPJ ou nome são obrigatórios' });

        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const result = db.prepare(`INSERT INTO processes (user_id, cpf, name, type, value, institution, notes, person_type, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'pendente',datetime('now'),datetime('now'))`)
            .run(user_id, cpf || '', name || '', type || 'limpa_nome', value || 0, institution || '', notes || '', person_type || 'pf');

        createNotification(user_id, 'info', 'Novo processo criado', `O administrador criou o processo #${result.lastInsertRowid} para você.`, '/pages/limpa-nome-processos.html');
        logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_create_process', entity: 'process', entityId: result.lastInsertRowid, ip: getClientIP(req) });
        sendToUser(user_id, 'processes', { action: 'created', id: result.lastInsertRowid });
        broadcast('processes', { action: 'created', id: result.lastInsertRowid });

        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('Erro criar processo:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.put('/processes/:id', (req, res) => {
    const db = getDB();
    const { status, type, value, institution, notes } = req.body;

    const process = db.prepare('SELECT * FROM processes WHERE id = ?').get(req.params.id);

    db.prepare(`UPDATE processes SET status = COALESCE(?,status), type = COALESCE(?,type),
        value = COALESCE(?,value), institution = COALESCE(?,institution), notes = COALESCE(?,notes), updated_at = date('now')
        WHERE id = ?`).run(status||null, type||null, value!=null?value:null, institution||null, notes||null, req.params.id);

    // Notificar usuário sobre mudança de status
    if (process && status && status !== process.status) {
        const statusLabels = { pendente: 'Pendente', em_andamento: 'Em Andamento', concluido: 'Concluído', cancelado: 'Cancelado' };
        createNotification(process.user_id, status === 'concluido' ? 'success' : 'info',
            'Processo atualizado',
            `Seu processo #${req.params.id} mudou para: ${statusLabels[status] || status}`,
            '/pages/limpa-nome-processos.html');

        // Enviar email
        const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(process.user_id);
        if (user) {
            sendNotificationEmail(user.email, user.name,
                'Credbusiness — Processo Atualizado',
                `Seu processo #${req.params.id} mudou para o status: <strong>${statusLabels[status] || status}</strong>.`
            ).catch(() => {});
        }
    }

    logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_update_process', entity: 'process', entityId: Number(req.params.id), details: req.body, ip: getClientIP(req) });
    if (process) sendToUser(process.user_id, 'processes', { action: 'updated', id: Number(req.params.id) });
    broadcast('processes', { action: 'updated', id: Number(req.params.id) });
    res.json({ success: true });
});

router.delete('/processes/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM processes WHERE id = ?').run(req.params.id);
    broadcast('processes', { action: 'deleted', id: Number(req.params.id) });
    res.json({ success: true });
});

// ════════════════════════════════════
//   TRANSACTIONS
// ════════════════════════════════════
router.get('/transactions', (req, res) => {
    const db = getDB();
    const search = req.query.search || '';
    const type = req.query.type;
    const status = req.query.status;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
        where += ' AND (LOWER(u.name) LIKE ? OR LOWER(t.description) LIKE ?)';
        const s = `%${search.toLowerCase()}%`;
        params.push(s, s);
    }
    if (type) { where += ' AND t.type = ?'; params.push(type); }
    if (status) { where += ' AND t.status = ?'; params.push(status); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM transactions t LEFT JOIN users u ON t.user_id = u.id ${where}`).get(...params).c;
    const transactions = db.prepare(`SELECT t.*, u.name as user_name FROM transactions t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.date DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    res.json({ transactions, total, page, totalPages: Math.ceil(total / limit) });
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
    sendToUser(user_id, 'transactions', { action: 'created' });
    if (amount > 0) sendToUser(user_id, 'user_updated', { id: user_id });
    broadcast('transactions', { action: 'created', userId: user_id });

    res.json({ success: true });
});

router.put('/transactions/:id', (req, res) => {
    try {
        const db = getDB();
        const { type, amount, description, status } = req.body;
        const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
        if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });

        // If amount changes, adjust user balance
        if (amount != null && Number(amount) !== tx.amount) {
            const diff = Number(amount) - tx.amount;
            db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(diff, tx.user_id);
        }

        db.prepare('UPDATE transactions SET type=COALESCE(?,type), amount=COALESCE(?,amount), description=COALESCE(?,description), status=COALESCE(?,status) WHERE id=?')
            .run(type||null, amount!=null?Number(amount):null, description||null, status||null, req.params.id);

        logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_update_transaction', entity: 'transaction', entityId: Number(req.params.id), details: req.body, ip: getClientIP(req) });
        sendToUser(tx.user_id, 'transactions', { action: 'updated', id: Number(req.params.id) });
        sendToUser(tx.user_id, 'user_updated', { id: tx.user_id });
        broadcast('transactions', { action: 'updated', id: Number(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro atualizar transação:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.delete('/transactions/:id', (req, res) => {
    try {
        const db = getDB();
        const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
        if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });

        // Reverse balance if was credited
        if (tx.amount > 0 && (tx.status === 'creditado' || tx.status === 'aprovado')) {
            db.prepare('UPDATE users SET balance = MAX(0, balance - ?) WHERE id = ?').run(tx.amount, tx.user_id);
        }

        db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
        logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_delete_transaction', entity: 'transaction', entityId: Number(req.params.id), ip: getClientIP(req) });
        sendToUser(tx.user_id, 'transactions', { action: 'deleted', id: Number(req.params.id) });
        sendToUser(tx.user_id, 'user_updated', { id: tx.user_id });
        broadcast('transactions', { action: 'deleted', id: Number(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro excluir transação:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ════════════════════════════════════
//   TICKETS
// ════════════════════════════════════
router.get('/tickets', (req, res) => {
    const db = getDB();
    const search = req.query.search || '';
    const status = req.query.status;
    const priority = req.query.priority;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
        where += ' AND (LOWER(t.subject) LIKE ? OR LOWER(u.name) LIKE ?)';
        const s = `%${search.toLowerCase()}%`;
        params.push(s, s);
    }
    if (status) { where += ' AND t.status = ?'; params.push(status); }
    if (priority) { where += ' AND t.priority = ?'; params.push(priority); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM tickets t LEFT JOIN users u ON t.user_id = u.id ${where}`).get(...params).c;
    const tickets = db.prepare(`SELECT t.*, u.name as user_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    tickets.forEach(t => {
        t.responses = db.prepare('SELECT * FROM ticket_responses WHERE ticket_id = ? ORDER BY date ASC').all(t.id);
    });
    res.json({ tickets, total, page, totalPages: Math.ceil(total / limit) });
});

router.post('/tickets/:id/respond', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem é obrigatória' });
    const db = getDB();
    db.prepare(`INSERT INTO ticket_responses (ticket_id, from_type, message, date) VALUES (?, 'admin', ?, date('now'))`)
        .run(req.params.id, message);
    db.prepare("UPDATE tickets SET status = 'respondido' WHERE id = ?").run(req.params.id);

    // Notificar usuário
    const ticket = db.prepare('SELECT user_id, subject FROM tickets WHERE id = ?').get(req.params.id);
    if (ticket) {
        createNotification(ticket.user_id, 'info', 'Ticket respondido',
            `O suporte respondeu ao seu ticket: "${ticket.subject}"`,
            '/pages/suporte-tickets.html');
        // Enviar email
        const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(ticket.user_id);
        if (user) {
            sendNotificationEmail(user.email, user.name,
                'Credbusiness — Ticket Respondido',
                `O suporte respondeu ao seu ticket: <strong>${ticket.subject}</strong>. Acesse o painel para ver a resposta.`
            ).catch(() => {});
        }
    }

    logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_respond_ticket', entity: 'ticket', entityId: Number(req.params.id), ip: getClientIP(req) });
    if (ticket) sendToUser(ticket.user_id, 'tickets', { action: 'responded', id: Number(req.params.id) });
    broadcast('tickets', { action: 'responded', id: Number(req.params.id) });
    res.json({ success: true });
});

router.put('/tickets/:id', (req, res) => {
    const { status, priority } = req.body;
    const db = getDB();
    db.prepare('UPDATE tickets SET status = COALESCE(?,status), priority = COALESCE(?,priority) WHERE id = ?')
        .run(status||null, priority||null, req.params.id);
    const ticket = db.prepare('SELECT user_id FROM tickets WHERE id = ?').get(req.params.id);
    if (ticket) sendToUser(ticket.user_id, 'tickets', { action: 'updated', id: Number(req.params.id) });
    broadcast('tickets', { action: 'updated', id: Number(req.params.id) });
    res.json({ success: true });
});

router.delete('/tickets/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM ticket_responses WHERE ticket_id = ?').run(req.params.id);
    db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
    logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_delete_ticket', entity: 'ticket', entityId: Number(req.params.id), ip: getClientIP(req) });
    broadcast('tickets', { action: 'deleted', id: Number(req.params.id) });
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
    const { name, price, points, description, level_key, names_count } = req.body;
    const db = getDB();
    const result = db.prepare('INSERT INTO packages (name,price,points,description,level_key,names_count) VALUES (?,?,?,?,?,?)')
        .run(name, price, points || 0, description || '', level_key || '', names_count || 0);
    broadcast('packages', { action: 'created', id: result.lastInsertRowid });
    res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/packages/:id', (req, res) => {
    const { name, price, points, description, active, level_key, names_count } = req.body;
    const db = getDB();
    db.prepare(`UPDATE packages SET name=COALESCE(?,name), price=COALESCE(?,price),
        points=COALESCE(?,points), description=COALESCE(?,description), active=COALESCE(?,active),
        level_key=COALESCE(?,level_key), names_count=COALESCE(?,names_count) WHERE id=?`)
        .run(name||null, price!=null?price:null, points!=null?points:null, description||null, active!=null?(active?1:0):null, level_key||null, names_count!=null?names_count:null, req.params.id);
    broadcast('packages', { action: 'updated', id: Number(req.params.id) });
    res.json({ success: true });
});

router.delete('/packages/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
    broadcast('packages', { action: 'deleted', id: Number(req.params.id) });
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
    broadcast('news', { action: 'created', id: result.lastInsertRowid });
    res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/news/:id', (req, res) => {
    const { title, content, category } = req.body;
    const db = getDB();
    db.prepare('UPDATE news SET title=COALESCE(?,title), content=COALESCE(?,content), category=COALESCE(?,category) WHERE id=?')
        .run(title||null, content||null, category||null, req.params.id);
    broadcast('news', { action: 'updated', id: Number(req.params.id) });
    res.json({ success: true });
});

router.delete('/news/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
    broadcast('news', { action: 'deleted', id: Number(req.params.id) });
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
    broadcast('events', { action: 'created', id: result.lastInsertRowid });
    res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/events/:id', (req, res) => {
    const { title, date, time, type, location, description, status } = req.body;
    const db = getDB();
    db.prepare(`UPDATE events SET title=COALESCE(?,title), date=COALESCE(?,date), time=COALESCE(?,time),
        type=COALESCE(?,type), location=COALESCE(?,location), description=COALESCE(?,description), status=COALESCE(?,status) WHERE id=?`)
        .run(title||null, date||null, time||null, type||null, location||null, description||null, status||null, req.params.id);
    broadcast('events', { action: 'updated', id: Number(req.params.id) });
    res.json({ success: true });
});

router.delete('/events/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    broadcast('events', { action: 'deleted', id: Number(req.params.id) });
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
    broadcast('settings', { action: 'updated' });
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
    const bulkUpdate = db.transaction(() => {
        db.prepare('DELETE FROM news').run();
        const stmt = db.prepare("INSERT INTO news (id, title, content, date, category) VALUES (?, ?, ?, ?, ?)");
        items.forEach(n => {
            stmt.run(n.id, n.title, n.content || '', n.date || new Date().toISOString(), n.category || 'novidade');
        });
    });
    try { bulkUpdate(); broadcast('news', { action: 'bulk_updated' }); res.json({ success: true }); }
    catch (err) { console.error('Erro bulk news:', err.message); res.status(500).json({ error: 'Erro ao salvar. Dados preservados.' }); }
});

router.put('/content/events', (req, res) => {
    const db = getDB();
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array esperado' });
    const bulkUpdate = db.transaction(() => {
        db.prepare('DELETE FROM events').run();
        const stmt = db.prepare("INSERT INTO events (id, title, date, time, type, location, description, status, price, max_tickets, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        items.forEach(e => {
            stmt.run(e.id, e.title, e.date, e.time || '', e.type || 'online', e.location || '', e.description || '', e.status || 'proximo', e.price || 0, e.max_tickets || 0, e.image || '');
        });
    });
    try { bulkUpdate(); broadcast('events', { action: 'bulk_updated' }); res.json({ success: true }); }
    catch (err) { console.error('Erro bulk events:', err.message); res.status(500).json({ error: 'Erro ao salvar. Dados preservados.' }); }
});

router.put('/content/packages', (req, res) => {
    const db = getDB();
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array esperado' });
    const bulkUpdate = db.transaction(() => {
        db.prepare('DELETE FROM packages').run();
        const stmt = db.prepare("INSERT INTO packages (id, name, price, points, description, level_key, names_count) VALUES (?, ?, ?, ?, ?, ?, ?)");
        items.forEach(p => {
            stmt.run(p.id, p.name, p.price, p.points || 0, p.description || '', p.level_key || '', p.names_count || 0);
        });
    });
    try { bulkUpdate(); broadcast('packages', { action: 'bulk_updated' }); res.json({ success: true }); }
    catch (err) { console.error('Erro bulk packages:', err.message); res.status(500).json({ error: 'Erro ao salvar. Dados preservados.' }); }
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
    const bulkUpdate = db.transaction(() => {
        db.prepare('DELETE FROM faqs').run();
        const stmt = db.prepare("INSERT INTO faqs (question, answer, category, sort_order) VALUES (?, ?, ?, ?)");
        items.forEach((f, i) => { stmt.run(f.q || f.question, f.a || f.answer, f.cat || f.category || 'conta', i); });
    });
    try { bulkUpdate(); broadcast('faqs', { action: 'bulk_updated' }); res.json({ success: true }); }
    catch (err) { console.error('Erro bulk faqs:', err.message); res.status(500).json({ error: 'Erro ao salvar. Dados preservados.' }); }
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

// ════════════════════════════════════
//   AUDIT LOG (admin view)
// ════════════════════════════════════
router.get('/audit-log', (req, res) => {
    try {
        const db = getDB();
        const search = req.query.search || '';
        const action = req.query.action;
        const userType = req.query.userType;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const offset = (page - 1) * limit;

        let where = 'WHERE 1=1';
        const params = [];

        if (search) {
            where += ' AND (LOWER(action) LIKE ? OR LOWER(entity) LIKE ? OR LOWER(details) LIKE ?)';
            const s = `%${search.toLowerCase()}%`;
            params.push(s, s, s);
        }
        if (action) { where += ' AND action = ?'; params.push(action); }
        if (userType) { where += ' AND user_type = ?'; params.push(userType); }

        const total = db.prepare(`SELECT COUNT(*) as c FROM audit_log ${where}`).get(...params).c;
        const logs = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

        res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('Erro audit log:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ════════════════════════════════════
//   NOTIFICATIONS (admin)
// ════════════════════════════════════
router.post('/notifications/broadcast', (req, res) => {
    try {
        const { type, title, message, link } = req.body;
        if (!title || !message) return res.status(400).json({ error: 'Título e mensagem são obrigatórios' });

        notifyAllUsers(type || 'info', title, message, link || '');
        logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_broadcast_notification', details: { title, message }, ip: getClientIP(req) });
        broadcast('notifications', { action: 'broadcast', title });

        res.json({ success: true, message: 'Notificação enviada para todos os usuários' });
    } catch (err) {
        console.error('Erro broadcast:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.post('/notifications/send', (req, res) => {
    try {
        const { userId, type, title, message, link } = req.body;
        if (!userId || !title || !message) return res.status(400).json({ error: 'userId, título e mensagem são obrigatórios' });

        createNotification(userId, type || 'info', title, message, link || '');
        sendToUser(userId, 'notifications', { action: 'new', title });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro send notification:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ════════════════════════════════════
//   UNIVERSITY (admin CRUD)
// ════════════════════════════════════
router.get('/university/courses', (req, res) => {
    const db = getDB();
    res.json(db.prepare('SELECT * FROM university_courses ORDER BY sort_order, id').all());
});

router.post('/university/courses', (req, res) => {
    const { title, description, category, video_url, thumbnail, duration, sort_order } = req.body;
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });
    const db = getDB();
    const result = db.prepare('INSERT INTO university_courses (title,description,category,video_url,thumbnail,duration,sort_order) VALUES (?,?,?,?,?,?,?)')
        .run(title, description||'', category||'geral', video_url||'', thumbnail||'', duration||'', sort_order||0);
    broadcast('university', { action: 'created', id: result.lastInsertRowid });
    res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/university/courses/:id', (req, res) => {
    const { title, description, category, video_url, thumbnail, duration, sort_order, active } = req.body;
    const db = getDB();
    db.prepare(`UPDATE university_courses SET title=COALESCE(?,title), description=COALESCE(?,description),
        category=COALESCE(?,category), video_url=COALESCE(?,video_url), thumbnail=COALESCE(?,thumbnail),
        duration=COALESCE(?,duration), sort_order=COALESCE(?,sort_order), active=COALESCE(?,active) WHERE id=?`)
        .run(title||null, description||null, category||null, video_url||null, thumbnail||null, duration||null,
             sort_order!=null?sort_order:null, active!=null?(active?1:0):null, req.params.id);
    broadcast('university', { action: 'updated', id: Number(req.params.id) });
    res.json({ success: true });
});

router.delete('/university/courses/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM university_courses WHERE id = ?').run(req.params.id);
    broadcast('university', { action: 'deleted', id: Number(req.params.id) });
    res.json({ success: true });
});

// ════════════════════════════════════
//   LANDING PAGE CONTENT
// ════════════════════════════════════
router.get('/landing', (req, res) => {
    try {
        const db = getDB();
        const row = db.prepare("SELECT value FROM settings WHERE key = 'landing_content'").get();
        if (row) {
            try { return res.json(JSON.parse(row.value)); } catch {}
        }
        res.json({});
    } catch (err) {
        console.error('Erro landing get:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.put('/landing', (req, res) => {
    try {
        const db = getDB();
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('landing_content', ?)").run(JSON.stringify(req.body));
        logAudit({ userType: 'admin', userId: req.user.id, action: 'admin_update_landing', entity: 'landing', ip: getClientIP(req) });
        broadcast('landing', { action: 'updated' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro landing save:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ════════════════════════════════════
//   DOWNLOADS CRUD
// ════════════════════════════════════

router.get('/downloads', (req, res) => {
    try {
        const db = getDB();
        res.json(db.prepare('SELECT * FROM downloads ORDER BY sort_order ASC, created_at DESC').all());
    } catch (err) {
        console.error('Erro listar downloads:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.post('/downloads', (req, res) => {
    try {
        const { title, description, category, file_url, file_type, file_size, sort_order } = req.body;
        if (!title || !file_url) return res.status(400).json({ error: 'Título e URL são obrigatórios' });
        const db = getDB();
        const result = db.prepare('INSERT INTO downloads (title, description, category, file_url, file_type, file_size, sort_order) VALUES (?,?,?,?,?,?,?)')
            .run(title, description || '', category || 'geral', file_url, file_type || '', file_size || '', sort_order || 0);
        logAudit({ userType: 'admin', userId: req.user.id, action: 'create_download', entity: 'download', entityId: result.lastInsertRowid, ip: getClientIP(req) });
        broadcast('downloads', { action: 'created', id: result.lastInsertRowid });
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('Erro criar download:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.put('/downloads/:id', (req, res) => {
    try {
        const { title, description, category, file_url, file_type, file_size, sort_order, active } = req.body;
        const db = getDB();
        const dl = db.prepare('SELECT * FROM downloads WHERE id = ?').get(req.params.id);
        if (!dl) return res.status(404).json({ error: 'Material não encontrado' });
        db.prepare('UPDATE downloads SET title=COALESCE(?,title), description=COALESCE(?,description), category=COALESCE(?,category), file_url=COALESCE(?,file_url), file_type=COALESCE(?,file_type), file_size=COALESCE(?,file_size), sort_order=COALESCE(?,sort_order), active=COALESCE(?,active) WHERE id=?')
            .run(title||null, description||null, category||null, file_url||null, file_type||null, file_size||null, sort_order!=null?sort_order:null, active!=null?active:null, req.params.id);
        logAudit({ userType: 'admin', userId: req.user.id, action: 'update_download', entity: 'download', entityId: req.params.id, ip: getClientIP(req) });
        broadcast('downloads', { action: 'updated', id: Number(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro atualizar download:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.delete('/downloads/:id', (req, res) => {
    try {
        const db = getDB();
        db.prepare('DELETE FROM downloads WHERE id = ?').run(req.params.id);
        logAudit({ userType: 'admin', userId: req.user.id, action: 'delete_download', entity: 'download', entityId: req.params.id, ip: getClientIP(req) });
        broadcast('downloads', { action: 'deleted', id: Number(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro excluir download:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ════════════════════════════════════
//   CUSTOM PAGES
// ════════════════════════════════════
router.get('/custom-pages', (req, res) => {
    const db = getDB();
    res.json(db.prepare('SELECT * FROM custom_pages ORDER BY sort_order ASC, id ASC').all());
});

router.post('/custom-pages', (req, res) => {
    const { title, slug, icon, content, section, sort_order, visible } = req.body;
    if (!title || !slug) return res.status(400).json({ error: 'Título e slug são obrigatórios' });
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!safeSlug) return res.status(400).json({ error: 'Slug inválido' });
    const db = getDB();
    const exists = db.prepare('SELECT id FROM custom_pages WHERE slug = ?').get(safeSlug);
    if (exists) return res.status(400).json({ error: 'Já existe uma página com este slug' });
    const result = db.prepare('INSERT INTO custom_pages (title,slug,icon,content,section,sort_order,visible) VALUES (?,?,?,?,?,?,?)')
        .run(title, safeSlug, icon || 'fa-file-alt', content || '', section || 'Personalizado', sort_order || 0, visible !== false ? 1 : 0);
    logAudit(db, req, 'custom_page_created', { pageId: result.lastInsertRowid, title, slug: safeSlug });
    broadcast('custom_pages', { action: 'created', id: result.lastInsertRowid });
    res.json({ success: true, id: result.lastInsertRowid, slug: safeSlug });
});

router.put('/custom-pages/:id', (req, res) => {
    const { title, slug, icon, content, section, sort_order, visible } = req.body;
    const db = getDB();
    const page = db.prepare('SELECT * FROM custom_pages WHERE id = ?').get(req.params.id);
    if (!page) return res.status(404).json({ error: 'Página não encontrada' });
    let safeSlug = page.slug;
    if (slug && slug !== page.slug) {
        safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const dup = db.prepare('SELECT id FROM custom_pages WHERE slug = ? AND id != ?').get(safeSlug, req.params.id);
        if (dup) return res.status(400).json({ error: 'Já existe uma página com este slug' });
    }
    db.prepare(`UPDATE custom_pages SET title=?, slug=?, icon=?, content=?, section=?, sort_order=?, visible=?, updated_at=datetime('now') WHERE id=?`)
        .run(title || page.title, safeSlug, icon || page.icon, content !== undefined ? content : page.content,
             section || page.section, sort_order != null ? sort_order : page.sort_order,
             visible != null ? (visible ? 1 : 0) : page.visible, req.params.id);
    logAudit(db, req, 'custom_page_updated', { pageId: req.params.id, title: title || page.title });
    broadcast('custom_pages', { action: 'updated', id: Number(req.params.id) });
    res.json({ success: true });
});

router.delete('/custom-pages/:id', (req, res) => {
    const db = getDB();
    const page = db.prepare('SELECT title FROM custom_pages WHERE id = ?').get(req.params.id);
    db.prepare('DELETE FROM custom_pages WHERE id = ?').run(req.params.id);
    if (page) logAudit(db, req, 'custom_page_deleted', { pageId: req.params.id, title: page.title });
    broadcast('custom_pages', { action: 'deleted', id: Number(req.params.id) });
    res.json({ success: true });
});

// ════════════════════════════════════
//   RELATÓRIO DE CADASTROS (CSV)
// ════════════════════════════════════
router.get('/export/users', (req, res) => {
    try {
        const db = getDB();
        const format = req.query.format || 'csv'; // csv ou json
        const users = db.prepare(`
            SELECT u.id, u.username, u.name, u.email, u.phone, u.cpf, u.level, u.plan, u.points, u.bonus, u.balance,
                   u.pix_key, u.pix_type, u.bank_name, u.bank_agency, u.bank_account, u.bank_type,
                   u.has_package, u.active, u.created_at, u.last_login,
                   s.name as sponsor_name, s.username as sponsor_username
            FROM users u
            LEFT JOIN users s ON u.sponsor_id = s.id
            ORDER BY u.id ASC
        `).all();

        if (format === 'json') {
            res.setHeader('Content-Disposition', 'attachment; filename=cadastros_credbusiness.json');
            res.setHeader('Content-Type', 'application/json');
            return res.json(users);
        }

        // CSV
        const BOM = '\uFEFF';
        const headers = ['ID','Username','Nome','Email','Telefone','CPF','Nível','Plano','Pontos','Bônus','Saldo','Chave PIX','Tipo PIX','Banco','Agência','Conta','Tipo Conta','Tem Pacote','Ativo','Data Cadastro','Último Login','Patrocinador','Username Patrocinador'];
        const csvRows = [headers.join(';')];
        for (const u of users) {
            csvRows.push([
                u.id, u.username, `"${(u.name||'').replace(/"/g,'""')}"`, u.email, u.phone, u.cpf,
                u.level, u.plan, u.points, u.bonus, u.balance,
                u.pix_key || '', u.pix_type || '', u.bank_name || '', u.bank_agency || '', u.bank_account || '', u.bank_type || '',
                u.has_package ? 'Sim' : 'Não', u.active ? 'Sim' : 'Não',
                u.created_at || '', u.last_login || '',
                `"${(u.sponsor_name||'').replace(/"/g,'""')}"`, u.sponsor_username || ''
            ].join(';'));
        }

        res.setHeader('Content-Disposition', 'attachment; filename=cadastros_credbusiness.csv');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.send(BOM + csvRows.join('\n'));
    } catch (err) {
        console.error('Erro export users:', err.message);
        res.status(500).json({ error: 'Erro ao exportar cadastros' });
    }
});

module.exports = router;
