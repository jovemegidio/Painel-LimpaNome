/* ═══════════════════════════════════════════
   Credbusiness — Audit Log Utility
   Registra ações no audit_log para rastreabilidade
   ═══════════════════════════════════════════ */

const { getDB } = require('../database/init');

/**
 * Registra uma ação no audit log
 * @param {Object} params
 * @param {string} params.userType - 'user' ou 'admin'
 * @param {number} params.userId - ID do usuário/admin
 * @param {string} params.action - Ação executada (ex: 'login', 'create_process', 'withdraw')
 * @param {string} [params.entity] - Entidade afetada (ex: 'user', 'process', 'ticket')
 * @param {number} [params.entityId] - ID da entidade
 * @param {string} [params.details] - Detalhes adicionais (JSON string ou texto)
 * @param {string} [params.ip] - IP do cliente
 */
function logAudit({ userType, userId, action, entity, entityId, details, ip }) {
    try {
        const db = getDB();
        db.prepare(`
            INSERT INTO audit_log (user_type, user_id, action, entity, entity_id, details, ip, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
            userType || 'system',
            userId || 0,
            action,
            entity || '',
            entityId || null,
            typeof details === 'object' ? JSON.stringify(details) : (details || ''),
            ip || ''
        );
    } catch (err) {
        console.error('Audit log error:', err.message);
    }
}

/**
 * Extrai IP do request
 */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.ip || '';
}

module.exports = { logAudit, getClientIP };
