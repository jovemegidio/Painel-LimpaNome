/* ========================================
   MI2 - Sistema de Dados (LocalStorage)
   Banco de dados local completo
   ======================================== */

const DB = {
    // ── Helpers ──
    get(key) {
        try { return JSON.parse(localStorage.getItem('mi2_' + key)); }
        catch { return null; }
    },
    set(key, val) {
        localStorage.setItem('mi2_' + key, JSON.stringify(val));
    },
    remove(key) {
        localStorage.removeItem('mi2_' + key);
    },

    // ── Inicializar dados padrão ──
    init() {
        if (this.get('initialized')) return;

        // Usuários do sistema
        this.set('users', [
            {
                id: 1, username: 'credbusiness', password: 'Service', name: 'CredBusiness',
                email: 'cred@business.com', phone: '(11) 99999-0001', cpf: '123.456.789-00',
                level: 'diamante', points: 2450, bonus: 2080, balance: 120,
                referrals: [2, 3, 4, 5, 6, 7, 8], sponsor: null, plan: 'premium',
                active: true, createdAt: '2025-06-15', avatar: null, role: 'user'
            },
            {
                id: 2, username: 'maria.silva', password: '123456', name: 'Maria Silva',
                email: 'maria@email.com', phone: '(11) 98888-0002', cpf: '234.567.890-01',
                level: 'ouro', points: 1200, bonus: 980, balance: 50,
                referrals: [9, 10], sponsor: 1, plan: 'basico',
                active: true, createdAt: '2025-08-20', avatar: null, role: 'user'
            },
            {
                id: 3, username: 'joao.santos', password: '123456', name: 'João Santos',
                email: 'joao@email.com', phone: '(21) 97777-0003', cpf: '345.678.901-02',
                level: 'prata', points: 600, bonus: 420, balance: 30,
                referrals: [11], sponsor: 1, plan: 'basico',
                active: true, createdAt: '2025-09-10', avatar: null, role: 'user'
            },
            {
                id: 4, username: 'ana.oliveira', password: '123456', name: 'Ana Oliveira',
                email: 'ana@email.com', phone: '(31) 96666-0004', cpf: '456.789.012-03',
                level: 'prata', points: 450, bonus: 300, balance: 20,
                referrals: [], sponsor: 1, plan: 'basico',
                active: true, createdAt: '2025-10-05', avatar: null, role: 'user'
            },
            {
                id: 5, username: 'pedro.lima', password: '123456', name: 'Pedro Lima',
                email: 'pedro@email.com', phone: '(41) 95555-0005', cpf: '567.890.123-04',
                level: 'prata', points: 300, bonus: 200, balance: 15,
                referrals: [12], sponsor: 1, plan: 'basico',
                active: true, createdAt: '2025-11-12', avatar: null, role: 'user'
            },
            {
                id: 6, username: 'carla.souza', password: '123456', name: 'Carla Souza',
                email: 'carla@email.com', phone: '(51) 94444-0006', cpf: '678.901.234-05',
                level: 'prata', points: 200, bonus: 150, balance: 10,
                referrals: [], sponsor: 1, plan: 'basico',
                active: false, createdAt: '2025-12-01', avatar: null, role: 'user'
            },
            {
                id: 7, username: 'lucas.ferr', password: '123456', name: 'Lucas Ferreira',
                email: 'lucas@email.com', phone: '(61) 93333-0007', cpf: '789.012.345-06',
                level: 'prata', points: 150, bonus: 100, balance: 5,
                referrals: [], sponsor: 1, plan: 'basico',
                active: true, createdAt: '2026-01-15', avatar: null, role: 'user'
            },
            {
                id: 8, username: 'julia.costa', password: '123456', name: 'Julia Costa',
                email: 'julia@email.com', phone: '(71) 92222-0008', cpf: '890.123.456-07',
                level: 'prata', points: 100, bonus: 80, balance: 0,
                referrals: [], sponsor: 1, plan: 'basico',
                active: true, createdAt: '2026-02-01', avatar: null, role: 'user'
            },
            {
                id: 9, username: 'rafael.mend', password: '123456', name: 'Rafael Mendes',
                email: 'rafael@email.com', phone: '(81) 91111-0009', cpf: '901.234.567-08',
                level: 'prata', points: 80, bonus: 50, balance: 0,
                referrals: [], sponsor: 2, plan: 'basico',
                active: true, createdAt: '2026-01-20', avatar: null, role: 'user'
            },
            {
                id: 10, username: 'fernanda.r', password: '123456', name: 'Fernanda Rocha',
                email: 'fernanda@email.com', phone: '(91) 90000-0010', cpf: '012.345.678-09',
                level: 'prata', points: 60, bonus: 30, balance: 0,
                referrals: [], sponsor: 2, plan: 'basico',
                active: true, createdAt: '2026-02-10', avatar: null, role: 'user'
            },
            {
                id: 11, username: 'gabriel.alm', password: '123456', name: 'Gabriel Almeida',
                email: 'gabriel@email.com', phone: '(11) 99900-0011', cpf: '111.222.333-44',
                level: 'prata', points: 40, bonus: 20, balance: 0,
                referrals: [], sponsor: 3, plan: 'basico',
                active: true, createdAt: '2026-02-15', avatar: null, role: 'user'
            },
            {
                id: 12, username: 'camila.dias', password: '123456', name: 'Camila Dias',
                email: 'camila@email.com', phone: '(21) 98800-0012', cpf: '222.333.444-55',
                level: 'prata', points: 30, bonus: 10, balance: 0,
                referrals: [], sponsor: 5, plan: 'basico',
                active: true, createdAt: '2026-02-20', avatar: null, role: 'user'
            }
        ]);

        // Admin
        this.set('admins', [
            { id: 1, username: 'admin', password: 'admin123', name: 'Administrador', role: 'superadmin' }
        ]);

        // Níveis do sistema
        this.set('levels', {
            prata:    { name: 'Prata',    minPoints: 0,    color: '#9e9e9e', icon: '🥈', bonus: 5,  comission: 5  },
            ouro:     { name: 'Ouro',     minPoints: 1000, color: '#ffc107', icon: '🥇', bonus: 10, comission: 8  },
            diamante: { name: 'Diamante', minPoints: 2000, color: '#00bcd4', icon: '💎', bonus: 15, comission: 12 }
        });

        // Planos
        this.set('plans', [
            { id: 'basico',   name: 'Básico',      price: 49.90,  features: ['Limpa Nome básico', '1 consulta/mês', 'Suporte email'] },
            { id: 'plus',     name: 'Plus',         price: 99.90,  features: ['Limpa Nome completo', '5 consultas/mês', 'Suporte prioritário', 'Relatórios'] },
            { id: 'premium',  name: 'Premium',      price: 199.90, features: ['Limpa Nome VIP', 'Consultas ilimitadas', 'Suporte 24h', 'Relatórios avançados', 'Bacen completo'] }
        ]);

        // Pacotes
        this.set('packages', [
            { id: 1, name: 'Pacote Starter',   price: 149.90,  points: 100, description: 'Ideal para começar' },
            { id: 2, name: 'Pacote Business',   price: 349.90,  points: 300, description: 'Para crescimento acelerado' },
            { id: 3, name: 'Pacote Enterprise',  price: 699.90,  points: 700, description: 'Máximo desempenho' },
            { id: 4, name: 'Pacote Diamond',     price: 1499.90, points: 1500, description: 'Exclusivo para líderes' }
        ]);

        // Processos Limpa Nome
        this.set('limpanome_processes', [
            { id: 1, userId: 1, cpf: '123.456.789-00', name: 'CredBusiness', status: 'concluido', type: 'negativacao', value: 5200, institution: 'Serasa', createdAt: '2025-12-10', updatedAt: '2026-01-15' },
            { id: 2, userId: 2, cpf: '234.567.890-01', name: 'Maria Silva', status: 'em_andamento', type: 'negativacao', value: 3400, institution: 'SPC', createdAt: '2026-01-20', updatedAt: '2026-02-28' },
            { id: 3, userId: 3, cpf: '345.678.901-02', name: 'João Santos', status: 'pendente', type: 'divida', value: 8900, institution: 'Boa Vista', createdAt: '2026-02-15', updatedAt: '2026-02-15' },
            { id: 4, userId: 1, cpf: '123.456.789-00', name: 'CredBusiness', status: 'em_andamento', type: 'divida', value: 12000, institution: 'Serasa', createdAt: '2026-02-01', updatedAt: '2026-03-01' }
        ]);

        // Transações financeiras
        this.set('transactions', [
            { id: 1, userId: 1, type: 'bonus', amount: 80, description: 'Bônus indicação - Maria Silva', date: '2026-03-04', status: 'creditado' },
            { id: 2, userId: 1, type: 'bonus', amount: 60, description: 'Bônus indicação - João Santos', date: '2026-03-03', status: 'creditado' },
            { id: 3, userId: 1, type: 'comissao', amount: 120, description: 'Comissão rede - Nível 2', date: '2026-03-02', status: 'creditado' },
            { id: 4, userId: 1, type: 'saque', amount: -200, description: 'Saque via PIX', date: '2026-02-28', status: 'concluido' },
            { id: 5, userId: 1, type: 'bonus', amount: 150, description: 'Bônus pacote - Pedro Lima', date: '2026-02-25', status: 'creditado' },
            { id: 6, userId: 2, type: 'bonus', amount: 50, description: 'Bônus indicação - Rafael Mendes', date: '2026-03-01', status: 'creditado' }
        ]);

        // Informativos/Notícias
        this.set('news', [
            { id: 1, title: 'Nova funcionalidade Limpa Nome Pro', content: 'Agora você pode acompanhar seus processos em tempo real com notificações automáticas.', date: '2026-03-04', category: 'novidade' },
            { id: 2, title: 'Evento Online - Março 2026', content: 'Participe do nosso webinar exclusivo sobre estratégias de crescimento de rede. Data: 15/03/2026 às 20h.', date: '2026-03-02', category: 'evento' },
            { id: 3, title: 'Atualização do sistema de pontos', content: 'O sistema de pontuação foi atualizado. Agora cada indicação ativa gera mais pontos para sua graduação.', date: '2026-02-28', category: 'sistema' },
            { id: 4, title: 'Promoção Pacote Diamond', content: 'Adquira o Pacote Diamond com 20% de desconto até o final de março!', date: '2026-02-25', category: 'promocao' }
        ]);

        // Eventos
        this.set('events', [
            { id: 1, title: 'Webinar: Crescimento de Rede', date: '2026-03-15', time: '20:00', type: 'online', location: 'Zoom', description: 'Estratégias avançadas para crescer sua rede de indicações.', status: 'proximo' },
            { id: 2, title: 'Encontro Regional SP', date: '2026-03-22', time: '14:00', type: 'presencial', location: 'São Paulo - SP', description: 'Encontro presencial para networking e treinamento.', status: 'proximo' },
            { id: 3, title: 'Live: Novidades MI2', date: '2026-02-20', time: '19:00', type: 'online', location: 'YouTube', description: 'Apresentação das novidades da plataforma.', status: 'passado' }
        ]);

        // Tickets de suporte
        this.set('tickets', [
            { id: 1, userId: 1, subject: 'Dúvida sobre comissões', message: 'Gostaria de entender melhor como funcionam as comissões de rede.', status: 'respondido', priority: 'media', createdAt: '2026-03-01', responses: [{ from: 'admin', message: 'As comissões são calculadas com base no nível e volume da sua rede.', date: '2026-03-02' }] },
            { id: 2, userId: 2, subject: 'Problema no processo Limpa Nome', message: 'Meu processo está parado há mais de 15 dias.', status: 'aberto', priority: 'alta', createdAt: '2026-03-03', responses: [] }
        ]);

        // Configurações do sistema (admin)
        this.set('settings', {
            siteName: 'MI2',
            siteTitle: 'MI2 — Escritório Virtual',
            logoText: 'MI2',
            faviconEmoji: '💎',
            primaryColor: '#6366f1',
            accentColor: '#10b981',
            footerText: '© 2026 MI2',
            loginBg: 'css/Fundo/Fundo.jpg',
            commissionLevel1: 10,
            commissionLevel2: 5,
            commissionLevel3: 3,
            minWithdraw: 50,
            maintenanceMode: false
        });

        this.set('initialized', true);
    },

    // ── Sessão ──
    login(username, password) {
        const users = this.get('users') || [];
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            this.set('currentUser', { id: user.id, role: 'user' });
            return { success: true, user };
        }
        return { success: false };
    },

    adminLogin(username, password) {
        const admins = this.get('admins') || [];
        const admin = admins.find(a => a.username === username && a.password === password);
        if (admin) {
            this.set('currentUser', { id: admin.id, role: 'admin' });
            return { success: true, admin };
        }
        return { success: false };
    },

    logout() {
        this.remove('currentUser');
    },

    getCurrentUser() {
        const session = this.get('currentUser');
        if (!session) return null;
        if (session.role === 'admin') {
            const admins = this.get('admins') || [];
            return { ...admins.find(a => a.id === session.id), role: 'admin' };
        }
        const users = this.get('users') || [];
        return { ...users.find(u => u.id === session.id), role: 'user' };
    },

    // ── Usuários ──
    getUser(id) {
        const users = this.get('users') || [];
        return users.find(u => u.id === id);
    },

    getAllUsers() {
        return this.get('users') || [];
    },

    updateUser(id, data) {
        const users = this.get('users') || [];
        const idx = users.findIndex(u => u.id === id);
        if (idx !== -1) {
            users[idx] = { ...users[idx], ...data };
            this.set('users', users);
            return true;
        }
        return false;
    },

    addUser(userData) {
        const users = this.get('users') || [];
        const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
        const newUser = {
            id: newId,
            username: userData.username,
            password: userData.password || '123456',
            name: userData.name,
            email: userData.email || '',
            phone: userData.phone || '',
            cpf: userData.cpf || '',
            level: 'prata',
            points: 0,
            bonus: 0,
            balance: 0,
            referrals: [],
            sponsor: userData.sponsor || null,
            plan: userData.plan || 'basico',
            active: true,
            createdAt: new Date().toISOString().split('T')[0],
            avatar: null,
            role: 'user'
        };
        users.push(newUser);

        // Add to sponsor's referrals
        if (newUser.sponsor) {
            const sponsorIdx = users.findIndex(u => u.id === newUser.sponsor);
            if (sponsorIdx !== -1 && !users[sponsorIdx].referrals.includes(newId)) {
                users[sponsorIdx].referrals.push(newId);
            }
        }

        this.set('users', users);
        return newUser;
    },

    deleteUser(id) {
        let users = this.get('users') || [];
        users = users.filter(u => u.id !== id);
        this.set('users', users);
    },

    // ── Registro público ──
    register(data) {
        const users = this.get('users') || [];
        // Check duplicates
        if (users.find(u => u.username === data.username)) return { success: false, error: 'Nome de usuário já existe.' };
        if (users.find(u => u.email === data.email)) return { success: false, error: 'E-mail já cadastrado.' };
        if (data.cpf && users.find(u => u.cpf === data.cpf)) return { success: false, error: 'CPF já cadastrado.' };

        // Find sponsor
        let sponsorId = null;
        if (data.sponsor) {
            const sponsor = users.find(u => u.username === data.sponsor || u.id === Number(data.sponsor));
            if (!sponsor) return { success: false, error: 'Patrocinador não encontrado.' };
            sponsorId = sponsor.id;
        }

        const newUser = this.addUser({
            username: data.username,
            password: data.password,
            name: data.name,
            email: data.email,
            phone: data.phone || '',
            cpf: data.cpf || '',
            sponsor: sponsorId,
            plan: 'basico'
        });

        return { success: true, user: newUser };
    },

    // ── Recuperar senha ──
    recoverPassword(username, email) {
        const users = this.get('users') || [];
        const user = users.find(u => u.username === username && u.email === email);
        if (!user) return { success: false, error: 'Usuário ou e-mail não encontrado.' };
        // Simulate - reset to default
        const idx = users.findIndex(u => u.id === user.id);
        users[idx].password = '123456';
        this.set('users', users);
        return { success: true, message: 'Senha redefinida para: 123456' };
    },

    // ── Atualizar senha ──
    updatePassword(userId, currentPass, newPass) {
        const users = this.get('users') || [];
        const idx = users.findIndex(u => u.id === userId);
        if (idx === -1) return { success: false, error: 'Usuário não encontrado.' };
        if (users[idx].password !== currentPass) return { success: false, error: 'Senha atual incorreta.' };
        users[idx].password = newPass;
        this.set('users', users);
        return { success: true };
    },

    // ── Rede / MLM ──
    getNetwork(userId) {
        const users = this.get('users') || [];
        const user = users.find(u => u.id === userId);
        if (!user) return { directs: [], team: [] };

        const directs = users.filter(u => u.sponsor === userId);
        const team = [];

        function getDescendants(uid) {
            const children = users.filter(u => u.sponsor === uid);
            children.forEach(c => {
                team.push(c);
                getDescendants(c.id);
            });
        }
        getDescendants(userId);

        return { directs, team };
    },

    getNetworkTree(userId) {
        const users = this.get('users') || [];
        function buildTree(uid) {
            const user = users.find(u => u.id === uid);
            if (!user) return null;
            const children = users.filter(u => u.sponsor === uid);
            return {
                ...user,
                children: children.map(c => buildTree(c.id)).filter(Boolean)
            };
        }
        return buildTree(userId);
    },

    // ── Transações ──
    getTransactions(userId) {
        const tx = this.get('transactions') || [];
        return userId ? tx.filter(t => t.userId === userId) : tx;
    },

    addTransaction(data) {
        const tx = this.get('transactions') || [];
        const newId = tx.length > 0 ? Math.max(...tx.map(t => t.id)) + 1 : 1;
        tx.unshift({ id: newId, ...data, date: data.date || new Date().toISOString().split('T')[0] });
        this.set('transactions', tx);
        return tx[0];
    },

    // ── Processos Limpa Nome ──
    getProcesses(userId) {
        const proc = this.get('limpanome_processes') || [];
        return userId ? proc.filter(p => p.userId === userId) : proc;
    },

    addProcess(data) {
        const proc = this.get('limpanome_processes') || [];
        const newId = proc.length > 0 ? Math.max(...proc.map(p => p.id)) + 1 : 1;
        proc.push({ id: newId, ...data, createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString().split('T')[0] });
        this.set('limpanome_processes', proc);
    },

    updateProcess(id, data) {
        const proc = this.get('limpanome_processes') || [];
        const idx = proc.findIndex(p => p.id === id);
        if (idx !== -1) {
            proc[idx] = { ...proc[idx], ...data, updatedAt: new Date().toISOString().split('T')[0] };
            this.set('limpanome_processes', proc);
        }
    },

    // ── Tickets ──
    getTickets(userId) {
        const tickets = this.get('tickets') || [];
        return userId ? tickets.filter(t => t.userId === userId) : tickets;
    },

    addTicket(data) {
        const tickets = this.get('tickets') || [];
        const newId = tickets.length > 0 ? Math.max(...tickets.map(t => t.id)) + 1 : 1;
        tickets.push({ id: newId, ...data, status: 'aberto', createdAt: new Date().toISOString().split('T')[0], responses: [] });
        this.set('tickets', tickets);
    },

    respondTicket(ticketId, response) {
        const tickets = this.get('tickets') || [];
        const idx = tickets.findIndex(t => t.id === ticketId);
        if (idx !== -1) {
            tickets[idx].responses.push({ from: response.from, message: response.message, date: new Date().toISOString().split('T')[0] });
            tickets[idx].status = response.from === 'admin' ? 'respondido' : 'aberto';
            this.set('tickets', tickets);
        }
    },

    // ── Settings helpers ──
    getSettings() {
        const defaults = {
            siteName: 'MI2', siteTitle: 'MI2 — Escritório Virtual', logoText: 'MI2',
            faviconEmoji: '💎', primaryColor: '#6366f1', accentColor: '#10b981',
            footerText: '© 2026 MI2', loginBg: 'css/Fundo/Fundo.jpg',
            commissionLevel1: 10, commissionLevel2: 5, commissionLevel3: 3,
            minWithdraw: 50, maintenanceMode: false
        };
        return { ...defaults, ...(this.get('settings') || {}) };
    },

    saveSettings(data) {
        const current = this.getSettings();
        this.set('settings', { ...current, ...data });
    },

    // ── Full export/import ──
    exportAll() {
        const keys = ['users','admins','levels','plans','packages','limpanome_processes','transactions','news','events','tickets','settings'];
        const data = {};
        keys.forEach(k => { data[k] = this.get(k); });
        return data;
    },

    importAll(data) {
        Object.keys(data).forEach(k => { this.set(k, data[k]); });
    },

    resetAll() {
        const keys = ['users','admins','levels','plans','packages','limpanome_processes','transactions','news','events','tickets','settings','initialized','currentUser'];
        keys.forEach(k => this.remove(k));
        this.init();
    },

    // ── Stats ──
    getDashboardStats(userId) {
        const user = this.getUser(userId);
        if (!user) return {};
        const network = this.getNetwork(userId);
        const levels = this.get('levels');
        const currentLevel = levels[user.level];
        const levelKeys = Object.keys(levels);
        const currentIdx = levelKeys.indexOf(user.level);
        const nextLevel = currentIdx < levelKeys.length - 1 ? levels[levelKeys[currentIdx + 1]] : null;

        return {
            indicados: network.directs.length,
            equipe: network.team.length + network.directs.length,
            bonus: user.bonus,
            saldo: user.balance,
            points: user.points,
            level: currentLevel,
            levelKey: user.level,
            nextLevel: nextLevel,
            nextLevelKey: nextLevel ? levelKeys[currentIdx + 1] : null,
            progressToNext: nextLevel ? Math.min(100, (user.points / nextLevel.minPoints) * 100) : 100
        };
    }
};

// Initialize on load
DB.init();
