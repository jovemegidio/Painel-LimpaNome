/* ═══════════════════════════════════════════
   Credbusiness — Wallet Routes (PIX, Financial Password, Transfer, Deposit)
   ═══════════════════════════════════════════ */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');
const { logAudit, getClientIP } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const asaas = require('../utils/asaas');

const router = express.Router();

function sanitize(str) { return str ? String(str).trim().replace(/<[^>]*>/g, '') : ''; }

// ── Rate limit para senha financeira (máx 5 tentativas / 15 min por usuário) ──
const finPassAttempts = new Map();
const FIN_PASS_MAX = 5;
const FIN_PASS_WINDOW = 15 * 60 * 1000;

function checkFinPassRateLimit(userId) {
    const key = String(userId);
    const now = Date.now();
    const record = finPassAttempts.get(key);
    if (record && now < record.expiresAt) {
        if (record.count >= FIN_PASS_MAX) return false;
        record.count++;
        return true;
    }
    finPassAttempts.set(key, { count: 1, expiresAt: now + FIN_PASS_WINDOW });
    return true;
}

function resetFinPassRateLimit(userId) {
    finPassAttempts.delete(String(userId));
}

// Limpeza periódica
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of finPassAttempts) { if (now >= v.expiresAt) finPassAttempts.delete(k); }
}, 5 * 60 * 1000);

// ════════════════════════════════════
//   PIX KEY MANAGEMENT
// ════════════════════════════════════

router.get('/pix', auth, (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT pix_key, pix_type, bank_name, bank_agency, bank_account, bank_type FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({
        pix_key: user.pix_key || '', pix_type: user.pix_type || 'cpf',
        bank_name: user.bank_name || '', bank_agency: user.bank_agency || '',
        bank_account: user.bank_account || '', bank_type: user.bank_type || 'corrente'
    });
});

router.put('/pix', auth, (req, res) => {
    const pix_key = sanitize(req.body.pix_key);
    const pix_type = sanitize(req.body.pix_type);
    const bank_name = sanitize(req.body.bank_name);
    const bank_agency = sanitize(req.body.bank_agency);
    const bank_account = sanitize(req.body.bank_account);
    const bank_type = sanitize(req.body.bank_type);
    if (!pix_key) return res.status(400).json({ error: 'Chave PIX é obrigatória' });
    if (!['cpf', 'cnpj', 'email', 'phone', 'random'].includes(pix_type)) {
        return res.status(400).json({ error: 'Tipo de chave PIX inválido' });
    }

    const db = getDB();
    db.prepare('UPDATE users SET pix_key = ?, pix_type = ?, bank_name = ?, bank_agency = ?, bank_account = ?, bank_type = ? WHERE id = ?')
        .run(pix_key, pix_type, bank_name || '', bank_agency || '', bank_account || '', bank_type || 'corrente', req.user.id);
    logAudit({ userType: 'user', userId: req.user.id, action: 'update_pix_bank', entity: 'user', entityId: req.user.id, ip: getClientIP(req) });
    res.json({ success: true, message: 'Dados bancários e PIX atualizados com sucesso' });
});

// ════════════════════════════════════
//   FINANCIAL PASSWORD
// ════════════════════════════════════

router.get('/financial-password/status', auth, (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT financial_password FROM users WHERE id = ?').get(req.user.id);
    res.json({ hasFinancialPassword: !!(user && user.financial_password) });
});

