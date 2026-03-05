/* ═══════════════════════════════════════════
   Credbusiness — Payments Route (Asaas Gateway)
   PIX / Boleto / Cartão + Webhook + Status
   ═══════════════════════════════════════════ */

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { getDB } = require('../database/init');
const asaas = require('../utils/asaas');
const { logAudit } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');

// Utility
function getClientIP(req) { return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip; }
function sanitize(s) { return (s || '').replace(/[<>"'`;]/g, '').trim(); }

// ════════════════════════════════════
//   PAGAMENTO DE PACOTE
// ════════════════════════════════════

/**
 * POST /api/payments/package/:packageId
 * Gera cobrança para compra de pacote
 * Body: { method: 'pix'|'boleto'|'credit_card', creditCard?, creditCardHolderInfo? }
 */
router.post('/package/:packageId', auth, async (req, res) => {
    try {
        const db = getDB();
        const { method } = req.body;
        const packageId = Number(req.params.packageId);

        if (!['pix', 'boleto', 'credit_card'].includes(method)) {
            return res.status(400).json({ error: 'Método de pagamento inválido. Use: pix, boleto ou credit_card' });
        }

        // Buscar pacote
        const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND active = 1').get(packageId);
        if (!pkg) return res.status(404).json({ error: 'Pacote não encontrado' });

        // Buscar usuário
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Verificar se Asaas está configurado
        if (!asaas.isConfigured()) {
            // Modo fallback — debitar do saldo interno (sandbox/dev)
            return handleFallbackPurchase(db, req, res, user, pkg);
        }

        // ── Buscar/criar cliente no Asaas ──
        const customer = await asaas.getOrCreateCustomer(user);
        if (!customer) {
            return res.status(500).json({ error: 'Erro ao registrar cliente no gateway de pagamento. Verifique seu CPF.' });
        }

        // Salvar asaas_customer_id no usuário
        if (!user.asaas_customer_id || user.asaas_customer_id !== customer.id) {
            db.prepare('UPDATE users SET asaas_customer_id = ? WHERE id = ?').run(customer.id, user.id);
        }

        // ── Criar cobrança no Asaas ──
        const billingType = method === 'pix' ? 'PIX' : method === 'boleto' ? 'BOLETO' : 'CREDIT_CARD';
        const paymentParams = {
            customerId: customer.id,
            value: pkg.price,
            billingType,
            description: `Pacote ${pkg.name} - Credbusiness`,
            externalReference: `package_${pkg.id}_user_${user.id}`
        };

        // Dados do cartão de crédito
        if (method === 'credit_card') {
            if (!req.body.creditCard || !req.body.creditCardHolderInfo) {
                return res.status(400).json({ error: 'Dados do cartão de crédito são obrigatórios' });
            }
            paymentParams.creditCard = req.body.creditCard;
            paymentParams.creditCardHolderInfo = req.body.creditCardHolderInfo;
        }

        const payment = await asaas.createPayment(paymentParams);

        // ── Salvar pagamento no banco local ──
        db.prepare(`INSERT INTO payments (user_id, asaas_payment_id, asaas_customer_id, type, reference_id, amount, method, status, invoice_url, external_reference, due_date, created_at)
            VALUES (?, ?, ?, 'package', ?, ?, ?, 'pendente', ?, ?, ?, datetime('now'))`)
            .run(user.id, payment.id, customer.id, pkg.id, pkg.price, method, payment.invoiceUrl || '', paymentParams.externalReference, payment.dueDate);

        // Registrar compra de pacote como pendente
        db.prepare(`INSERT INTO user_packages (user_id, package_id, purchased_at, status, payment_status)
            VALUES (?, ?, date('now'), 'pendente', 'pendente')`)
            .run(user.id, pkg.id);

        logAudit({ userType: 'user', userId: user.id, action: 'payment_created', entity: 'payment', details: { packageId: pkg.id, method, asaasId: payment.id, value: pkg.price }, ip: getClientIP(req) });

        // ── Retornar dados de pagamento para o frontend ──
        const response = {
            success: true,
            paymentId: payment.id,
            status: payment.status,
            invoiceUrl: payment.invoiceUrl,
            value: payment.value,
            dueDate: payment.dueDate,
            method
        };

        // Se PIX, buscar QR Code
        if (method === 'pix') {
            const pix = await asaas.getPixQrCode(payment.id);
            if (pix) {
                response.pix = {
                    qrCodeImage: pix.encodedImage, // base64
                    copyPaste: pix.payload,
                    expirationDate: pix.expirationDate
                };
                // Salvar no banco
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

        // Se cartão, pagamento já pode ter sido aprovado
        if (method === 'credit_card' && (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED')) {
            // Cartão aprovado instantaneamente → ativar pacote
            activatePackage(db, user.id, pkg);
            response.approved = true;
            response.message = 'Pagamento aprovado! Pacote ativado.';
        }

        res.json(response);
    } catch (err) {
        console.error('Erro pagamento pacote:', err.message);
        res.status(500).json({ error: err.message || 'Erro ao processar pagamento' });
    }
});

// ════════════════════════════════════
//   PAGAMENTO DE PLANO (Assinatura)
// ════════════════════════════════════

/**
 * POST /api/payments/plan/:planId
 * Gera cobrança/assinatura para mudança de plano
 * Body: { method: 'pix'|'boleto'|'credit_card', creditCard?, creditCardHolderInfo? }
 */
router.post('/plan/:planId', auth, async (req, res) => {
    try {
        const db = getDB();
        const { method } = req.body;
        const planId = sanitize(req.params.planId);

        if (!['pix', 'boleto', 'credit_card'].includes(method)) {
            return res.status(400).json({ error: 'Método de pagamento inválido' });
        }

        // Buscar plano
        const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
        if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });
        if (plan.price <= 0) {
            // Plano gratuito — ativar direto
            db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(planId, req.user.id);
            return res.json({ success: true, approved: true, message: 'Plano alterado com sucesso!' });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        if (!asaas.isConfigured()) {
            // Fallback — sem gateway
            db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(planId, user.id);
            return res.json({ success: true, approved: true, message: 'Plano alterado (modo teste)' });
        }

        // Buscar/criar cliente Asaas
        const customer = await asaas.getOrCreateCustomer(user);
        if (!customer) return res.status(500).json({ error: 'Erro ao registrar no gateway. Verifique seu CPF.' });

        if (!user.asaas_customer_id || user.asaas_customer_id !== customer.id) {
            db.prepare('UPDATE users SET asaas_customer_id = ? WHERE id = ?').run(customer.id, user.id);
        }

        // Criar cobrança única (ou assinatura)
        const billingType = method === 'pix' ? 'PIX' : method === 'boleto' ? 'BOLETO' : 'CREDIT_CARD';
        const paymentParams = {
            customerId: customer.id,
            value: plan.price,
            billingType,
            description: `Plano ${plan.name} - Credbusiness`,
            externalReference: `plan_${plan.id}_user_${user.id}`
        };

        if (method === 'credit_card') {
            if (!req.body.creditCard || !req.body.creditCardHolderInfo) {
                return res.status(400).json({ error: 'Dados do cartão são obrigatórios' });
            }
            paymentParams.creditCard = req.body.creditCard;
            paymentParams.creditCardHolderInfo = req.body.creditCardHolderInfo;
        }

        const payment = await asaas.createPayment(paymentParams);

        // Salvar pagamento
        db.prepare(`INSERT INTO payments (user_id, asaas_payment_id, asaas_customer_id, type, reference_id, amount, method, status, invoice_url, external_reference, due_date, created_at)
            VALUES (?, ?, ?, 'plan', ?, ?, ?, 'pendente', ?, ?, ?, datetime('now'))`)
            .run(user.id, payment.id, customer.id, 0, plan.price, method, payment.invoiceUrl || '', paymentParams.externalReference, payment.dueDate);

        logAudit({ userType: 'user', userId: user.id, action: 'plan_payment_created', entity: 'payment', details: { planId, method, asaasId: payment.id, value: plan.price }, ip: getClientIP(req) });

        const response = {
            success: true,
            paymentId: payment.id,
            status: payment.status,
            invoiceUrl: payment.invoiceUrl,
            value: payment.value,
            dueDate: payment.dueDate,
            method
        };

        if (method === 'pix') {
            const pix = await asaas.getPixQrCode(payment.id);
            if (pix) {
                response.pix = { qrCodeImage: pix.encodedImage, copyPaste: pix.payload, expirationDate: pix.expirationDate };
                db.prepare('UPDATE payments SET pix_qr_code = ?, pix_copy_paste = ? WHERE asaas_payment_id = ?')
                    .run(pix.encodedImage, pix.payload, payment.id);
            }
        }

        if (method === 'boleto') {
            const boleto = await asaas.getBoletoInfo(payment.id);
            if (boleto) {
                response.boleto = { identificationField: boleto.identificationField, barCode: boleto.barCode, bankSlipUrl: payment.bankSlipUrl || payment.invoiceUrl };
            }
        }

        if (method === 'credit_card' && (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED')) {
            db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(planId, user.id);
            db.prepare("UPDATE payments SET status = 'pago', paid_at = datetime('now') WHERE asaas_payment_id = ?").run(payment.id);
            response.approved = true;
            response.message = 'Pagamento aprovado! Plano ativado.';
        }

        res.json(response);
    } catch (err) {
        console.error('Erro pagamento plano:', err.message);
        res.status(500).json({ error: err.message || 'Erro ao processar pagamento' });
    }
});

// ════════════════════════════════════
//   CONSULTAR STATUS DO PAGAMENTO
// ════════════════════════════════════

/**
 * GET /api/payments/:paymentId/status
 * Consulta o status atualizado de um pagamento
 */
router.get('/:paymentId/status', auth, async (req, res) => {
    try {
        const db = getDB();
        const asaasPaymentId = sanitize(req.params.paymentId);

        // Buscar no banco local
        const localPayment = db.prepare('SELECT * FROM payments WHERE asaas_payment_id = ? AND user_id = ?')
            .get(asaasPaymentId, req.user.id);
        if (!localPayment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        if (!asaas.isConfigured()) {
            return res.json({ success: true, status: localPayment.status, method: localPayment.method, amount: localPayment.amount });
        }

        // Consultar Asaas
        const asaasPayment = await asaas.getPaymentStatus(asaasPaymentId);
        if (asaasPayment) {
            const newStatus = asaas.mapPaymentStatus(asaasPayment.status);
            if (newStatus !== localPayment.status) {
                db.prepare('UPDATE payments SET status = ? WHERE asaas_payment_id = ?').run(newStatus, asaasPaymentId);
                // Se confirmou, ativar
                if (newStatus === 'pago' && localPayment.status !== 'pago') {
                    processPaymentConfirmed(db, localPayment);
                }
            }
            return res.json({
                success: true,
                status: newStatus,
                asaasStatus: asaasPayment.status,
                method: localPayment.method,
                amount: localPayment.amount,
                invoiceUrl: asaasPayment.invoiceUrl,
                confirmedDate: asaasPayment.confirmedDate
            });
        }

        res.json({ success: true, status: localPayment.status, method: localPayment.method, amount: localPayment.amount });
    } catch (err) {
        console.error('Erro consultar status:', err.message);
        res.status(500).json({ error: 'Erro ao consultar status do pagamento' });
    }
});

// ════════════════════════════════════
//   LISTAR MEUS PAGAMENTOS
// ════════════════════════════════════

router.get('/my', auth, (req, res) => {
    try {
        const db = getDB();
        const payments = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
            .all(req.user.id);
        res.json({ success: true, payments });
    } catch (err) {
        console.error('Erro listar pagamentos:', err.message);
        res.status(500).json({ error: 'Erro ao listar pagamentos' });
    }
});

// ════════════════════════════════════
//   PIX QR CODE (re-buscar)
// ════════════════════════════════════

router.get('/:paymentId/pix', auth, async (req, res) => {
    try {
        const db = getDB();
        const asaasPaymentId = sanitize(req.params.paymentId);

        const localPayment = db.prepare('SELECT * FROM payments WHERE asaas_payment_id = ? AND user_id = ?')
            .get(asaasPaymentId, req.user.id);
        if (!localPayment) return res.status(404).json({ error: 'Pagamento não encontrado' });

        // Se já tem em cache
        if (localPayment.pix_qr_code && localPayment.pix_copy_paste) {
            return res.json({ success: true, qrCodeImage: localPayment.pix_qr_code, copyPaste: localPayment.pix_copy_paste });
        }

        if (!asaas.isConfigured()) return res.status(400).json({ error: 'Gateway não configurado' });

        const pix = await asaas.getPixQrCode(asaasPaymentId);
        if (pix) {
            db.prepare('UPDATE payments SET pix_qr_code = ?, pix_copy_paste = ? WHERE asaas_payment_id = ?')
                .run(pix.encodedImage, pix.payload, asaasPaymentId);
            return res.json({ success: true, qrCodeImage: pix.encodedImage, copyPaste: pix.payload });
        }

        res.status(404).json({ error: 'QR Code não disponível' });
    } catch (err) {
        console.error('Erro buscar PIX QR:', err.message);
        res.status(500).json({ error: 'Erro ao buscar QR Code PIX' });
    }
});

// ════════════════════════════════════
//   WEBHOOK — Notificação do Asaas
// ════════════════════════════════════

/**
 * POST /api/payments/webhook
 * Recebe notificações do Asaas sobre mudanças de status
 * NÃO requer autenticação JWT (vem do Asaas)
 */
router.post('/webhook', async (req, res) => {
    try {
        // Validar token do webhook
        const webhookToken = req.headers['asaas-access-token'] || req.query.token;
        if (!asaas.validateWebhookToken(webhookToken)) {
            console.warn('[Webhook] Token inválido recebido');
            return res.status(401).json({ error: 'Token inválido' });
        }

        const { event, payment: asaasPayment, transfer: asaasTransfer } = req.body;
        console.log(`[Webhook] Evento: ${event}`, asaasPayment?.id || asaasTransfer?.id || '');

        const db = getDB();

        // ── Eventos de Pagamento ──
        if (event && event.startsWith('PAYMENT_') && asaasPayment) {
            const localPayment = db.prepare('SELECT * FROM payments WHERE asaas_payment_id = ?')
                .get(asaasPayment.id);

            if (!localPayment) {
                console.warn(`[Webhook] Pagamento ${asaasPayment.id} não encontrado localmente`);
                return res.json({ received: true });
            }

            const newStatus = asaas.mapPaymentStatus(asaasPayment.status);
            const oldStatus = localPayment.status;

            // Atualizar status local
            db.prepare('UPDATE payments SET status = ?, updated_at = datetime(\'now\') WHERE asaas_payment_id = ?')
                .run(newStatus, asaasPayment.id);

            // ── Pagamento Confirmado ──
            if ((event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') && oldStatus !== 'pago') {
                db.prepare("UPDATE payments SET status = 'pago', paid_at = datetime('now') WHERE asaas_payment_id = ?")
                    .run(asaasPayment.id);
                processPaymentConfirmed(db, localPayment);
            }

            // ── Pagamento Estornado ──
            if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_DELETED') {
                processPaymentRefunded(db, localPayment);
            }

            // ── Pagamento Vencido ──
            if (event === 'PAYMENT_OVERDUE') {
                createNotification(db, localPayment.user_id, 'payment', 'Pagamento vencido',
                    `Seu pagamento de R$ ${localPayment.amount.toFixed(2)} venceu. Gere uma nova cobrança.`);
            }

            logAudit({ userType: 'system', userId: 0, action: 'webhook_payment', entity: 'payment',
                details: { event, asaasId: asaasPayment.id, status: newStatus, userId: localPayment.user_id } });
        }

        // ── Eventos de Transferência (Payout) ──
        if (event && event.startsWith('TRANSFER_') && asaasTransfer) {
            const localPayment = db.prepare("SELECT * FROM payments WHERE asaas_payment_id = ? AND type = 'withdraw'")
                .get(asaasTransfer.id);

            if (localPayment) {
                const newStatus = asaas.mapTransferStatus(asaasTransfer.status);
                db.prepare('UPDATE payments SET status = ?, updated_at = datetime(\'now\') WHERE asaas_payment_id = ?')
                    .run(newStatus, asaasTransfer.id);

                if (event === 'TRANSFER_DONE') {
                    // Saque concluído com sucesso
                    db.prepare("UPDATE transactions SET status = 'concluido' WHERE reference_type = 'payment' AND reference_id = ?")
                        .run(localPayment.id);
                    createNotification(db, localPayment.user_id, 'financial', 'Saque concluído!',
                        `Sua transferência PIX de R$ ${localPayment.amount.toFixed(2)} foi concluída com sucesso.`);
                }

                if (event === 'TRANSFER_FAILED' || event === 'TRANSFER_CANCELLED') {
                    // Saque falhou — devolver saldo
                    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(localPayment.amount, localPayment.user_id);
                    db.prepare("UPDATE transactions SET status = 'falhou' WHERE reference_type = 'payment' AND reference_id = ?")
                        .run(localPayment.id);
                    createNotification(db, localPayment.user_id, 'financial', 'Saque falhou',
                        `A transferência PIX de R$ ${localPayment.amount.toFixed(2)} falhou. O valor foi devolvido ao seu saldo.`);
                }

                logAudit({ userType: 'system', userId: 0, action: 'webhook_transfer', entity: 'payment',
                    details: { event, asaasId: asaasTransfer.id, status: newStatus, userId: localPayment.user_id } });
            }
        }

        res.json({ received: true });
    } catch (err) {
        console.error('[Webhook] Erro:', err.message);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// ════════════════════════════════════
//   ADMIN — Listar pagamentos
// ════════════════════════════════════

const { adminOnly } = require('../middleware/auth');

router.get('/admin/all', auth, adminOnly, (req, res) => {
    try {
        const db = getDB();
        const { status, type, method, userId, page = 1, limit = 50 } = req.query;
        let sql = 'SELECT p.*, u.name as user_name, u.username FROM payments p LEFT JOIN users u ON p.user_id = u.id WHERE 1=1';
        const params = [];

        if (status) { sql += ' AND p.status = ?'; params.push(status); }
        if (type) { sql += ' AND p.type = ?'; params.push(type); }
        if (method) { sql += ' AND p.method = ?'; params.push(method); }
        if (userId) { sql += ' AND p.user_id = ?'; params.push(Number(userId)); }

        sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), (Number(page) - 1) * Number(limit));

        const payments = db.prepare(sql).all(...params);
        const total = db.prepare('SELECT COUNT(*) as cnt FROM payments').get().cnt;

        res.json({ success: true, payments, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
        console.error('Erro admin listar pagamentos:', err.message);
        res.status(500).json({ error: 'Erro ao listar pagamentos' });
    }
});

// Admin — Consultar saldo Asaas
router.get('/admin/balance', auth, adminOnly, async (req, res) => {
    try {
        if (!asaas.isConfigured()) return res.json({ balance: 0, message: 'Gateway não configurado' });
        const balance = await asaas.getBalance();
        res.json({ success: true, ...balance });
    } catch (err) {
        console.error('Erro consultar saldo:', err.message);
        res.status(500).json({ error: 'Erro ao consultar saldo' });
    }
});

// ════════════════════════════════════
//   FUNÇÕES AUXILIARES
// ════════════════════════════════════

/**
 * Processar pagamento confirmado — ativar compra
 */
function processPaymentConfirmed(db, localPayment) {
    if (localPayment.type === 'package') {
        const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(localPayment.reference_id);
        if (pkg) {
            activatePackage(db, localPayment.user_id, pkg);
        }
    }

    if (localPayment.type === 'plan') {
        // Extrair planId da external_reference: plan_basico_user_1
        const ref = localPayment.external_reference || '';
        const match = ref.match(/^plan_(.+?)_user_/);
        if (match) {
            const planId = match[1];
            db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(planId, localPayment.user_id);
            createNotification(db, localPayment.user_id, 'plan', 'Plano ativado!',
                `Seu plano foi ativado com sucesso. Aproveite todos os benefícios!`);
        }
    }

    // Registrar transação de crédito
    db.prepare(`INSERT INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status)
        VALUES (?, 'pagamento', ?, ?, 'payment', ?, date('now'), 'concluido')`)
        .run(localPayment.user_id, localPayment.amount,
            `Pagamento ${localPayment.type === 'package' ? 'pacote' : 'plano'} via ${localPayment.method}`,
            localPayment.id);
}

/**
 * Ativar pacote comprado
 */
function activatePackage(db, userId, pkg) {
    // Adicionar pontos ao usuário
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(pkg.points, userId);

    // Atualizar status do user_package
    db.prepare(`UPDATE user_packages SET status = 'ativo', payment_status = 'pago'
        WHERE user_id = ? AND package_id = ? AND payment_status = 'pendente'
        ORDER BY id DESC LIMIT 1`)
        .run(userId, pkg.id);

    // Notificação
    createNotification(db, userId, 'purchase', 'Pacote ativado!',
        `Seu pacote "${pkg.name}" foi ativado. +${pkg.points} pontos adicionados!`);

    // Processar comissões de rede
    processNetworkCommissions(db, userId, pkg.price, `Comissão venda pacote ${pkg.name}`);
}

/**
 * Processar estorno de pagamento
 */
function processPaymentRefunded(db, localPayment) {
    if (localPayment.type === 'package') {
        const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(localPayment.reference_id);
        if (pkg) {
            // Remover pontos
            db.prepare('UPDATE users SET points = MAX(0, points - ?) WHERE id = ?').run(pkg.points, localPayment.user_id);
            db.prepare(`UPDATE user_packages SET status = 'estornado', payment_status = 'estornado'
                WHERE user_id = ? AND package_id = ? AND payment_status = 'pago'
                ORDER BY id DESC LIMIT 1`)
                .run(localPayment.user_id, pkg.id);
        }
    }
    createNotification(db, localPayment.user_id, 'financial', 'Pagamento estornado',
        `O pagamento de R$ ${localPayment.amount.toFixed(2)} foi estornado.`);
}

/**
 * Processar comissões da rede MLM (3 níveis)
 */
function processNetworkCommissions(db, userId, saleAmount, description) {
    try {
        const settings = {};
        db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });

        const commissionRates = [
            Number(settings.commissionLevel1) || 10,
            Number(settings.commissionLevel2) || 5,
            Number(settings.commissionLevel3) || 3
        ];

        let currentUserId = userId;
        for (let level = 0; level < 3; level++) {
            const user = db.prepare('SELECT sponsor_id FROM users WHERE id = ?').get(currentUserId);
            if (!user || !user.sponsor_id) break;

            const sponsorId = user.sponsor_id;
            const commission = (saleAmount * commissionRates[level]) / 100;

            if (commission > 0) {
                // Creditar comissão ao patrocinador
                db.prepare('UPDATE users SET balance = balance + ?, bonus = bonus + ? WHERE id = ?')
                    .run(commission, commission, sponsorId);

                db.prepare(`INSERT INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status)
                    VALUES (?, 'comissao', ?, ?, 'commission', ?, date('now'), 'creditado')`)
                    .run(sponsorId, commission, `${description} (Nível ${level + 1})`, userId);

                createNotification(db, sponsorId, 'financial', 'Comissão recebida!',
                    `Você recebeu R$ ${commission.toFixed(2)} de comissão nível ${level + 1}.`);
            }

            currentUserId = sponsorId;
        }
    } catch (err) {
        console.error('Erro processar comissões:', err.message);
    }
}

/**
 * Fallback — comprar pacote sem gateway (modo sandbox/dev)
 */
function handleFallbackPurchase(db, req, res, user, pkg) {
    if (user.balance < pkg.price) {
        return res.status(400).json({ error: `Saldo insuficiente. Seu saldo: R$ ${user.balance.toFixed(2)}` });
    }

    const purchase = db.transaction(() => {
        db.prepare('UPDATE users SET balance = balance - ?, points = points + ? WHERE id = ?')
            .run(pkg.price, pkg.points, user.id);
        db.prepare(`INSERT INTO user_packages (user_id, package_id, purchased_at, status, payment_status)
            VALUES (?, ?, date('now'), 'ativo', 'pago')`)
            .run(user.id, pkg.id);
        db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status)
            VALUES (?, 'compra', ?, ?, date('now'), 'concluido')`)
            .run(user.id, -pkg.price, `Compra pacote: ${pkg.name}`);
    });

    purchase();
    processNetworkCommissions(db, user.id, pkg.price, `Comissão venda pacote ${pkg.name}`);

    logAudit({ userType: 'user', userId: user.id, action: 'package_purchase_fallback', entity: 'package',
        details: { packageId: pkg.id, value: pkg.price }, ip: getClientIP(req) });

    res.json({ success: true, approved: true, message: `Pacote ${pkg.name} ativado! +${pkg.points} pontos` });
}

module.exports = router;
