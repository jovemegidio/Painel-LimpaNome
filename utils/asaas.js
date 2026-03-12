/* ═══════════════════════════════════════════
   Credbusiness — Asaas Payment Gateway Integration
   PIX, Boleto, Cartão de Crédito + PIX Payout
   Docs: https://docs.asaas.com/reference
   ═══════════════════════════════════════════ */

const axios = require('axios');

// ── Configuração ──
const ASAAS_ENV = process.env.ASAAS_ENV || 'sandbox'; // 'sandbox' ou 'production'
const ASAAS_API_KEY = process.env.ASAAS_API_KEY || '';
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';

const BASE_URL = ASAAS_ENV === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';

// ── HTTP Client ──
const api = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        'access_token': ASAAS_API_KEY
    }
});

// Log de chamadas em dev
api.interceptors.response.use(
    resp => resp,
    err => {
        const msg = err.response?.data || err.message;
        console.error(`[Asaas] Erro ${err.response?.status || '?'}:`, JSON.stringify(msg));
        throw err;
    }
);

// ════════════════════════════════════
//   CLIENTES (Customers)
// ════════════════════════════════════

/**
 * Buscar cliente pelo CPF/CNPJ
 */
async function findCustomer(cpfCnpj) {
    try {
        const cleanDoc = cpfCnpj.replace(/\D/g, '');
        const { data } = await api.get('/customers', { params: { cpfCnpj: cleanDoc } });
        return data.data && data.data.length > 0 ? data.data[0] : null;
    } catch (err) {
        console.error('[Asaas] findCustomer erro:', err.message);
        return null;
    }
}

/**
 * Criar cliente no Asaas
 * @param {object} user - { name, email, cpf, phone }
 * @returns {object|null} Asaas customer object
 */
async function createCustomer(user) {
    try {
        const { data } = await api.post('/customers', {
            name: user.name,
            email: user.email,
            cpfCnpj: (user.cpf || '').replace(/\D/g, ''),
            phone: (user.phone || '').replace(/\D/g, ''),
            notificationDisabled: false
        });
        return data;
    } catch (err) {
        console.error('[Asaas] createCustomer erro:', err.message);
        return null;
    }
}

/**
 * Buscar ou criar cliente (upsert)
 */
async function getOrCreateCustomer(user) {
    if (!user.cpf) return null;
    let customer = await findCustomer(user.cpf);
    if (!customer) {
        customer = await createCustomer(user);
    }
    return customer;
}

// ════════════════════════════════════
//   COBRANÇAS (Payments)
// ════════════════════════════════════

/**
 * Criar cobrança (payment)
 * @param {object} params
 * @param {string} params.customerId - ID do cliente Asaas (cus_xxx)
 * @param {number} params.value - Valor em R$
 * @param {string} params.billingType - 'PIX', 'BOLETO', 'CREDIT_CARD'
 * @param {string} params.description - Descrição da cobrança
 * @param {string} [params.dueDate] - Data de vencimento (YYYY-MM-DD), padrão hoje+3
 * @param {string} [params.externalReference] - Referência externa (ex: package_5)
 * @param {object} [params.creditCard] - Dados do cartão (se billingType === 'CREDIT_CARD')
 * @param {object} [params.creditCardHolderInfo] - Dados do titular do cartão
 * @returns {object} Asaas payment object
 */
async function createPayment(params) {
    try {
        const dueDate = params.dueDate || getDefaultDueDate();
        const payload = {
            customer: params.customerId,
            billingType: params.billingType,
            value: params.value,
            dueDate: dueDate,
            description: params.description || 'Pagamento Credbusiness',
            externalReference: params.externalReference || ''
        };

        // Cartão de crédito - dados adicionais
        if (params.billingType === 'CREDIT_CARD' && params.creditCard) {
            payload.creditCard = params.creditCard;
            payload.creditCardHolderInfo = params.creditCardHolderInfo;
        }

        const { data } = await api.post('/payments', payload);
        return data;
    } catch (err) {
        const errors = err.response?.data?.errors;
        console.error('[Asaas] createPayment erro:', errors || err.message);
        throw new Error(errors?.[0]?.description || 'Erro ao criar cobrança no Asaas');
    }
}