router.post('/financial-password', auth, (req, res) => {
    const { password, currentPassword } = req.body;
    if (!password || password.length < 6 || password.length > 8) {
        return res.status(400).json({ error: 'Senha financeira deve ter entre 6 e 8 dígitos' });
    }
    if (!/^\d+$/.test(password)) {
        return res.status(400).json({ error: 'Senha financeira deve conter apenas números' });
    }

    const db = getDB();
    const user = db.prepare('SELECT financial_password FROM users WHERE id = ?').get(req.user.id);

    // If already has a financial password, require current one
    if (user.financial_password) {
        if (!currentPassword) return res.status(400).json({ error: 'Senha financeira atual é obrigatória' });
        if (!bcrypt.compareSync(currentPassword, user.financial_password)) {
            return res.status(400).json({ error: 'Senha financeira atual incorreta' });
        }
    }

    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET financial_password = ? WHERE id = ?').run(hash, req.user.id);
    logAudit({ userType: 'user', userId: req.user.id, action: 'set_financial_password', entity: 'user', entityId: req.user.id, ip: getClientIP(req) });
    res.json({ success: true, message: 'Senha financeira definida com sucesso' });
});

router.post('/financial-password/verify', auth, (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Senha financeira é obrigatória' });

    if (!checkFinPassRateLimit(req.user.id)) {
        return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' });
    }

    const db = getDB();
    const user = db.prepare('SELECT financial_password FROM users WHERE id = ?').get(req.user.id);
    if (!user || !user.financial_password) return res.status(400).json({ error: 'Senha financeira não configurada' });
    if (!bcrypt.compareSync(password, user.financial_password)) {
        logAudit({ userType: 'user', userId: req.user.id, action: 'financial_password_failed', entity: 'user', entityId: req.user.id, ip: getClientIP(req) });
        return res.status(400).json({ error: 'Senha financeira incorreta', valid: false });
    }
    resetFinPassRateLimit(req.user.id);
    res.json({ valid: true });
});

// ════════════════════════════════════
//   WALLET TRANSFER (between users)
// ════════════════════════════════════

