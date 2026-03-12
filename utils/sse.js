/* ═══════════════════════════════════════════
   Credbusiness — Server-Sent Events (SSE)
   Real-time updates from admin → users
   ═══════════════════════════════════════════ */

const clients = new Map(); // userId → Set<response>

/**
 * Register an SSE client connection
 */
function addClient(userId, res) {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(res);

    res.on('close', () => {
        const set = clients.get(userId);
        if (set) {
            set.delete(res);
            if (set.size === 0) clients.delete(userId);
        }
    });
}

/**
 * Send event to a specific user
 */
function sendToUser(userId, event, data) {
    const set = clients.get(userId);
    if (!set) return;
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
        try { res.write(msg); } catch { /* client disconnected */ }
    }
}

/**
 * Broadcast event to ALL connected clients
 */
function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [, set] of clients) {
        for (const res of set) {
            try { res.write(msg); } catch { /* client disconnected */ }
        }
    }
}

/**
 * Get connected client count
 */
function clientCount() {
    let count = 0;
    for (const [, set] of clients) count += set.size;
    return count;
}

module.exports = { addClient, sendToUser, broadcast, clientCount };