/**
 * Obter QR Code PIX de uma cobrança
 * @param {string} paymentId - ID do pagamento Asaas (pay_xxx)
 * @returns {object} { encodedImage, payload, expirationDate }
 */
async function getPixQrCode(paymentId) {
    try {
        const { data } = await api.get(`/payments/${paymentId}/pixQrCode`);
        return data;
    } catch (err) {
        console.error('[Asaas] getPixQrCode erro:', err.message);
        return null;
    }
}

/**
 * Obter linha digitável / código de barras do boleto
 * @param {string} paymentId
 * @returns {object} { identificationField, nossoNumero, barCode, bankSlipUrl }
 */
async function getBoletoInfo(paymentId) {
    try {
        const { data } = await api.get(`/payments/${paymentId}/identificationField`);
        return data;
    } catch (err) {
        console.error('[Asaas] getBoletoInfo erro:', err.message);
        return null;
    }
}

/**
 * Consultar status de um pagamento
 * @param {string} paymentId
 */
async function getPaymentStatus(paymentId) {
    try {
        const { data } = await api.get(`/payments/${paymentId}`);
        return data;
    } catch (err) {
        console.error('[Asaas] getPaymentStatus erro:', err.message);
        return null;
    }
}

/**
 * Estornar / cancelar um pagamento
 * @param {string} paymentId
 */
async function refundPayment(paymentId) {
    try {
        const { data } = await api.post(`/payments/${paymentId}/refund`);
        return data;
    } catch (err) {
        console.error('[Asaas] refundPayment erro:', err.message);
        return null;
    }
}

// ════════════════════════════════════
//   TRANSFERÊNCIAS PIX (Payout)
// ════════════════════════════════════

/**
 * Realizar transferência PIX (payout) para o usuário
 * @param {object} params
 * @param {number} params.value - Valor em R$
 * @param {string} params.pixKey - Chave PIX do destinatário
 * @param {string} [params.pixType] - Tipo: CPF, CNPJ, EMAIL, PHONE, EVP (chave aleatória)
 * @param {string} [params.description] - Descrição da transferência
 * @returns {object} Asaas transfer object
 */
async function createPixTransfer(params) {
    try {
        const pixType = detectPixKeyType(params.pixKey, params.pixType);
        const payload = {
            value: params.value,
            operationType: 'PIX',
            pixAddressKey: params.pixKey,
            pixAddressKeyType: pixType,
            description: params.description || 'Saque Credbusiness'
        };

        const { data } = await api.post('/transfers', payload);
        return data;
    } catch (err) {
        const errors = err.response?.data?.errors;
        console.error('[Asaas] createPixTransfer erro:', errors || err.message);
        throw new Error(errors?.[0]?.description || 'Erro ao realizar transferência PIX');
    }
}

/**
 * Consultar status de uma transferência
 * @param {string} transferId
 */
async function getTransferStatus(transferId) {
    try {
        const { data } = await api.get(`/transfers/${transferId}`);
        return data;
    } catch (err) {
        console.error('[Asaas] getTransferStatus erro:', err.message);
        return null;
    }
}

/**
 * Consultar saldo na conta Asaas
 */
async function getBalance() {
    try {
        const { data } = await api.get('/finance/balance');
        return data; // { balance, statistics }
    } catch (err) {
        console.error('[Asaas] getBalance erro:', err.message);
        return null;
    }
}

// ════════════════════════════════════
//   ASSINATURAS (Subscriptions) — Planos
// ════════════════════════════════════

/**
 * Criar assinatura recorrente para plano
 * @param {object} params
 * @param {string} params.customerId
 * @param {number} params.value
 * @param {string} params.billingType - PIX, BOLETO, CREDIT_CARD
 * @param {string} [params.description]
 * @param {string} [params.externalReference]
 * @returns {object} Asaas subscription object
 */
async function createSubscription(params) {
    try {
        const { data } = await api.post('/subscriptions', {
            customer: params.customerId,
            billingType: params.billingType,
            value: params.value,
            cycle: 'MONTHLY',
            description: params.description || 'Plano Credbusiness',
            externalReference: params.externalReference || '',
            nextDueDate: getDefaultDueDate()
        });
        return data;
    } catch (err) {
        const errors = err.response?.data?.errors;
        console.error('[Asaas] createSubscription erro:', errors || err.message);
        throw new Error(errors?.[0]?.description || 'Erro ao criar assinatura');
    }
}