router.post('/transfer', auth, (req, res) => {
    try {
        const amount = Number(req.body.amount);
        const toUsername = sanitize(req.body.username);
        const financialPassword = req.body.financialPassword;

        if (!amount || !isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Valor inválido' });
        if (amount < 1) return res.status(400).json({ error: 'Valor mínimo para transferência: R$ 1,00' });
        if (!toUsername) return res.status(400).json({ error: 'Usuário de destino é obrigatório' });

        const db = getDB();

        // Verify financial password if configured
        const sender = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!sender || !sender.active) return res.status(403).json({ error: 'Conta suspensa. Contate o suporte.' });
        if (sender.financial_password) {
            if (!financialPassword) return res.status(400).json({ error: 'Senha financeira é obrigatória para transferências' });
            if (!checkFinPassRateLimit(req.user.id)) {
                return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
            }
            if (!bcrypt.compareSync(financialPassword, sender.financial_password)) {
                logAudit({ userType: 'user', userId: req.user.id, action: 'transfer_password_failed', entity: 'transaction', ip: getClientIP(req) });
                return res.status(400).json({ error: 'Senha financeira incorreta' });
            }
            resetFinPassRateLimit(req.user.id);
        }

        const receiver = db.prepare('SELECT id, username, name, active FROM users WHERE LOWER(username) = ?').get(toUsername.toLowerCase());
        if (!receiver) return res.status(404).json({ error: 'Usuário de destino não encontrado' });
        if (!receiver.active) return res.status(400).json({ error: 'Usuário de destino está inativo' });
        if (receiver.id === req.user.id) return res.status(400).json({ error: 'Não é possível transferir para si mesmo' });

        // Atomic transfer
        const transfer = db.transaction(() => {
            const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
            if (amount > user.balance) throw new Error('INSUFFICIENT_BALANCE');

            db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, req.user.id);
            db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, receiver.id);

            db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status, reference_type) VALUES (?, 'transferencia', ?, ?, date('now'), 'concluido', 'transfer')`)
                .run(req.user.id, -amount, `Transferência para ${receiver.name} (@${receiver.username})`);

            db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status, reference_type) VALUES (?, 'transferencia', ?, ?, date('now'), 'concluido', 'transfer')`)
                .run(receiver.id, amount, `Transferência recebida de ${sender.name} (@${sender.username})`);
        });

        try {
            transfer();
        } catch (txErr) {
            if (txErr.message === 'INSUFFICIENT_BALANCE') {
                return res.status(400).json({ error: 'Saldo insuficiente' });
            }
            throw txErr;
        }

        logAudit({ userType: 'user', userId: req.user.id, action: 'wallet_transfer', entity: 'transaction', details: { amount, to: receiver.username }, ip: getClientIP(req) });
        createNotification(receiver.id, 'success', 'Transferência recebida', `Você recebeu R$ ${amount.toFixed(2)} de ${sender.name}`, '/pages/financeiro.html');

        res.json({ success: true, message: `R$ ${amount.toFixed(2)} transferido para ${receiver.name}` });
    } catch (err) {
        console.error('Erro transferência:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ════════════════════════════════════
//   WALLET DEPOSIT (via Asaas or manual)
// ════════════════════════════════════

router.post('/deposit', auth, async (req, res) => {
    try {
        const amount = Number(req.body.amount);
        const method = sanitize(req.body.method) || 'pix';

        if (!amount || !isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Valor inválido' });
        if (amount < 10) return res.status(400).json({ error: 'Depósito mínimo: R$ 10,00' });
        if (!['pix', 'boleto'].includes(method)) return res.status(400).json({ error: 'Método inválido' });

        const db = getDB();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Try Asaas payment
        if (asaas.isConfigured()) {
            // ── Buscar/criar cliente no Asaas ──
            let customer;
            try {
                customer = await asaas.getOrCreateCustomer(user);
            } catch (custErr) {
                console.error('Erro Asaas customer:', custErr.message);
                return res.status(400).json({ error: 'Não foi possível processar o depósito. Verifique se seu CPF/CNPJ está correto em Configurações.' });
            }
            if (!customer) {
                return res.status(400).json({ error: 'CPF/CNPJ não encontrado ou inválido. Atualize seus dados em Configurações.' });
            }

            const customerId = customer.id;

            // Salvar asaas_customer_id no usuário
            if (!user.asaas_customer_id || user.asaas_customer_id !== customerId) {
                db.prepare('UPDATE users SET asaas_customer_id = ? WHERE id = ?').run(customerId, user.id);
            }

            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 3);

            const billingType = method === 'pix' ? 'PIX' : 'BOLETO';
            const externalRef = `deposit_${user.id}_${Date.now()}`;
            const payment = await asaas.createPayment({
                customerId: customerId,
                billingType,
                value: amount,
                dueDate: dueDate.toISOString().split('T')[0],
                description: `Depósito Credbusiness`,
                externalReference: externalRef
            });

            db.prepare(`INSERT INTO payments (user_id, asaas_payment_id, asaas_customer_id, type, amount, method, status, invoice_url, external_reference, due_date, created_at)
                VALUES (?, ?, ?, 'deposit', ?, ?, 'pendente', ?, ?, ?, datetime('now'))`)
                .run(user.id, payment.id, customerId, amount, method, payment.invoiceUrl || '', externalRef, payment.dueDate || '');

            logAudit({ userType: 'user', userId: req.user.id, action: 'wallet_deposit', entity: 'payment', details: { amount, method }, ip: getClientIP(req) });

            const response = {
                success: true,
                paymentId: payment.id,
                invoiceUrl: payment.invoiceUrl,
                value: payment.value,
                dueDate: payment.dueDate,
                method,
                message: 'Depósito criado! Realize o pagamento para creditar seu saldo.'
            };

            // Se PIX, buscar QR Code
            if (method === 'pix') {
                const pix = await asaas.getPixQrCode(payment.id);
                if (pix) {
                    response.pix = {
                        qrCodeImage: pix.encodedImage,
                        copyPaste: pix.payload,
                        expirationDate: pix.expirationDate
                    };
                    db.prepare('UPDATE payments SET pix_qr_code = ?, pix_copy_paste = ? WHERE asaas_payment_id = ?')
                        .run(pix.encodedImage, pix.payload, payment.id);
                }
            }

            // Se boleto, buscar linha digitável
            if (method === 'boleto') {
                const boleto = await asaas.getBoletoInfo(payment.id);
                if (boleto) {
                    response.boleto = {
                        identificationField: boleto.identificationField,
                        barCode: boleto.barCode,
                        bankSlipUrl: payment.bankSlipUrl || payment.invoiceUrl
                    };
                }
            }

            return res.json(response);
        }

        // Without Asaas — create pending deposit
        db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status, reference_type) VALUES (?, 'deposito', ?, ?, date('now'), 'pendente', 'deposit')`)
            .run(req.user.id, amount, `Depósito via ${method.toUpperCase()}`);

        res.json({ success: true, message: 'Depósito registrado. Aguardando confirmação do administrador.' });
    } catch (err) {
        console.error('Erro depósito:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ════════════════════════════════════
//   DEPOSIT HISTORY
// ════════════════════════════════════

router.get('/deposits', auth, (req, res) => {
    const db = getDB();
    const deposits = db.prepare("SELECT * FROM transactions WHERE user_id = ? AND type = 'deposito' ORDER BY date DESC").all(req.user.id);
    const payments = db.prepare("SELECT * FROM payments WHERE user_id = ? AND type = 'deposit' ORDER BY created_at DESC").all(req.user.id);
    res.json({ deposits, payments });
});

// ════════════════════════════════════
//   WITHDRAWAL HISTORY
// ════════════════════════════════════

router.get('/withdrawals', auth, (req, res) => {
    const db = getDB();
    const withdrawals = db.prepare("SELECT * FROM transactions WHERE user_id = ? AND type = 'saque' ORDER BY date DESC").all(req.user.id);
    res.json(withdrawals);
});

// ════════════════════════════════════
//   DOWNLOADS
// ════════════════════════════════════

router.get('/downloads', auth, (req, res) => {
    const db = getDB();
    const downloads = db.prepare('SELECT * FROM downloads WHERE active = 1 ORDER BY sort_order ASC, created_at DESC').all();
    res.json(downloads);
});

// ════════════════════════════════════
//   EVENT ORDERS & TICKETS
// ════════════════════════════════════

router.post('/events/:eventId/buy', auth, (req, res) => {
    try {
        const quantity = Math.max(1, Math.min(10, Number(req.body.quantity) || 1));
        const db = getDB();
        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.eventId);
        if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

        const price = event.price || 0;
        const total = price * quantity;

        // Check ticket availability
        if (event.max_tickets > 0) {
            const sold = db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM event_orders WHERE event_id = ? AND status != 'cancelado'").get(event.id);
            if (sold.total + quantity > event.max_tickets) {
                return res.status(400).json({ error: 'Ingressos esgotados para este evento' });
            }
        }

        const purchase = db.transaction(() => {
            // If paid event, debit balance
            if (total > 0) {
                const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
                if (user.balance < total) throw new Error('INSUFFICIENT_BALANCE');
                db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(total, req.user.id);

                db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status, reference_type) VALUES (?, 'compra', ?, ?, date('now'), 'concluido', 'event')`)
                    .run(req.user.id, -total, `Ingresso: ${event.title} (x${quantity})`);
            }

            const order = db.prepare(`INSERT INTO event_orders (user_id, event_id, quantity, total, status) VALUES (?, ?, ?, ?, 'confirmado')`)
                .run(req.user.id, event.id, quantity, total);

            // Generate tickets
            const tickets = [];
            for (let i = 0; i < quantity; i++) {
                const code = 'TK-' + crypto.randomBytes(6).toString('hex').toUpperCase();
                db.prepare(`INSERT INTO event_tickets (order_id, user_id, event_id, ticket_code) VALUES (?, ?, ?, ?)`)
                    .run(order.lastInsertRowid, req.user.id, event.id, code);
                tickets.push(code);
            }

            return { orderId: order.lastInsertRowid, tickets };
        });

        let result;
        try {
            result = purchase();
        } catch (txErr) {
            if (txErr.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'Saldo insuficiente' });
            throw txErr;
        }

        logAudit({ userType: 'user', userId: req.user.id, action: 'buy_event_ticket', entity: 'event_order', entityId: result.orderId, ip: getClientIP(req) });
        res.json({ success: true, orderId: result.orderId, tickets: result.tickets, message: `${quantity} ingresso(s) adquirido(s)!` });
    } catch (err) {
        console.error('Erro comprar ingresso:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.get('/events/orders', auth, (req, res) => {
    const db = getDB();
    const orders = db.prepare(`
        SELECT eo.*, e.title as event_title, e.date as event_date, e.time as event_time, e.type as event_type, e.location as event_location
        FROM event_orders eo
        JOIN events e ON e.id = eo.event_id
        WHERE eo.user_id = ?
        ORDER BY eo.created_at DESC
    `).all(req.user.id);
    res.json(orders);
});

