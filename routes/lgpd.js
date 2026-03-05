/* ═══════════════════════════════════════════
   Credbusiness — LGPD Routes
   GET  /api/lgpd/consent       — Status do consentimento
   POST /api/lgpd/consent       — Aceitar/revogar consentimento
   GET  /api/lgpd/export        — Exportar todos os dados do usuário
   POST /api/lgpd/delete-request — Solicitar exclusão de dados
   ═══════════════════════════════════════════ */

const express = require('express');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');
const { logAudit, getClientIP } = require('../utils/audit');

const router = express.Router();

// ── Status do consentimento ──
router.get('/consent', auth, (req, res) => {
    try {
        const db = getDB();
        const user = db.prepare('SELECT lgpd_consent, lgpd_consent_date FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        res.json({
            consent: !!user.lgpd_consent,
            consentDate: user.lgpd_consent_date || null
        });
    } catch (err) {
        console.error('Erro LGPD consent:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Aceitar/Revogar consentimento ──
router.post('/consent', auth, (req, res) => {
    try {
        const { consent } = req.body;
        if (consent === undefined) return res.status(400).json({ error: 'Campo consent é obrigatório' });

        const db = getDB();
        db.prepare(`
            UPDATE users SET lgpd_consent = ?, lgpd_consent_date = datetime('now') WHERE id = ?
        `).run(consent ? 1 : 0, req.user.id);

        logAudit({
            userType: 'user',
            userId: req.user.id,
            action: consent ? 'lgpd_consent_accept' : 'lgpd_consent_revoke',
            entity: 'user',
            entityId: req.user.id,
            ip: getClientIP(req)
        });

        res.json({ success: true, consent: !!consent });
    } catch (err) {
        console.error('Erro LGPD consent update:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Exportar dados do usuário (LGPD Art. 18) ──
router.get('/export', auth, (req, res) => {
    try {
        const db = getDB();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Remover dados sensíveis
        const { password, totp_secret, totp_temp_token, totp_temp_expires, ...userData } = user;

        // Coletar todos os dados do usuário
        const processes = db.prepare('SELECT * FROM processes WHERE user_id = ?').all(req.user.id);
        const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(req.user.id);
        const tickets = db.prepare('SELECT * FROM tickets WHERE user_id = ?').all(req.user.id);
        tickets.forEach(t => {
            t.responses = db.prepare('SELECT * FROM ticket_responses WHERE ticket_id = ?').all(t.id);
        });
        const consultations = db.prepare('SELECT * FROM consultations WHERE user_id = ?').all(req.user.id);
        const packages = db.prepare(`
            SELECT up.*, p.name, p.price FROM user_packages up 
            JOIN packages p ON up.package_id = p.id WHERE up.user_id = ?
        `).all(req.user.id);
        const commissions = db.prepare('SELECT * FROM commissions WHERE to_user_id = ? OR from_user_id = ?').all(req.user.id, req.user.id);
        const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ?').all(req.user.id);

        let preferences = [];
        try {
            preferences = db.prepare('SELECT pref_key, pref_value FROM user_preferences WHERE user_id = ?').all(req.user.id);
        } catch {}

        const exportData = {
            exportDate: new Date().toISOString(),
            userData,
            processes,
            transactions,
            tickets,
            consultations,
            packages,
            commissions,
            notifications,
            preferences
        };

        logAudit({
            userType: 'user',
            userId: req.user.id,
            action: 'lgpd_data_export',
            entity: 'user',
            entityId: req.user.id,
            ip: getClientIP(req)
        });

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="meus-dados-credbusiness-${req.user.id}.json"`);
        res.json(exportData);
    } catch (err) {
        console.error('Erro LGPD export:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Solicitar exclusão de dados ──
router.post('/delete-request', auth, (req, res) => {
    try {
        const db = getDB();
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: 'Senha é obrigatória para confirmar exclusão' });

        const bcrypt = require('bcryptjs');
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        // Criar ticket de solicitação de exclusão
        db.prepare(`
            INSERT INTO tickets (user_id, subject, message, status, priority, created_at)
            VALUES (?, 'Solicitação LGPD - Exclusão de Dados', 'Solicito a exclusão de todos os meus dados pessoais conforme LGPD Art. 18.', 'aberto', 'alta', datetime('now'))
        `).run(req.user.id);

        logAudit({
            userType: 'user',
            userId: req.user.id,
            action: 'lgpd_delete_request',
            entity: 'user',
            entityId: req.user.id,
            ip: getClientIP(req)
        });

        res.json({
            success: true,
            message: 'Solicitação de exclusão registrada. Nossa equipe processará em até 15 dias úteis conforme a LGPD.'
        });
    } catch (err) {
        console.error('Erro LGPD delete request:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