/**
 * Cancelar assinatura
 */
async function cancelSubscription(subscriptionId) {
    try {
        const { data } = await api.delete(`/subscriptions/${subscriptionId}`);
        return data;
    } catch (err) {
        console.error('[Asaas] cancelSubscription erro:', err.message);
        return null;
    }
}

// ════════════════════════════════════
//   WEBHOOK — Validação
// ════════════════════════════════════

/**
 * Validar token do webhook Asaas
 * @param {string} token - Header `asaas-access-token` do request
 */
function validateWebhookToken(token) {
    if (!ASAAS_WEBHOOK_TOKEN) {
        console.error('[Webhook] ASAAS_WEBHOOK_TOKEN não configurado — rejeitando request por segurança');
        return false;
    }
    return token === ASAAS_WEBHOOK_TOKEN;
}

// ════════════════════════════════════
//   HELPERS
// ════════════════════════════════════

function getDefaultDueDate() {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Detectar tipo de chave PIX automaticamente
 */
function detectPixKeyType(key, explicitType) {
    if (explicitType) {
        const map = { cpf: 'CPF', cnpj: 'CNPJ', email: 'EMAIL', phone: 'PHONE', telefone: 'PHONE', celular: 'PHONE', evp: 'EVP', aleatoria: 'EVP' };
        return map[explicitType.toLowerCase()] || explicitType.toUpperCase();
    }
    const clean = (key || '').trim();
    if (/^\d{11}$/.test(clean.replace(/\D/g, '')) && clean.replace(/\D/g, '').length === 11 && !clean.includes('@')) {
        // Pode ser CPF ou telefone
        if (/^\+?\d{10,13}$/.test(clean.replace(/\D/g, '')) && (clean.startsWith('+') || clean.startsWith('55'))) return 'PHONE';
        return 'CPF';
    }
    if (/^\d{14}$/.test(clean.replace(/\D/g, ''))) return 'CNPJ';
    if (clean.includes('@')) return 'EMAIL';
    if (/^\+?\d{10,13}$/.test(clean.replace(/[\s()-]/g, ''))) return 'PHONE';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return 'EVP';
    return 'EVP'; // Fallback para chave aleatória
}

/**
 * Verificar se a API Asaas está configurada
 */
function isConfigured() {
    return !!ASAAS_API_KEY;
}

/**
 * Mapear status Asaas → status interno
 */
function mapPaymentStatus(asaasStatus) {
    const map = {
        'PENDING': 'pendente',
        'RECEIVED': 'pago',
        'CONFIRMED': 'pago',
        'RECEIVED_IN_CASH': 'pago',
        'OVERDUE': 'vencido',
        'REFUNDED': 'estornado',
        'REFUND_REQUESTED': 'estornando',
        'CHARGEBACK_REQUESTED': 'contestado',
        'CHARGEBACK_DISPUTE': 'contestado',
        'AWAITING_CHARGEBACK_REVERSAL': 'contestado',
        'DUNNING_REQUESTED': 'cobranca',
        'DUNNING_RECEIVED': 'pago',
        'AWAITING_RISK_ANALYSIS': 'analise'
    };
    return map[asaasStatus] || 'pendente';
}

/**
 * Mapear status transferência Asaas → status interno
 */
function mapTransferStatus(asaasStatus) {
    const map = {
        'PENDING': 'pendente',
        'BANK_PROCESSING': 'processando',
        'DONE': 'concluido',
        'CANCELLED': 'cancelado',
        'FAILED': 'falhou'
    };
    return map[asaasStatus] || 'pendente';
}

module.exports = {
    // Customers
    findCustomer,
    createCustomer,
    getOrCreateCustomer,
    // Payments
    createPayment,
    getPixQrCode,
    getBoletoInfo,
    getPaymentStatus,
    refundPayment,
    // Transfers (Payout)
    createPixTransfer,
    getTransferStatus,
    getBalance,
    // Subscriptions
    createSubscription,
    cancelSubscription,
    // Webhook
    validateWebhookToken,
    // Helpers
    isConfigured,
    mapPaymentStatus,
    mapTransferStatus,
    detectPixKeyType
};