router.get('/events/tickets', auth, (req, res) => {
    const db = getDB();
    const tickets = db.prepare(`
        SELECT et.*, e.title as event_title, e.date as event_date, e.time as event_time, e.type as event_type, e.location as event_location
        FROM event_tickets et
        JOIN events e ON e.id = et.event_id
        WHERE et.user_id = ?
        ORDER BY et.created_at DESC
    `).all(req.user.id);
    res.json(tickets);
});

// ════════════════════════════════════
//   NETWORK CLIENTS
// ════════════════════════════════════

router.get('/network/clients', auth, (req, res) => {
    const db = getDB();

    // Get all users in the network (direct + indirect) who have purchased packages
    function getNetworkClients(uid) {
        const children = db.prepare('SELECT * FROM users WHERE sponsor_id = ?').all(uid);
        let clients = [];
        for (const c of children) {
            const packages = db.prepare("SELECT COUNT(*) as c FROM user_packages WHERE user_id = ? AND status = 'ativo'").get(c.id);
            const { password, financial_password, totp_secret, ...safe } = c;
            safe.active_packages = packages.c;
            safe.is_client = packages.c > 0;
            clients.push(safe);
            clients = clients.concat(getNetworkClients(c.id));
        }
        return clients;
    }

    const allNetwork = getNetworkClients(req.user.id);
    const clients = allNetwork.filter(c => c.is_client);
    res.json({ clients, total: allNetwork.length, totalClients: clients.length });
});

