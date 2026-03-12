/* ═══════════════════════════════════════════
   Credbusiness — Reports Routes
   GET /api/reports/sales       — Relatório de vendas (rede)
   GET /api/reports/commissions — Relatório de comissões detalhado
   GET /api/reports/summary     — Resumo geral
   ═══════════════════════════════════════════ */

const express = require('express');
const { getDB } = require('../database/init');
const { auth, requirePackage } = require('../middleware/auth');

const router = express.Router();

// ── Relatório de Vendas da Rede ──
router.get('/sales', auth, requirePackage, (req, res) => {
    try {
        const db = getDB();
        const from = req.query.from || '2000-01-01';
        const to = req.query.to || '2099-12-31';

        // Team member IDs
        function getTeamIds(uid) {
            const children = db.prepare('SELECT id FROM users WHERE sponsor_id = ?').all(uid);
            let ids = children.map(c => c.id);
            for (const c of children) ids = ids.concat(getTeamIds(c.id));
            return ids;
        }

        const teamIds = getTeamIds(req.user.id);
        const allIds = [req.user.id, ...teamIds];

        // Vendas (compras) no período
        const placeholders = allIds.map(() => '?').join(',');
        const sales = db.prepare(`
            SELECT t.*, u.name as user_name
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.type = 'compra' AND t.user_id IN (${placeholders})
            AND t.date >= ? AND t.date <= ?
            ORDER BY t.date DESC
        `).all(...allIds, from, to);

        // Resumo mensal (últimos 6 meses)
        const monthly = db.prepare(`
            SELECT strftime('%Y-%m', date) as month, 
                   COUNT(*) as count,
                   SUM(ABS(amount)) as total
            FROM transactions 
            WHERE type = 'compra' AND user_id IN (${placeholders})
            AND date >= date('now', '-6 months')
            GROUP BY strftime('%Y-%m', date)
            ORDER BY month ASC
        `).all(...allIds);

        const totalSales = sales.reduce((sum, s) => sum + Math.abs(s.amount), 0);
        const totalPackages = sales.length;

        res.json({
            sales,
            monthly,
            totalSales: Math.round(totalSales * 100) / 100,
            totalPackages,
            teamSize: teamIds.length
        });
    } catch (err) {
        console.error('Erro relatório vendas:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Relatório de Comissões ──
router.get('/commissions', auth, requirePackage, (req, res) => {
    try {
        const db = getDB();
        const from = req.query.from || '2000-01-01';
        const to = req.query.to || '2099-12-31';
        const type = req.query.type || 'all'; // 'comissao', 'bonus', 'all'

        let typeFilter = "AND t.type IN ('comissao', 'bonus')";
        if (type === 'comissao') typeFilter = "AND t.type = 'comissao'";
        else if (type === 'bonus') typeFilter = "AND t.type = 'bonus'";

        const commissions = db.prepare(`
            SELECT t.*, u.name as user_name
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.user_id = ? ${typeFilter}
            AND t.date >= ? AND t.date <= ?
            ORDER BY t.date DESC
        `).all(req.user.id, from, to);

        // Resumo por tipo
        const summary = db.prepare(`
            SELECT type, COUNT(*) as count, SUM(amount) as total
            FROM transactions
            WHERE user_id = ? AND type IN ('comissao', 'bonus')
            AND date >= ? AND date <= ?
            GROUP BY type
        `).all(req.user.id, from, to);

        // Comissões por nível (da tabela commissions)
        const byLevel = db.prepare(`
            SELECT level, COUNT(*) as count, SUM(amount) as total
            FROM commissions
            WHERE to_user_id = ? AND date >= ? AND date <= ?
            GROUP BY level ORDER BY level
        `).all(req.user.id, from, to);

        // Mensal
        const monthly = db.prepare(`
            SELECT strftime('%Y-%m', date) as month,
                   SUM(CASE WHEN type = 'comissao' THEN amount ELSE 0 END) as comissao,
                   SUM(CASE WHEN type = 'bonus' THEN amount ELSE 0 END) as bonus,
                   SUM(amount) as total
            FROM transactions
            WHERE user_id = ? AND type IN ('comissao', 'bonus')
            AND date >= date('now', '-6 months')
            GROUP BY strftime('%Y-%m', date)
            ORDER BY month ASC
        `).all(req.user.id);

        const totalCommissions = commissions.reduce((sum, c) => sum + c.amount, 0);

        res.json({
            commissions,
            summary,
            byLevel,
            monthly,
            total: Math.round(totalCommissions * 100) / 100
        });
    } catch (err) {
        console.error('Erro relatório comissões:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Resumo Geral (admin) ──
router.get('/summary', auth, requirePackage, (req, res) => {
    try {
        const db = getDB();
        const from = req.query.from || '2000-01-01';
        const to = req.query.to || '2099-12-31';

        const totalRevenue = db.prepare(`
            SELECT COALESCE(SUM(ABS(amount)), 0) as total 
            FROM transactions WHERE type = 'compra' AND date >= ? AND date <= ?
        `).get(from, to).total;

        const totalCommissionsPaid = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM transactions WHERE type IN ('comissao', 'bonus') AND date >= ? AND date <= ?
        `).get(from, to).total;

        const totalWithdrawals = db.prepare(`
            SELECT COALESCE(SUM(ABS(amount)), 0) as total 
            FROM transactions WHERE type = 'saque' AND date >= ? AND date <= ?
        `).get(from, to).total;

        const newUsers = db.prepare(`
            SELECT COUNT(*) as c FROM users WHERE created_at >= ? AND created_at <= ?
        `).get(from, to).c;

        const newProcesses = db.prepare(`
            SELECT COUNT(*) as c FROM processes WHERE created_at >= ? AND created_at <= ?
        `).get(from, to).c;

        res.json({
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalCommissionsPaid: Math.round(totalCommissionsPaid * 100) / 100,
            totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
            newUsers,
            newProcesses
        });
    } catch (err) {
        console.error('Erro resumo:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
