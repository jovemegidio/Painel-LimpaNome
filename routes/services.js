/* ═══════════════════════════════════════════
   Credbusiness — Services Routes (Processes, Consultations, Transactions)
   ═══════════════════════════════════════════ */

const express = require('express');
const axios = require('axios');
const { getDB } = require('../database/init');
const { auth, requirePackage } = require('../middleware/auth');
const { logAudit, getClientIP } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const asaas = require('../utils/asaas');

const router = express.Router();

// Helpers
function sanitize(str) { return str ? String(str).trim().replace(/<[^>]*>/g, '') : ''; }

// Transições de status válidas para processos
const VALID_PROCESS_TRANSITIONS = {
    'pendente': ['em_andamento', 'cancelado'],
    'em_andamento': ['concluido', 'cancelado'],
    'concluido': [],
    'cancelado': []
};

// ════════════════════════════════════
//   PROCESSOS LIMPA NOME
// ════════════════════════════════════

router.get('/processes', auth, requirePackage, (req, res) => {
    try {
        const db = getDB();
        const processes = db.prepare('SELECT * FROM processes WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
        res.json(processes);
    } catch (err) {
        console.error('Erro listar processos:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.post('/processes', auth, requirePackage, (req, res) => {
    try {
        const cpf = sanitize(req.body.cpf);
        const name = sanitize(req.body.name);
        const type = sanitize(req.body.type) || 'negativacao';
        const value = Number(req.body.value) || 0;
        const institution = sanitize(req.body.institution);
        const person_type = ['pf', 'pj'].includes(req.body.person_type) ? req.body.person_type : 'pf';
        const cnpj = sanitize(req.body.cnpj);
        const company_name = sanitize(req.body.company_name);
        const notes = sanitize(req.body.notes);

        if (!cpf || !name) return res.status(400).json({ error: 'CPF e nome são obrigatórios' });
        if (!['negativacao', 'divida', 'limpa_nome', 'bacen'].includes(type)) {
            return res.status(400).json({ error: 'Tipo de processo inválido' });
        }

        const db = getDB();

        // Verificar se o usuário tem créditos de nomes disponíveis
        const currentUser = db.prepare('SELECT names_available FROM users WHERE id = ?').get(req.user.id);
        if (!currentUser || (currentUser.names_available || 0) < 1) {
            return res.status(400).json({ error: 'Você não possui créditos de nomes disponíveis. Adquira um pacote para continuar.' });
        }

        // Deduzir 1 crédito de nome (atômico)
        const deducted = db.prepare('UPDATE users SET names_available = names_available - 1 WHERE id = ? AND names_available > 0').run(req.user.id);
        if (deducted.changes === 0) {
            return res.status(400).json({ error: 'Créditos de nomes esgotados. Adquira um novo pacote.' });
        }

        const result = db.prepare(`
            INSERT INTO processes (user_id, cpf, name, status, type, value, institution, notes, person_type, cnpj, company_name, created_at, updated_at)
            VALUES (?, ?, ?, 'pendente', ?, ?, ?, ?, ?, ?, ?, date('now'), date('now'))
        `).run(req.user.id, cpf, name, type, value, institution, notes, person_type, cnpj, company_name);

        const process = db.prepare('SELECT * FROM processes WHERE id = ?').get(result.lastInsertRowid);
        logAudit({ userType: 'user', userId: req.user.id, action: 'create_process', entity: 'process', entityId: result.lastInsertRowid, ip: getClientIP(req) });
        res.status(201).json({ success: true, process });
    } catch (err) {
        console.error('Erro criar processo:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.put('/processes/:id', auth, requirePackage, (req, res) => {
    try {
        const status = sanitize(req.body.status);
        const db = getDB();

        const process = db.prepare('SELECT * FROM processes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!process) return res.status(404).json({ error: 'Processo não encontrado' });

        // Validar transição de status
        const allowed = VALID_PROCESS_TRANSITIONS[process.status];
        if (!allowed || !allowed.includes(status)) {
            return res.status(400).json({ error: `Não é possível mudar de "${process.status}" para "${status}"` });
        }

        db.prepare("UPDATE processes SET status = ?, updated_at = date('now') WHERE id = ?").run(status, req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro atualizar processo:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ════════════════════════════════════
//   CONSULTAS CPF / BACEN
// ════════════════════════════════════

// Lookup CPF — retorna nome do usuário e dados conhecidos (para auto-complete)
router.get('/lookup-cpf', auth, requirePackage, (req, res) => {
    try {
        const cpf = sanitize(req.query.cpf);
        if (!cpf || cpf.replace(/\D/g, '').length < 11) return res.json({ found: false });

        const db = getDB();
        // Buscar nos usuários cadastrados
        const user = db.prepare("SELECT name, birth_date, nickname FROM users WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?").get(cpf.replace(/\D/g, ''));
        if (user) {
            return res.json({ found: true, name: user.name, birth_date: user.birth_date || '', nickname: user.nickname || '' });
        }
        // Buscar nas consultas anteriores
        const consult = db.prepare("SELECT name FROM consultations WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ? AND name != '' ORDER BY created_at DESC LIMIT 1").get(cpf.replace(/\D/g, ''));
        if (consult && consult.name) {
            return res.json({ found: true, name: consult.name });
        }
        // Buscar nos processos
        const proc = db.prepare("SELECT name FROM processes WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ? ORDER BY created_at DESC LIMIT 1").get(cpf.replace(/\D/g, ''));
        if (proc && proc.name) {
            return res.json({ found: true, name: proc.name });
        }
        res.json({ found: false });
    } catch (err) {
        res.json({ found: false });
    }
});

// Consultar CPF
router.post('/consultar-cpf', auth, requirePackage, (req, res) => {
    try {
        const cpf = sanitize(req.body.cpf);
        const nome = sanitize(req.body.nome);
        if (!cpf) return res.status(400).json({ error: 'CPF é obrigatório' });

        const db = getDB();

        if (process.env.API_CPF_URL && process.env.API_CPF_KEY) {
            axios.post(process.env.API_CPF_URL, { cpf, nome }, {
                headers: { 'Authorization': `Bearer ${process.env.API_CPF_KEY}` },
                timeout: 15000
            }).then(response => {
                db.prepare(`INSERT INTO consultations (user_id, cpf, name, type, result, created_at) VALUES (?, ?, ?, 'cpf', ?, datetime('now'))`)
                    .run(req.user.id, cpf, nome || '', JSON.stringify(response.data));
                res.json(response.data);
            }).catch(err => {
                console.error('Erro API CPF:', err.message);
                res.status(502).json({ status: 'erro', mensagem: 'Serviço de consulta indisponível. Tente novamente.' });
            });
            return;
        }

        // API de consulta CPF não configurada
        return res.status(503).json({ error: 'Serviço de consulta CPF não configurado. Contate o administrador.' });
    } catch (err) {
        console.error('Erro consultar-cpf:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Consultar Bacen
router.post('/consultar-bacen', auth, requirePackage, (req, res) => {
    try {
        const cpf = sanitize(req.body.cpf);
        if (!cpf) return res.status(400).json({ error: 'CPF é obrigatório' });

        const db = getDB();

        if (process.env.API_BACEN_URL && process.env.API_BACEN_KEY) {
            axios.post(process.env.API_BACEN_URL, { cpf }, {
                headers: { 'Authorization': `Bearer ${process.env.API_BACEN_KEY}` },
                timeout: 15000
            }).then(response => {
                db.prepare(`INSERT INTO consultations (user_id, cpf, name, type, result, created_at) VALUES (?, ?, '', 'bacen', ?, datetime('now'))`)
                    .run(req.user.id, cpf, JSON.stringify(response.data));
                res.json(response.data);
            }).catch(err => {
                console.error('Erro API Bacen:', err.message);
                res.status(502).json({ status: 'erro', mensagem: 'Serviço Bacen indisponível. Tente novamente.' });
            });
            return;
        }

        // API Bacen não configurada
        return res.status(503).json({ error: 'Serviço de consulta Bacen não configurado. Contate o administrador.' });
    } catch (err) {
        console.error('Erro consultar-bacen:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Histórico de consultas
router.get('/consultations', auth, requirePackage, (req, res) => {
    try {
        const db = getDB();
        const consults = db.prepare('SELECT * FROM consultations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
            .all(req.user.id);
        consults.forEach(c => { try { c.result = JSON.parse(c.result); } catch {} });
        res.json(consults);
    } catch (err) {
        console.error('Erro listar consultas:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ════════════════════════════════════
//   TRANSAÇÕES FINANCEIRAS
// ════════════════════════════════════

router.get('/transactions', auth, (req, res) => {
    try {
        const db = getDB();
        const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC').all(req.user.id);
        res.json(txs);
    } catch (err) {
        console.error('Erro listar transações:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Solicitar saque — ATÔMICO com transaction + Asaas PIX Payout
router.post('/transactions/withdraw', auth, requirePackage, async (req, res) => {
    try {
        const amount = Number(req.body.amount);
        const pixKey = sanitize(req.body.pixKey);
        const pixType = sanitize(req.body.pixType || '');
        if (!amount || !isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Valor inválido' });
        if (!pixKey) return res.status(400).json({ error: 'Chave PIX é obrigatória' });

        const db = getDB();
        const settings = {};
        db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });
        const minWithdraw = Number(settings.minWithdraw) || 100;
        const withdrawFee = Number(settings.withdrawFee) || 2.50;

        if (amount < minWithdraw) return res.status(400).json({ success: false, error: `Saque mínimo: R$ ${minWithdraw.toFixed(2).replace('.', ',')}` });

        // ── Verificar limite de 1 saque por mês ──
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const withdrawThisMonth = db.prepare(
            "SELECT COUNT(*) as c FROM transactions WHERE user_id = ? AND type = 'saque' AND date >= ? AND status != 'falhou' AND status != 'cancelado'"
        ).get(req.user.id, monthStart);
        if (withdrawThisMonth.c >= 1) {
            return res.status(400).json({ success: false, error: 'Você já realizou um saque este mês. Limite: 1 saque por mês.' });
        }

        const totalDebit = Math.round((amount + withdrawFee) * 100) / 100;

        // ── Transação atômica para evitar race condition ──
        const withdraw = db.transaction(() => {
            const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
            if (!user) throw new Error('USER_NOT_FOUND');
            if (totalDebit > user.balance) throw new Error('INSUFFICIENT_BALANCE');

            db.prepare('UPDATE users SET balance = balance - ?, last_withdraw_date = date("now") WHERE id = ?').run(totalDebit, req.user.id);

            const txResult = db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status, reference_type) VALUES (?, 'saque', ?, ?, date('now'), 'pendente', 'payment')`)
                .run(req.user.id, -amount, `Saque via PIX - ${pixKey || 'N/A'} (taxa: R$ ${withdrawFee.toFixed(2)})`);

            // Registrar taxa de saque como transação separada
            db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status, reference_type) VALUES (?, 'taxa', ?, 'Taxa de saque', date('now'), 'concluido', 'fee')`)
                .run(req.user.id, -withdrawFee);

            return txResult.lastInsertRowid;
        });

        let transactionId;
        try {
            transactionId = withdraw();
        } catch (txErr) {
            if (txErr.message === 'INSUFFICIENT_BALANCE') {
                return res.status(400).json({ success: false, error: 'Saldo insuficiente' });
            }
            if (txErr.message === 'USER_NOT_FOUND') {
                return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            }
            throw txErr;
        }

        logAudit({ userType: 'user', userId: req.user.id, action: 'withdraw', entity: 'transaction', details: { amount, fee: withdrawFee, totalDebit, pixKey }, ip: getClientIP(req) });

        // ── Asaas PIX Payout (se configurado) ──
        if (asaas.isConfigured()) {
            try {
                const transfer = await asaas.createPixTransfer({
                    value: amount,
                    pixKey: pixKey,
                    pixType: pixType,
                    description: `Saque Credbusiness #${transactionId}`
                });

                // Salvar referência do payout no banco
                db.prepare(`INSERT INTO payments (user_id, asaas_payment_id, type, amount, method, status, external_reference, created_at)
                    VALUES (?, ?, 'withdraw', ?, 'pix_payout', 'processando', ?, datetime('now'))`)
                    .run(req.user.id, transfer.id, amount, `withdraw_tx_${transactionId}`);

                // Atualizar transação com referência do payment
                const paymentRow = db.prepare("SELECT id FROM payments WHERE asaas_payment_id = ?").get(transfer.id);
                if (paymentRow) {
                    db.prepare("UPDATE transactions SET reference_id = ? WHERE id = ?").run(paymentRow.id, transactionId);
                }

                return res.json({
                    success: true,
                    message: 'Saque solicitado! A transferência PIX está sendo processada.',
                    transferId: transfer.id,
                    status: transfer.status
                });
            } catch (pixErr) {
                // PIX falhou — devolver saldo (valor + taxa)
                console.error('[Withdraw] Erro PIX payout:', pixErr.message);
                db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(totalDebit, req.user.id);
                db.prepare("UPDATE transactions SET status = 'falhou', description = ? WHERE id = ?")
                    .run(`Saque via PIX - FALHOU: ${pixErr.message}`, transactionId);

                return res.status(500).json({ success: false, error: 'Erro ao processar transferência PIX. O valor foi devolvido ao seu saldo.' });
            }
        }

        // Sem Asaas — modo manual (admin processa depois)
        res.json({ success: true, message: 'Saque solicitado com sucesso. Processamento em até 3 dias úteis.' });
    } catch (err) {
        console.error('Erro saque:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Consulta CNPJ (via ReceitaWS free API) ──
router.post('/consultar-cnpj', auth, requirePackage, async (req, res) => {
    const { cnpj } = req.body;
    if (!cnpj) return res.status(400).json({ error: 'CNPJ é obrigatório' });

    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) return res.status(400).json({ error: 'CNPJ inválido (14 dígitos)' });

    try {
        const db = getDB();
        let result;

        // Try free ReceitaWS API
        try {
            const axios = require('axios');
            const resp = await axios.get(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`, { timeout: 10000, headers: { 'Accept': 'application/json' } });
            if (resp.data && resp.data.status !== 'ERROR') {
                result = {
                    status: 'found',
                    cnpj: resp.data.cnpj,
                    nome: resp.data.nome,
                    fantasia: resp.data.fantasia,
                    situacao: resp.data.situacao,
                    tipo: resp.data.tipo,
                    abertura: resp.data.abertura,
                    natureza_juridica: resp.data.natureza_juridica,
                    atividade_principal: resp.data.atividade_principal?.[0]?.text || '',
                    endereco: `${resp.data.logradouro}, ${resp.data.numero} - ${resp.data.bairro}, ${resp.data.municipio}/${resp.data.uf}`,
                    telefone: resp.data.telefone,
                    email: resp.data.email,
                    capital_social: resp.data.capital_social
                };
            } else {
                result = { status: 'not_found', message: resp.data.message || 'CNPJ não encontrado' };
            }
        } catch (apiErr) {
            console.error('Erro API ReceitaWS:', apiErr.message);
            return res.status(502).json({ error: 'Serviço de consulta CNPJ indisponível. Tente novamente em alguns instantes.' });
        }

        // Save consultation
        db.prepare(`INSERT INTO consultations (user_id, type, cpf, result, created_at)
            VALUES (?, 'cnpj', ?, ?, datetime('now'))`)
            .run(req.user.id, cleanCnpj, JSON.stringify(result));

        res.json(result);
    } catch (err) {
        console.error('Erro consulta CNPJ:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
