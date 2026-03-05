/* ═══════════════════════════════════════════
   Credbusiness — Notifications Routes
   GET    /api/notifications        — Listar notificações do usuário
   GET    /api/notifications/count  — Contagem de não lidas
   PUT    /api/notifications/:id/read — Marcar como lida
   PUT    /api/notifications/read-all — Marcar todas como lidas
   DELETE /api/notifications/:id    — Deletar notificação
   ═══════════════════════════════════════════ */

const express = require('express');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── Listar notificações ──
router.get('/', auth, (req, res) => {
    try {
        const db = getDB();
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const offset = Number(req.query.offset) || 0;

        const notifications = db.prepare(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).all(req.user.id, limit, offset);

        const total = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ?').get(req.user.id).c;

        res.json({ notifications, total });
    } catch (err) {
        console.error('Erro listar notificações:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Contagem de não lidas ──
router.get('/count', auth, (req, res) => {
    try {
        const db = getDB();
        const unread = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).c;
        res.json({ unread });
    } catch (err) {
        console.error('Erro contar notificações:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Marcar como lida ──
router.put('/:id/read', auth, (req, res) => {
    try {
        const db = getDB();
        db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro marcar notificação:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Marcar todas como lidas ──
router.put('/read-all', auth, (req, res) => {
    try {
        const db = getDB();
        db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.user.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro marcar todas:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Deletar notificação ──
router.delete('/:id', auth, (req, res) => {
    try {
        const db = getDB();
        db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro deletar notificação:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
