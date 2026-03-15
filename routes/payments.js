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
//   PACOTE PERSONALIZADO (quantidade customizada de nomes)
// ════════════════════════════════════

/**
 * POST /api/payments/package/custom
 * Gera cobrança para pacote com quantidade personalizada de nomes
 * Body: { names_count, method, creditCard?, creditCardHolderInfo? }
 */
router.post('/package/custom', auth, async (req, res) => {
    try {
        const db = getDB();
        const { names_count, method } = req.body;
        const count = Number(names_count);

        if (!count || !Number.isInteger(count) || count < 1 || count > 100) {
            return res.status(400).json({ error: 'Quantidade de nomes inválida (1-100)' });
        }
        if (!['pix', 'boleto', 'credit_card'].includes(method)) {
            return res.status(400).json({ error: 'Método de pagamento inválido' });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Calcular preço por nome baseado no nível
        const RATE_PER_NAME = { diamante: 130, ouro: 160, prata: 190, bronze: 220, start: 250 };
        const rate = RATE_PER_NAME[user.level] || 250;
        const totalPrice = Math.round(rate * count * 100) / 100;
        const points = Math.round(count * 50);

        // Criar pacote temporário na tabela
        const pkgResult = db.prepare('INSERT INTO packages (name, price, points, description, level_key, names_count, active) VALUES (?,?,?,?,?,?,1)')
            .run(`${count} Nomes (Personalizado)`, totalPrice, points, `Pacote personalizado ${count} nomes — Nível ${user.level}`, user.level, count);
        const pkgId = pkgResult.lastInsertRowid;
        const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(pkgId);

        if (!asaas.isConfigured()) {
            return res.status(503).json({ error: 'Sistema de pagamento não configurado. Entre em contato com o suporte.' });
        }

        // Buscar/criar cliente Asaas
        if (!user.cpf || user.cpf.replace(/\D/g, '').length < 11) {
            return res.status(400).json({ error: 'CPF não cadastrado. Acesse Configurações e preencha seu CPF antes de comprar.' });
        }
        let customer;
        try { customer = await asaas.getOrCreateCustomer(user); }
        catch (e) {
            if (e.code === 'ASAAS_AUTH') return res.status(503).json({ error: 'Sistema de pagamento temporariamente indisponível. Tente novamente mais tarde.' });
            return res.status(400).json({ error: 'Erro ao processar dados de pagamento. Tente novamente.' });
        }
        if (!customer) return res.status(400).json({ error: 'CPF/CNPJ inválido. Atualize em Configurações.' });

        if (!user.asaas_customer_id || user.asaas_customer_id !== customer.id) {
            db.prepare('UPDATE users SET asaas_customer_id = ? WHERE id = ?').run(customer.id, user.id);
        }

        const billingType = method === 'pix' ? 'PIX' : method === 'boleto' ? 'BOLETO' : 'CREDIT_CARD';
        const paymentParams = {
            customerId: customer.id,
            value: totalPrice,
            billingType,
            description: `Pacote ${count} Nomes - Credbusiness`,
            externalReference: `package_${pkgId}_user_${user.id}`
        };
        if (method === 'credit_card') {
            if (!req.body.creditCard || !req.body.creditCardHolderInfo) {
                return res.status(400).json({ error: 'Dados do cartão são obrigatórios' });
            }
            paymentParams.creditCard = req.body.creditCard;
            paymentParams.creditCardHolderInfo = req.body.creditCardHolderInfo;
        }

        const payment = await asaas.createPayment(paymentParams);

        db.prepare(`INSERT INTO payments (user_id, asaas_payment_id, asaas_customer_id, type, reference_id, amount, method, status, invoice_url, external_reference, due_date, created_at)
            VALUES (?, ?, ?, 'package', ?, ?, ?, 'pendente', ?, ?, ?, datetime('now'))`)
            .run(user.id, payment.id, customer.id, pkgId, totalPrice, method, payment.invoiceUrl || '', paymentParams.externalReference, payment.dueDate);

        db.prepare(`INSERT INTO user_packages (user_id, package_id, purchased_at, status, payment_status, payment_method)
            VALUES (?, ?, date('now'), 'pendente', 'pendente', ?)`)
            .run(user.id, pkgId, method);

        const response = { success: true, paymentId: payment.id, status: payment.status, invoiceUrl: payment.invoiceUrl, value: payment.value, dueDate: payment.dueDate, method };

        if (method === 'pix') {
            const pix = await asaas.getPixQrCode(payment.id);
            if (pix) {
                response.pix = { qrCodeImage: pix.encodedImage, copyPaste: pix.payload, expirationDate: pix.expirationDate };
                db.prepare('UPDATE payments SET pix_qr_code = ?, pix_copy_paste = ? WHERE asaas_payment_id = ?').run(pix.encodedImage, pix.payload, payment.id);
            }
        }
        if (method === 'boleto') {
            const boleto = await asaas.getBoletoInfo(payment.id);
            if (boleto) response.boleto = { identificationField: boleto.identificationField, barCode: boleto.barCode };
        }
        if (method === 'credit_card' && (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED')) {
            activatePackage(db, user.id, pkg);
            response.approved = true;
            response.message = 'Pagamento aprovado! Pacote ativado.';
        }

        res.json(response);
    } catch (err) {
        console.error('Erro pacote personalizado:', err.message);
        res.status(500).json({ error: 'Erro ao processar pagamento' });
    }
});

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

        // Validar que o pacote é do nível do usuário
        if (pkg.level_key && pkg.level_key !== user.level) {
            return res.status(403).json({ error: 'Este pacote não está disponível para o seu nível.' });
        }

        // Verificar se Asaas está configurado
        if (!asaas.isConfigured()) {
            return res.status(503).json({ error: 'Sistema de pagamento não configurado. Entre em contato com o suporte.' });
        }

        // ── Buscar/criar cliente no Asaas ──
        if (!user.cpf || user.cpf.replace(/\D/g, '').length < 11) {
            return res.status(400).json({ error: 'CPF não cadastrado. Acesse Configurações e preencha seu CPF antes de comprar.' });
        }
        let customer;
        try {
            customer = await asaas.getOrCreateCustomer(user);
        } catch (custErr) {
            console.error('Erro Asaas customer:', custErr.message);
            if (custErr.code === 'ASAAS_AUTH') return res.status(503).json({ error: 'Sistema de pagamento temporariamente indisponível. Tente novamente mais tarde.' });
            return res.status(400).json({ error: 'Erro ao processar dados de pagamento. Tente novamente.' });
        }
        if (!customer) {
            return res.status(400).json({ error: 'CPF/CNPJ inválido. Atualize seus dados em Configurações.' });
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
        db.prepare(`INSERT INTO user_packages (user_id, package_id, purchased_at, status, payment_status, payment_method)
            VALUES (?, ?, date('now'), 'pendente', 'pendente', ?)`)
            .run(user.id, pkg.id, method);

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
        const isAsaasError = err.message && (err.message.includes('CPF') || err.message.includes('CNPJ') || err.message.includes('inválido') || err.message.includes('400'));
        const status = isAsaasError ? 400 : 500;
        const msg = isAsaasError ? 'Verifique seus dados cadastrais (CPF/CNPJ) nas Configurações.' : 'Erro ao processar pagamento';
        res.status(status).json({ error: msg });
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
        if (!customer) return res.status(400).json({ error: 'Não foi possível registrar no gateway. Verifique se seu CPF/CNPJ está correto nas Configurações.' });

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
        const isAsaasError = err.message && (err.message.includes('CPF') || err.message.includes('CNPJ') || err.message.includes('inválido') || err.message.includes('400'));
        const status = isAsaasError ? 400 : 500;
        const msg = isAsaasError ? 'Verifique seus dados cadastrais (CPF/CNPJ) nas Configurações.' : 'Erro ao processar pagamento';
        res.status(status).json({ error: msg });
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
//   MENSALIDADE (R$ 95,00/mês)
// ════════════════════════════════════

/**
 * GET /api/payments/monthly-fee/status
 * Retorna status da mensalidade do usuário
 */
router.get('/monthly-fee/status', auth, (req, res) => {
    try {
        const db = getDB();
        const user = db.prepare('SELECT monthly_fee_paid_until, access_blocked, has_package FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Sem pacote ativo = sem mensalidade (não exibir alerta)
        if (!user.has_package) {
            return res.json({ success: true, isPaid: true, paidUntil: null, daysUntilDue: null, accessBlocked: false, monthlyFeeValue: 0, noPackage: true });
        }

        const settings = {};
        db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });
        const monthlyFee = Number(settings.monthlyFee) || 95;

        const now = new Date();
        const paidUntil = user.monthly_fee_paid_until ? new Date(user.monthly_fee_paid_until) : null;
        const isPaid = paidUntil && paidUntil >= now;
        const daysUntilDue = paidUntil ? Math.ceil((paidUntil - now) / (1000 * 60 * 60 * 24)) : null;

        res.json({
            success: true,
            isPaid,
            paidUntil: user.monthly_fee_paid_until || null,
            daysUntilDue,
            accessBlocked: !!user.access_blocked,
            monthlyFeeValue: monthlyFee
        });
    } catch (err) {
        console.error('Erro status mensalidade:', err.message);
        res.status(500).json({ error: 'Erro interno' });
    }
});

/**
 * POST /api/payments/monthly-fee/pay
 * Gera cobrança para mensalidade
 * Body: { method }
 */
router.post('/monthly-fee/pay', auth, async (req, res) => {
    try {
        const db = getDB();
        const { method } = req.body;

        if (!['pix', 'boleto', 'credit_card'].includes(method)) {
            return res.status(400).json({ error: 'Método de pagamento inválido' });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const settings = {};
        db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });
        const monthlyFee = Number(settings.monthlyFee) || 95;

        // Verificar se já há pagamento de mensalidade pendente este mês
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const pendingFee = db.prepare(
            "SELECT id FROM payments WHERE user_id = ? AND type = 'monthly_fee' AND status IN ('pendente', 'processando') AND created_at >= ?"
        ).get(user.id, monthStart);
        if (pendingFee) {
            return res.status(400).json({ error: 'Já existe uma cobrança de mensalidade pendente para este mês.' });
        }

        if (!asaas.isConfigured()) {
            // Modo fallback — ativar diretamente (dev/sandbox)
            const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
            const paidUntilStr = nextMonth.toISOString().slice(0, 10);
            db.prepare('UPDATE users SET monthly_fee_paid_until = ?, access_blocked = 0 WHERE id = ?')
                .run(paidUntilStr, user.id);

            db.prepare(`INSERT INTO payments (user_id, type, amount, method, status, external_reference, created_at)
                VALUES (?, 'monthly_fee', ?, ?, 'pago', ?, datetime('now'))`)
                .run(user.id, monthlyFee, method, `monthly_fee_user_${user.id}`);

            db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status)
                VALUES (?, 'mensalidade', ?, 'Mensalidade mensal', date('now'), 'concluido')`)
                .run(user.id, -monthlyFee);

            createNotification(user.id, 'success', 'Mensalidade paga!',
                `Sua mensalidade de R$ ${monthlyFee.toFixed(2)} foi confirmada. Acesso liberado até ${paidUntilStr}.`);

            return res.json({ success: true, approved: true, message: 'Mensalidade paga com sucesso! Acesso liberado.' });
        }

        // Buscar/criar cliente Asaas
        if (!user.cpf || user.cpf.replace(/\D/g, '').length < 11) {
            return res.status(400).json({ error: 'CPF não cadastrado. Acesse Configurações e preencha seu CPF.' });
        }

        let customer;
        try { customer = await asaas.getOrCreateCustomer(user); }
        catch (e) {
            if (e.code === 'ASAAS_AUTH') return res.status(503).json({ error: 'Sistema de pagamento temporariamente indisponível. Tente novamente mais tarde.' });
            return res.status(400).json({ error: 'Erro ao processar dados de pagamento. Tente novamente.' });
        }
        if (!customer) return res.status(400).json({ error: 'CPF/CNPJ inválido.' });

        if (!user.asaas_customer_id || user.asaas_customer_id !== customer.id) {
            db.prepare('UPDATE users SET asaas_customer_id = ? WHERE id = ?').run(customer.id, user.id);
        }

        const billingType = method === 'pix' ? 'PIX' : method === 'boleto' ? 'BOLETO' : 'CREDIT_CARD';
        const paymentParams = {
            customerId: customer.id,
            value: monthlyFee,
            billingType,
            description: 'Mensalidade Credbusiness',
            externalReference: `monthly_fee_user_${user.id}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
        };

        if (method === 'credit_card') {
            if (!req.body.creditCard || !req.body.creditCardHolderInfo) {
                return res.status(400).json({ error: 'Dados do cartão são obrigatórios' });
            }
            paymentParams.creditCard = req.body.creditCard;
            paymentParams.creditCardHolderInfo = req.body.creditCardHolderInfo;
        }

        const payment = await asaas.createPayment(paymentParams);

        db.prepare(`INSERT INTO payments (user_id, asaas_payment_id, asaas_customer_id, type, amount, method, status, invoice_url, external_reference, due_date, created_at)
            VALUES (?, ?, ?, 'monthly_fee', ?, ?, 'pendente', ?, ?, ?, datetime('now'))`)
            .run(user.id, payment.id, customer.id, monthlyFee, method, payment.invoiceUrl || '', paymentParams.externalReference, payment.dueDate);

        const response = { success: true, paymentId: payment.id, status: payment.status, invoiceUrl: payment.invoiceUrl, value: payment.value, dueDate: payment.dueDate, method };

        if (method === 'pix') {
            try {
                const pix = await asaas.getPixQrCode(payment.id);
                if (pix) {
                    response.pixQrCode = pix.encodedImage;
                    response.pixCopyPaste = pix.payload;
                    db.prepare('UPDATE payments SET pix_qr_code = ?, pix_copy_paste = ? WHERE asaas_payment_id = ?')
                        .run(pix.encodedImage, pix.payload, payment.id);
                }
            } catch {}
        }

        logAudit({ userType: 'user', userId: user.id, action: 'monthly_fee_payment', entity: 'payment',
            details: { value: monthlyFee, method }, ip: getClientIP(req) });

        res.json(response);
    } catch (err) {
        console.error('Erro pagamento mensalidade:', err.message);
        res.status(500).json({ error: 'Erro ao processar pagamento da mensalidade' });
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

            // ── Pagamento Confirmado (verificar ANTES de atualizar status para idempotência) ──
            if ((event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') && oldStatus !== 'pago') {
                db.prepare("UPDATE payments SET status = 'pago', paid_at = datetime('now'), updated_at = datetime('now') WHERE asaas_payment_id = ? AND status != 'pago'")
                    .run(asaasPayment.id);
                processPaymentConfirmed(db, localPayment);
            } else {
                // Atualizar status local (para eventos que não são confirmação)
                db.prepare('UPDATE payments SET status = ?, updated_at = datetime(\'now\') WHERE asaas_payment_id = ?')
                    .run(newStatus, asaasPayment.id);
            }

            // ── Pagamento Estornado ──
            if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_DELETED') {
                processPaymentRefunded(db, localPayment);
            }

            // ── Pagamento Vencido ──
            if (event === 'PAYMENT_OVERDUE') {
                createNotification(localPayment.user_id, 'payment', 'Pagamento vencido',
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

                if (event === 'TRANSFER_DONE' && localPayment.status !== 'concluido') {
                    // Saque concluído com sucesso (idempotente)
                    const updated = db.prepare("UPDATE transactions SET status = 'concluido' WHERE reference_type = 'payment' AND reference_id = ? AND status != 'concluido'")
                        .run(localPayment.id);
                    if (updated.changes > 0) {
                        createNotification(localPayment.user_id, 'financial', 'Saque concluído!',
                            `Sua transferência PIX de R$ ${localPayment.amount.toFixed(2)} foi concluída com sucesso.`);
                    }
                }

                if ((event === 'TRANSFER_FAILED' || event === 'TRANSFER_CANCELLED') && localPayment.status !== 'falhou') {
                    // Saque falhou — devolver saldo (idempotente)
                    const updated = db.prepare("UPDATE transactions SET status = 'falhou' WHERE reference_type = 'payment' AND reference_id = ? AND status != 'falhou'")
                        .run(localPayment.id);
                    if (updated.changes > 0) {
                        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(localPayment.amount, localPayment.user_id);
                        createNotification(localPayment.user_id, 'financial', 'Saque falhou',
                            `A transferência PIX de R$ ${localPayment.amount.toFixed(2)} falhou. O valor foi devolvido ao seu saldo.`);
                    }
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
            createNotification(localPayment.user_id, 'plan', 'Plano ativado!',
                `Seu plano foi ativado com sucesso. Aproveite todos os benefícios!`);
        }
    }

    if (localPayment.type === 'deposit') {
        // Credit user balance
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(localPayment.amount, localPayment.user_id);
        createNotification(localPayment.user_id, 'success', 'Depósito confirmado!',
            `R$ ${localPayment.amount.toFixed(2)} foram creditados na sua carteira.`);
        // Register deposit transaction
        db.prepare(`INSERT INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status)
            VALUES (?, 'deposito', ?, 'Depósito confirmado', 'payment', ?, date('now'), 'concluido')`)
            .run(localPayment.user_id, localPayment.amount, localPayment.id);
        return; // Don't create duplicate transaction below
    }

    if (localPayment.type === 'monthly_fee') {
        // Ativar acesso — mensalidade paga por mais 30 dias
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        const paidUntilStr = nextMonth.toISOString().slice(0, 10);
        db.prepare('UPDATE users SET monthly_fee_paid_until = ?, access_blocked = 0 WHERE id = ?')
            .run(paidUntilStr, localPayment.user_id);

        db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status)
            VALUES (?, 'mensalidade', ?, 'Mensalidade mensal', date('now'), 'concluido')`)
            .run(localPayment.user_id, -localPayment.amount);

        createNotification(localPayment.user_id, 'success', 'Mensalidade paga!',
            `Sua mensalidade de R$ ${localPayment.amount.toFixed(2)} foi confirmada. Acesso liberado até ${paidUntilStr}.`);
        return;
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
    // Verificar se é o primeiro pacote (primeiro mês grátis)
    const userBefore = db.prepare('SELECT has_package FROM users WHERE id = ?').get(userId);
    const isFirstPackage = !userBefore || userBefore.has_package === 0;

    // Adicionar pontos e créditos de nomes ao usuário
    const namesCredit = pkg.names_count || 0;
    db.prepare('UPDATE users SET points = points + ?, names_available = names_available + ? WHERE id = ?').run(pkg.points, namesCredit, userId);

    // Ativar acesso ao painel + atualizar nível
    db.prepare('UPDATE users SET has_package = 1 WHERE id = ?').run(userId);

    // Primeiro pacote: mês atual grátis — mensalidade cobrada a partir do mês seguinte
    if (isFirstPackage) {
        const now = new Date();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0); // último dia do mês atual
        const freeUntilStr = endOfMonth.toISOString().split('T')[0];
        db.prepare('UPDATE users SET monthly_fee_paid_until = ?, access_blocked = 0, active = 1 WHERE id = ?')
            .run(freeUntilStr, userId);
    } else {
        // Pacotes subsequentes: apenas ativar conta (caso tenha sido desativada por admin)
        db.prepare('UPDATE users SET active = 1 WHERE id = ? AND active = 0 AND has_package = 0').run(userId);
    }
    if (pkg.level_key) {
        const LEVEL_ORDER = { start: 1, bronze: 2, prata: 3, ouro: 4, diamante: 5 };
        const user = db.prepare('SELECT level FROM users WHERE id = ?').get(userId);
        const newRank = LEVEL_ORDER[pkg.level_key] || 0;
        const currentRank = LEVEL_ORDER[user?.level] || 0;
        if (newRank > currentRank) {
            db.prepare('UPDATE users SET level = ? WHERE id = ?').run(pkg.level_key, userId);
        }
    }

    // Atualizar status do user_package
    db.prepare(`UPDATE user_packages SET status = 'ativo', payment_status = 'pago'
        WHERE user_id = ? AND package_id = ? AND payment_status = 'pendente'
        ORDER BY id DESC LIMIT 1`)
        .run(userId, pkg.id);

    // Notificação
    createNotification(userId, 'purchase', 'Pacote ativado!',
        `Seu pacote "${pkg.name}" foi ativado. +${pkg.points} pontos e ${namesCredit} nome(s) adicionados!`);

    // Verificar graduação automática por pontos
    checkAutoGraduation(db, userId);

    // Processar comissões multi-nível (% configurável)
    processNetworkCommissions(db, userId, pkg.price, `Comissão por indicação - ${pkg.name}`);
}

/**
 * Processar estorno de pagamento
 */
function processPaymentRefunded(db, localPayment) {
    if (localPayment.type === 'package') {
        const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(localPayment.reference_id);
        if (pkg) {
            // Remover pontos e créditos de nomes
            const namesCredit = pkg.names_count || 0;
            db.prepare('UPDATE users SET points = CASE WHEN points - ? < 0 THEN 0 ELSE points - ? END, names_available = CASE WHEN names_available - ? < 0 THEN 0 ELSE names_available - ? END WHERE id = ?')
                .run(pkg.points, pkg.points, namesCredit, namesCredit, localPayment.user_id);
            db.prepare(`UPDATE user_packages SET status = 'estornado', payment_status = 'estornado'
                WHERE user_id = ? AND package_id = ? AND payment_status = 'pago'
                ORDER BY id DESC LIMIT 1`)
                .run(localPayment.user_id, pkg.id);
        }
    }
    createNotification(localPayment.user_id, 'financial', 'Pagamento estornado',
        `O pagamento de R$ ${localPayment.amount.toFixed(2)} foi estornado.`);
}

/**
 * Processar comissões multi-nível (até 3 níveis) com % configurável
 * Sobe a árvore de patrocinadores creditando cada nível
 */
function processNetworkCommissions(db, userId, saleAmount, description) {
    try {
        const settings = {};
        db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });

        const commType = settings.commissionType || 'percentage'; // 'percentage' ou 'fixed'
        const commLevel1 = Number(settings.commissionLevel1) || 10;
        const commLevel2 = Number(settings.commissionLevel2) || 5;
        const commLevel3 = Number(settings.commissionLevel3) || 2;
        const fixedAmount = Number(settings.commissionFixedAmount) || 30;
        const levelPercents = [commLevel1, commLevel2, commLevel3];

        let currentUserId = userId;

        for (let level = 1; level <= 3; level++) {
            const current = db.prepare('SELECT sponsor_id FROM users WHERE id = ?').get(currentUserId);
            if (!current || !current.sponsor_id) break;

            const sponsor = db.prepare('SELECT id, active, name FROM users WHERE id = ?').get(current.sponsor_id);
            if (!sponsor || !sponsor.active) { currentUserId = current.sponsor_id; continue; }

            let commission = 0;
            if (commType === 'fixed') {
                commission = level === 1 ? fixedAmount : 0; // Fixo só para nível 1
            } else {
                commission = Math.round((saleAmount * levelPercents[level - 1] / 100) * 100) / 100;
            }

            if (commission > 0) {
                db.prepare('UPDATE users SET balance = balance + ?, bonus = bonus + ? WHERE id = ?')
                    .run(commission, commission, sponsor.id);

                db.prepare(`INSERT INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status)
                    VALUES (?, 'comissao', ?, ?, 'commission', ?, date('now'), 'creditado')`)
                    .run(sponsor.id, commission, `${description} (Nível ${level})`, userId);

                db.prepare(`INSERT INTO commissions (from_user_id, to_user_id, level, amount, source_type, source_id, date)
                    VALUES (?, ?, ?, ?, 'package', ?, date('now'))`)
                    .run(userId, sponsor.id, level, commission, userId);

                createNotification(sponsor.id, 'financial', 'Comissão recebida!',
                    `Você recebeu R$ ${commission.toFixed(2)} de comissão nível ${level} por indicação.`);
            }

            currentUserId = current.sponsor_id;
        }
    } catch (err) {
        console.error('Erro processar comissões:', err.message);
    }
}

/**
 * Verificar e aplicar graduação automática por pontos
 * Chamada após qualquer compra de pacote
 */
function checkAutoGraduation(db, userId) {
    try {
        const LEVELS = ['start', 'bronze', 'prata', 'ouro', 'diamante'];
        const user = db.prepare('SELECT id, points, level FROM users WHERE id = ?').get(userId);
        if (!user) return;

        const levelRows = db.prepare('SELECT * FROM levels ORDER BY min_points ASC').all();
        if (!levelRows.length) return;

        // Encontrar o maior nível que o usuário atingiu por pontos
        let newLevel = user.level;
        for (const lv of levelRows) {
            if (user.points >= lv.min_points) {
                newLevel = lv.key;
            }
        }

        if (newLevel !== user.level) {
            const oldIdx = LEVELS.indexOf(user.level);
            const newIdx = LEVELS.indexOf(newLevel);
            if (newIdx > oldIdx) {
                db.prepare('UPDATE users SET level = ? WHERE id = ?').run(newLevel, userId);
                db.prepare('INSERT INTO level_history (user_id, from_level, to_level, points_at_change, created_at) VALUES (?, ?, ?, ?, datetime("now"))')
                    .run(userId, user.level, newLevel, user.points);
                const lvObj = levelRows.find(l => l.key === newLevel);
                createNotification(userId, 'success', 'Graduação!',
                    `Parabéns! Você foi promovido para ${lvObj ? lvObj.name : newLevel}! 🎉`);
            }
        }
    } catch (err) {
        console.error('Erro auto-graduação:', err.message);
    }
}

/**
 * Fallback — comprar pacote sem gateway (modo sandbox/dev)
 */
function handleFallbackPurchase(db, req, res, user, pkg, customMessage) {
    // Ativar pacote diretamente (modo fallback/sandbox)
    const purchase = db.transaction(() => {
        const namesCredit = pkg.names_count || 0;
        db.prepare('UPDATE users SET points = points + ?, names_available = names_available + ?, has_package = 1 WHERE id = ?')
            .run(pkg.points, namesCredit, user.id);
        // Atualizar nível
        if (pkg.level_key) {
            const LEVEL_ORDER = { start: 1, bronze: 2, prata: 3, ouro: 4, diamante: 5 };
            const newRank = LEVEL_ORDER[pkg.level_key] || 0;
            const currentRank = LEVEL_ORDER[user.level] || 0;
            if (newRank > currentRank) {
                db.prepare('UPDATE users SET level = ? WHERE id = ?').run(pkg.level_key, user.id);
            }
        }
        db.prepare(`INSERT INTO user_packages (user_id, package_id, purchased_at, status, payment_status)
            VALUES (?, ?, date('now'), 'ativo', 'pendente')`)
            .run(user.id, pkg.id);
        db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status)
            VALUES (?, 'compra', ?, ?, date('now'), 'pendente')`)
            .run(user.id, -pkg.price, `Compra pacote: ${pkg.name}`);
    });

    purchase();
    processNetworkCommissions(db, user.id, pkg.price, `Comissão por indicação - ${pkg.name}`);

    logAudit({ userType: 'user', userId: user.id, action: 'package_purchase_fallback', entity: 'package',
        details: { packageId: pkg.id, value: pkg.price }, ip: getClientIP(req) });

    res.json({ success: true, approved: true, message: customMessage || `Pacote ${pkg.name} ativado! +${pkg.points} pontos` });
}

module.exports = router;
module.exports.processNetworkCommissions = processNetworkCommissions;
module.exports.checkAutoGraduation = checkAutoGraduation;
