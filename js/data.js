/* ========================================
   MI2 - Sistema de Dados (API + Cache)
   Backend API com cache localStorage
   ======================================== */

const DB = {
    // ── API Config ──
    API_URL: '', // Relative URL (same origin)

    // ── Token Management ──
    getToken() { return localStorage.getItem('mi2_token'); },
    setToken(token) { localStorage.setItem('mi2_token', token); },
    removeToken() { localStorage.removeItem('mi2_token'); },

    // ── API Helper ──
    async api(method, url, data) {
        try {
            const token = this.getToken();
            const opts = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (token) opts.headers['Authorization'] = 'Bearer ' + token;
            if (data && method !== 'GET') opts.body = JSON.stringify(data);
            const res = await fetch(this.API_URL + url, opts);
            if (res.status === 401) {
                this.removeToken();
                this.remove('currentUser');
                return null;
            }
            return await res.json();
        } catch (e) {
            console.error('API Error:', e);
            return null;
        }
    },

    // Fire-and-forget API call (for background sync of writes)
    apiBackground(method, url, data) {
        this.api(method, url, data).catch(() => {});
    },

    // ── Helpers localStorage ──
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

    // ── Inicializar ──
    init() {
        // Se já tem dados em cache, manter (não precisa re-seedar)
        // O backend é a fonte de verdade — dados são sincronizados no login
        // Para retrocompatibilidade: se não tem token mas tem dados antigos, limpar
        if (!this.getToken() && this.get('initialized')) {
            // Manter settings para branding na tela de login
            const settings = this.get('settings');
            // Não limpar tudo — manter settings para o login page
            if (settings) return;
        }
        // Se nunca inicializou e não tem token, criar settings padrão para login page
        if (!this.get('settings')) {
            // Tenta buscar settings do servidor (público)
            this.api('GET', '/api/content/settings').then(s => {
                if (s) this.set('settings', s);
            }).catch(() => {});

            // Fallback settings para render imediato
            this.set('settings', {
                siteName: 'MI2', siteTitle: 'MI2 — Escritório Virtual', logoText: 'MI2',
                faviconEmoji: '💎', primaryColor: '#6366f1', accentColor: '#10b981',
                footerText: '© 2026 MI2', loginBg: 'css/Fundo/Fundo.jpg',
                commissionLevel1: 10, commissionLevel2: 5, commissionLevel3: 3,
                minWithdraw: 50, maintenanceMode: false
            });
        }
    },

    // ── Sync completo do servidor ──
    async syncData() {
        const data = await this.api('GET', '/api/sync');
        if (!data) return false;

        if (data.users) this.set('users', data.users);
        if (data.levels) this.set('levels', data.levels);
        if (data.plans) this.set('plans', data.plans);
        if (data.packages) this.set('packages', data.packages);
        if (data.limpanome_processes) this.set('limpanome_processes', data.limpanome_processes);
        if (data.transactions) this.set('transactions', data.transactions);
        if (data.news) this.set('news', data.news);
        if (data.events) this.set('events', data.events);
        if (data.tickets) this.set('tickets', data.tickets);
        if (data.settings) this.set('settings', data.settings);
        if (data.admins) this.set('admins', data.admins);
        this.set('initialized', true);

        return true;
    },

    // ── Sessão ──
    async login(username, password) {
        const result = await this.api('POST', '/api/auth/login', { username, password });
        if (!result) return { success: false, error: 'Erro de conexão com o servidor' };
        if (!result.success) return { success: false, error: result.error || 'Credenciais inválidas' };

        // Se 2FA está habilitado, retornar para etapa de verificação
        if (result.requires2FA) {
            return { success: true, requires2FA: true, tempToken: result.tempToken };
        }

        this.setToken(result.token);
        this.set('currentUser', { id: result.user.id, role: 'user' });

        // Sync all data from server
        await this.syncData();

        return { success: true, user: result.user };
    },

    // Verificar código 2FA (segunda etapa do login)
    async verify2FA(tempToken, code) {
        const result = await this.api('POST', '/api/auth/verify-2fa', { tempToken, code });
        if (!result) return { success: false, error: 'Erro de conexão com o servidor' };
        if (!result.success) return { success: false, error: result.error || 'Código inválido' };

        this.setToken(result.token);
        this.set('currentUser', { id: result.user.id, role: 'user' });

        await this.syncData();
        return { success: true, user: result.user };
    },

    async adminLogin(username, password) {
        const result = await this.api('POST', '/api/auth/admin-login', { username, password });
        if (!result) return { success: false, error: 'Erro de conexão com o servidor' };
        if (!result.success) return { success: false, error: result.error || 'Credenciais inválidas' };

        this.setToken(result.token);
        this.set('currentUser', { id: result.admin.id, role: 'admin' });

        // Sync all data from server
        await this.syncData();

        return { success: true, admin: result.admin };
    },

    logout() {
        this.removeToken();
        this.remove('currentUser');
        // Keep settings for login page branding
        const settings = this.get('settings');
        const keys = ['users','admins','levels','plans','packages','limpanome_processes','transactions','news','events','tickets','initialized'];
        keys.forEach(k => this.remove(k));
        if (settings) this.set('settings', settings);
    },

    getCurrentUser() {
        const session = this.get('currentUser');
        if (!session) return null;
        // Verify we have a token
        if (!this.getToken()) { this.remove('currentUser'); return null; }

        if (session.role === 'admin') {
            const admins = this.get('admins') || [];
            const admin = admins.find(a => a.id === session.id);
            return admin ? { ...admin, role: 'admin' } : { id: session.id, name: 'Administrador', role: 'admin', username: 'admin' };
        }
        const users = this.get('users') || [];
        const user = users.find(u => u.id === session.id);
        return user ? { ...user, role: 'user' } : null;
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
            // Sync to backend
            this.apiBackground('PUT', `/api/admin/users/${id}`, data);
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
        this.apiBackground('DELETE', `/api/admin/users/${id}`);
    },

    // ── Registro (async) ──
    async register(data) {
        const result = await this.api('POST', '/api/auth/register', data);
        if (!result) return { success: false, error: 'Erro de conexão com o servidor' };
        return result;
    },

    // ── Recuperar senha (async) ──
    async recoverPassword(username, email) {
        const result = await this.api('POST', '/api/auth/forgot-password', { username, email });
        if (!result) return { success: false, error: 'Erro de conexão com o servidor' };
        return result;
    },

    // ── Redefinir senha via token (async) ──
    async resetPassword(token, newPassword) {
        const result = await this.api('POST', '/api/auth/reset-password', { token, newPassword });
        if (!result) return { success: false, error: 'Erro de conexão com o servidor' };
        return result;
    },

    // ── Atualizar senha (async) ──
    async updatePassword(userId, currentPass, newPass) {
        const result = await this.api('POST', '/api/auth/change-password', {
            currentPassword: currentPass,
            newPassword: newPass
        });
        if (!result) return { success: false, error: 'Erro de conexão' };
        return result;
    },

    // ── Rede / MLM ──
    getNetwork(userId) {
        const users = this.get('users') || [];
        const user = users.find(u => u.id === userId);
        if (!user) return { directs: [], team: [] };

        const directs = users.filter(u => u.sponsor === userId || u.sponsor_id === userId);
        const team = [];

        function getDescendants(uid) {
            const children = users.filter(u => u.sponsor === uid || u.sponsor_id === uid);
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
            const children = users.filter(u => u.sponsor === uid || u.sponsor_id === uid);
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
        return userId ? tx.filter(t => t.userId === userId || t.user_id === userId) : tx;
    },

    addTransaction(data) {
        const tx = this.get('transactions') || [];
        const newId = tx.length > 0 ? Math.max(...tx.map(t => t.id)) + 1 : 1;
        const newTx = { id: newId, ...data, date: data.date || new Date().toISOString().split('T')[0] };
        tx.unshift(newTx);
        this.set('transactions', tx);
        // Sync to backend
        this.apiBackground('POST', '/api/admin/transactions', {
            user_id: data.userId || data.user_id,
            type: data.type,
            amount: data.amount,
            description: data.description,
            status: data.status
        });
        return newTx;
    },

    // ── Processos Limpa Nome ──
    getProcesses(userId) {
        const proc = this.get('limpanome_processes') || [];
        return userId ? proc.filter(p => p.userId === userId || p.user_id === userId) : proc;
    },

    addProcess(data) {
        const proc = this.get('limpanome_processes') || [];
        const newId = proc.length > 0 ? Math.max(...proc.map(p => p.id)) + 1 : 1;
        const newProc = { id: newId, ...data, createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString().split('T')[0] };
        proc.push(newProc);
        this.set('limpanome_processes', proc);
        // Sync to backend
        this.apiBackground('POST', '/api/services/processes', {
            cpf: data.cpf,
            name: data.name,
            type: data.type,
            value: data.value,
            institution: data.institution
        });
    },

    updateProcess(id, data) {
        const proc = this.get('limpanome_processes') || [];
        const idx = proc.findIndex(p => p.id === id);
        if (idx !== -1) {
            proc[idx] = { ...proc[idx], ...data, updatedAt: new Date().toISOString().split('T')[0] };
            this.set('limpanome_processes', proc);
            this.apiBackground('PUT', `/api/services/processes/${id}`, data);
        }
    },

    // ── Tickets ──
    getTickets(userId) {
        const tickets = this.get('tickets') || [];
        return userId ? tickets.filter(t => t.userId === userId || t.user_id === userId) : tickets;
    },

    addTicket(data) {
        const tickets = this.get('tickets') || [];
        const newId = tickets.length > 0 ? Math.max(...tickets.map(t => t.id)) + 1 : 1;
        const newTicket = { id: newId, ...data, status: 'aberto', createdAt: new Date().toISOString().split('T')[0], responses: [] };
        tickets.push(newTicket);
        this.set('tickets', tickets);
        // Sync to backend
        this.apiBackground('POST', '/api/tickets', {
            subject: data.subject,
            message: data.message,
            priority: data.priority
        });
    },

    respondTicket(ticketId, response) {
        const tickets = this.get('tickets') || [];
        const idx = tickets.findIndex(t => t.id === ticketId);
        if (idx !== -1) {
            tickets[idx].responses.push({ from: response.from, message: response.message, date: new Date().toISOString().split('T')[0] });
            tickets[idx].status = response.from === 'admin' ? 'respondido' : 'aberto';
            this.set('tickets', tickets);
            // Sync to backend
            const endpoint = response.from === 'admin'
                ? `/api/admin/tickets/${ticketId}/respond`
                : `/api/tickets/${ticketId}/respond`;
            this.apiBackground('POST', endpoint, { message: response.message });
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
        this.apiBackground('PUT', '/api/admin/settings', data);
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
        this.removeToken();
        this.init();
    },

    // ── Stats ──
    getDashboardStats(userId) {
        const user = this.getUser(userId);
        if (!user) return {};
        const network = this.getNetwork(userId);
        const levels = this.get('levels');
        const currentLevel = levels ? levels[user.level] : {};
        const levelKeys = levels ? Object.keys(levels) : [];
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
