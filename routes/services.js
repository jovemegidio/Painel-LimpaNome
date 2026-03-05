/* ═══════════════════════════════════════════
   Credbusiness — Services Routes (Processes, Consultations, Transactions)
   ═══════════════════════════════════════════ */

const express = require('express');
const axios = require('axios');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');
const { logAudit, getClientIP } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');

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

router.get('/processes', auth, (req, res) => {
    try {
        const db = getDB();
        const processes = db.prepare('SELECT * FROM processes WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
        res.json(processes);
    } catch (err) {
        console.error('Erro listar processos:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.post('/processes', auth, (req, res) => {
    try {
        const cpf = sanitize(req.body.cpf);
        const name = sanitize(req.body.name);
        const type = sanitize(req.body.type) || 'negativacao';
        const value = Number(req.body.value) || 0;
        const institution = sanitize(req.body.institution);

        if (!cpf || !name) return res.status(400).json({ error: 'CPF e nome são obrigatórios' });
        if (!['negativacao', 'divida', 'limpa_nome', 'bacen'].includes(type)) {
            return res.status(400).json({ error: 'Tipo de processo inválido' });
        }

        const db = getDB();
        const result = db.prepare(`
            INSERT INTO processes (user_id, cpf, name, status, type, value, institution, created_at, updated_at)
            VALUES (?, ?, ?, 'pendente', ?, ?, ?, date('now'), date('now'))
        `).run(req.user.id, cpf, name, type, value, institution);

        const process = db.prepare('SELECT * FROM processes WHERE id = ?').get(result.lastInsertRowid);
        logAudit({ userType: 'user', userId: req.user.id, action: 'create_process', entity: 'process', entityId: result.lastInsertRowid, ip: getClientIP(req) });
        res.status(201).json({ success: true, process });
    } catch (err) {
        console.error('Erro criar processo:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.put('/processes/:id', auth, (req, res) => {
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

// Consultar CPF
router.post('/consultar-cpf', auth, (req, res) => {
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

        // MOCK
        const hasIssue = Math.random() > 0.3;
        const mockResult = hasIssue
            ? {
                status: 'restricao',
                mensagem: 'CPF com restrição',
                detalhes: [
                    { orgao: 'Serasa', tipo: 'Negativação', valor: (Math.random() * 5000 + 500).toFixed(2), data: '15/08/2025' },
                    { orgao: 'SPC', tipo: 'Dívida', valor: (Math.random() * 2000 + 200).toFixed(2), data: '22/10/2025' }
                ]
            }
            : { status: 'limpo', mensagem: 'Nenhuma restrição encontrada' };

        db.prepare(`INSERT INTO consultations (user_id, cpf, name, type, result, created_at) VALUES (?, ?, ?, 'cpf', ?, datetime('now'))`)
            .run(req.user.id, cpf, nome || '', JSON.stringify(mockResult));

        logAudit({ userType: 'user', userId: req.user.id, action: 'consult_cpf', entity: 'consultation', details: { cpf }, ip: getClientIP(req) });
        res.json(mockResult);
    } catch (err) {
        console.error('Erro consultar-cpf:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Consultar Bacen
router.post('/consultar-bacen', auth, (req, res) => {
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

        // MOCK
        const mockResult = {
            status: 'ok',
            mensagem: 'Consulta realizada',
            dados: {
                valores_a_receber: (Math.random() * 500).toFixed(2),
                instituicoes: Math.floor(Math.random() * 5),
                ultima_atualizacao: new Date().toISOString().split('T')[0]
            }
        };

        db.prepare(`INSERT INTO consultations (user_id, cpf, name, type, result, created_at) VALUES (?, ?, '', 'bacen', ?, datetime('now'))`)
            .run(req.user.id, cpf, JSON.stringify(mockResult));

        res.json(mockResult);
    } catch (err) {
        console.error('Erro consultar-bacen:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Histórico de consultas
router.get('/consultations', auth, (req, res) => {
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

// Solicitar saque — ATÔMICO com transaction
router.post('/transactions/withdraw', auth, (req, res) => {
    try {
        const amount = Number(req.body.amount);
        const pixKey = sanitize(req.body.pixKey);
        if (!amount || !isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Valor inválido' });

        const db = getDB();
        const settings = {};
        db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });
        const minWithdraw = Number(settings.minWithdraw) || 50;

        if (amount < minWithdraw) return res.status(400).json({ success: false, error: `Saque mínimo: R$ ${minWithdraw}` });

        // ── Transação atômica para evitar race condition ──
        const withdraw = db.transaction(() => {
            const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
            if (!user) throw new Error('USER_NOT_FOUND');
            if (amount > user.balance) throw new Error('INSUFFICIENT_BALANCE');

            db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, req.user.id);
            db.prepare(`INSERT INTO transactions (user_id, type, amount, description, date, status) VALUES (?, 'saque', ?, ?, date('now'), 'pendente')`)
                .run(req.user.id, -amount, `Saque via PIX - ${pixKey || 'N/A'}`);

            return true;
        });

        try {
            withdraw();
            logAudit({ userType: 'user', userId: req.user.id, action: 'withdraw', entity: 'transaction', details: { amount, pixKey }, ip: getClientIP(req) });
            res.json({ success: true, message: 'Saque solicitado com sucesso' });
        } catch (txErr) {
            if (txErr.message === 'INSUFFICIENT_BALANCE') {
                return res.status(400).json({ success: false, error: 'Saldo insuficiente' });
            }
            if (txErr.message === 'USER_NOT_FOUND') {
                return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            }
            throw txErr;
        }
    } catch (err) {
        console.error('Erro saque:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Consulta CNPJ (via ReceitaWS free API) ──
router.post('/consultar-cnpj', auth, async (req, res) => {
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
            // Fallback mock
            result = {
                status: 'found',
                cnpj: cleanCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'),
                nome: 'Empresa Exemplo LTDA',
                fantasia: 'Empresa Exemplo',
                situacao: 'ATIVA',
                tipo: 'MATRIZ',
                abertura: '01/01/2020',
                natureza_juridica: '206-2 - Sociedade Empresária Limitada',
                atividade_principal: 'Comércio varejista',
                endereco: 'Rua Exemplo, 123 - Centro, São Paulo/SP',
                telefone: '(11) 0000-0000',
                email: 'contato@exemplo.com.br',
                capital_social: '100000.00',
                mock: true
            };
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
