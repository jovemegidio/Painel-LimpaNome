/* ═══════════════════════════════════════════
   Credbusiness — Notification Utility
   Cria notificações no banco para os usuários
   ═══════════════════════════════════════════ */

const { getDB } = require('../database/init');

/**
 * Cria uma notificação para um usuário
 * @param {number} userId
 * @param {string} type - 'info', 'success', 'warning', 'alert', 'error'
 * @param {string} title
 * @param {string} message
 * @param {string} [link] - Link para navegação
 */
function createNotification(userId, type, title, message, link) {
    try {
        const db = getDB();
        db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, link, read, created_at)
            VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
        `).run(userId, type || 'info', title, message, link || '');
    } catch (err) {
        console.error('Notification create error:', err.message);
    }
}

/**
 * Cria notificação para múltiplos usuários
 */
function createBulkNotification(userIds, type, title, message, link) {
    try {
        const db = getDB();
        const stmt = db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, link, read, created_at)
            VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
        `);
        const tx = db.transaction(() => {
            for (const uid of userIds) {
                stmt.run(uid, type || 'info', title, message, link || '');
            }
        });
        tx();
    } catch (err) {
        console.error('Bulk notification error:', err.message);
    }
}

/**
 * Cria notificação para TODOS os usuários ativos
 */
function notifyAllUsers(type, title, message, link) {
    try {
        const db = getDB();
        const users = db.prepare('SELECT id FROM users WHERE active = 1').all();
        createBulkNotification(users.map(u => u.id), type, title, message, link);
    } catch (err) {
        console.error('Notify all error:', err.message);
    }
}

module.exports = { createNotification, createBulkNotification, notifyAllUsers };