// ════════════════════════════════════
//   GRADUATION REPORT
// ════════════════════════════════════

router.get('/graduation', auth, (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT id, level, points FROM users WHERE id = ?').get(req.user.id);
    const history = db.prepare('SELECT * FROM level_history WHERE user_id = ? ORDER BY created_at ASC').all(req.user.id);
    const levels = db.prepare('SELECT * FROM levels ORDER BY min_points ASC').all();

    const currentIdx = levels.findIndex(l => l.key === user.level);
    const currentLevel = currentIdx >= 0 ? levels[currentIdx] : levels[0];
    const nextLevel = currentIdx < levels.length - 1 ? levels[currentIdx + 1] : null;
    const range = nextLevel ? (nextLevel.min_points - currentLevel.min_points) : 1;
    const progressPoints = user.points - currentLevel.min_points;

    res.json({
        currentLevel: user.level,
        points: user.points,
        levels: levels.map(l => ({
            key: l.key, name: l.name, minPoints: l.min_points, color: l.color, icon: l.icon,
            achieved: user.points >= l.min_points
        })),
        nextLevel: nextLevel ? { key: nextLevel.key, name: nextLevel.name, minPoints: nextLevel.min_points, pointsNeeded: Math.max(0, nextLevel.min_points - user.points) } : null,
        progress: nextLevel ? Math.min(100, (progressPoints / range) * 100) : 100,
        history
    });
});

module.exports = router;
