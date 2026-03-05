/* ═══════════════════════════════════════════
   Credbusiness — Tickets Routes
   ═══════════════════════════════════════════ */

const express = require('express');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');
const { logAudit, getClientIP } = require('../utils/audit');

const router = express.Router();

// ── Listar tickets do usuário ──
router.get('/', auth, (req, res) => {
    const db = getDB();
    const tickets = db.prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

    // Attach responses
    tickets.forEach(t => {
        t.responses = db.prepare('SELECT * FROM ticket_responses WHERE ticket_id = ? ORDER BY date ASC').all(t.id);
    });

    res.json(tickets);
});

// ── Criar ticket ──
router.post('/', auth, (req, res) => {
    const { subject, message, priority } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'Assunto e mensagem são obrigatórios' });

    const db = getDB();
    const result = db.prepare(`
        INSERT INTO tickets (user_id, subject, message, status, priority, created_at)
        VALUES (?, ?, ?, 'aberto', ?, date('now'))
    `).run(req.user.id, subject, message, priority || 'media');

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);
    ticket.responses = [];
    logAudit({ userType: 'user', userId: req.user.id, action: 'create_ticket', entity: 'ticket', entityId: result.lastInsertRowid, ip: getClientIP(req) });
    res.json({ success: true, ticket });
});

// ── Responder ticket (usuário) ──
router.post('/:id/respond', auth, (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem é obrigatória' });

    const db = getDB();
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    db.prepare(`INSERT INTO ticket_responses (ticket_id, from_type, message, date) VALUES (?, 'user', ?, date('now'))`)
        .run(ticket.id, message);
    db.prepare("UPDATE tickets SET status = 'aberto' WHERE id = ?").run(ticket.id);

    res.json({ success: true });
});

module.exports = router;
