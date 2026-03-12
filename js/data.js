/* ========================================
   Credbusiness - Sistema de Dados (API + Cache)
   Backend API com cache localStorage
   ======================================== */

const DB = {
    // ── API Config ──
    API_URL: '', // Relative URL (same origin)

    // ── Token Management ──
    getToken() { return localStorage.getItem('credbusiness_token'); },
    setToken(token) { localStorage.setItem('credbusiness_token', token); },
    removeToken() { localStorage.removeItem('credbusiness_token'); },

    // ── API Helper ──
    async api(method, url, data) {
        try {
            const token = this.getToken();
            const opts = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (token) opts.headers['Authorization'] = 'Bearer ' + token;
            // CSRF token from cookie for non-GET requests without Bearer
            if (method !== 'GET' && !token) {
                const csrfToken = document.cookie.split('; ').find(c => c.startsWith('csrf_token='));
                if (csrfToken) opts.headers['x-csrf-token'] = csrfToken.split('=')[1];
            }
            if (data && method !== 'GET') opts.body = JSON.stringify(data);
            const res = await fetch(this.API_URL + url, opts);
            if (res.status === 401 && token) {
                // Token expirado/inválido — limpar sessão (mas não em requisições de login)
                this.removeToken();
                this.remove('currentUser');
                if (!url.startsWith('/api/auth/')) {
                    return null;
                }
            }
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                console.error('API non-JSON response:', res.status, url);
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
        try { return JSON.parse(localStorage.getItem('credbusiness_' + key)); }
        catch { return null; }
    },
    set(key, val) {
        localStorage.setItem('credbusiness_' + key, JSON.stringify(val));
    },
    remove(key) {
        localStorage.removeItem('credbusiness_' + key);
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
                siteName: 'Credbusiness', siteTitle: 'Credbusiness — Escritório Virtual', logoText: 'Credbusiness',
                faviconEmoji: '💎', primaryColor: '#6366f1', accentColor: '#10b981',
                footerText: '© 2026 Credbusiness', loginBg: 'css/Fundo/Fundo.jpg',
                commissionLevel1: 10, commissionLevel2: 5, commissionLevel3: 3,
                minWithdraw: 100, withdrawFee: 2.50, monthlyFee: 95, maintenanceMode: false
            });
        }
    },

    // ── Sync completo do servidor ──
    async syncData() {
        const data = await this.api('GET', '/api/sync');
        if (!data) return false;

        // Limpar dados anteriores para evitar misturar admin/usuário
        const dataKeys = ['users','admins','levels','plans','packages','limpanome_processes','transactions','news','events','tickets','notifications','unreadNotifications','customPages'];
        dataKeys.forEach(k => this.remove(k));

        if (data.role) this.set('syncRole', data.role);
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
        if (data.notifications) this.set('notifications', data.notifications);
        if (data.unreadNotifications !== undefined) this.set('unreadNotifications', data.unreadNotifications);
        if (data.customPages) this.set('customPages', data.customPages);
        this.set('initialized', true);

        // Connect SSE for real-time updates
        this.connectSSE();

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
        this._closeSSE();
        this.removeToken();
        this.remove('currentUser');
        // Keep settings for login page branding
        const settings = this.get('settings');
        const keys = ['users','admins','levels','plans','packages','limpanome_processes','transactions','news','events','tickets','initialized','notifications','unreadNotifications','customPages'];
        keys.forEach(k => this.remove(k));
        if (settings) this.set('settings', settings);
    },

    getCurrentUser() {
        const session = this.get('currentUser');
        if (!session) return null;
        // Verify we have a valid (non-expired) token
        const token = this.getToken();
        if (!token) { this.remove('currentUser'); return null; }
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.exp && payload.exp * 1000 < Date.now()) {
                this.removeToken();
                this.remove('currentUser');
                return null;
            }
        } catch { this.removeToken(); this.remove('currentUser'); return null; }

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
        // Sync to backend
        this.apiBackground('POST', '/api/admin/users', {
            username: userData.username || userData.email,
            password: userData.password,
            name: userData.name,
            email: userData.email,
            phone: userData.phone,
            cpf: userData.cpf,
            level: userData.level,
            plan: userData.plan,
            sponsor_id: userData.sponsor,
            active: userData.active !== false
        });
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
            this.apiBackground('PUT', `/api/admin/processes/${id}`, data);
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
            siteName: 'Credbusiness', siteTitle: 'Credbusiness — Escritório Virtual', logoText: 'Credbusiness',
            faviconEmoji: '💎', primaryColor: '#6366f1', accentColor: '#10b981',
            footerText: '© 2026 Credbusiness', loginBg: 'css/Fundo/Fundo.jpg',
            commissionLevel1: 10, commissionLevel2: 5, commissionLevel3: 3,
            minWithdraw: 100, withdrawFee: 2.50, monthlyFee: 95, maintenanceMode: false, hiddenPages: 'assinaturas'
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
    },

    // ── Notificações ──
    getNotifications() {
        return this.get('notifications') || [];
    },

    getUnreadCount() {
        return this.get('unreadNotifications') || 0;
    },

    async fetchNotifications() {
        const result = await this.api('GET', '/api/notifications');
        if (result && result.notifications) {
            this.set('notifications', result.notifications);
            return result.notifications;
        }
        return this.getNotifications();
    },

    async fetchUnreadCount() {
        const result = await this.api('GET', '/api/notifications/count');
        if (result) {
            this.set('unreadNotifications', result.unread);
            return result.unread;
        }
        return 0;
    },

    async markNotificationRead(id) {
        await this.api('PUT', `/api/notifications/${id}/read`);
        const notifs = this.getNotifications();
        const idx = notifs.findIndex(n => n.id === id);
        if (idx !== -1) { notifs[idx].read = 1; this.set('notifications', notifs); }
        const count = this.getUnreadCount();
        if (count > 0) this.set('unreadNotifications', count - 1);
    },

    async markAllNotificationsRead() {
        await this.api('PUT', '/api/notifications/read-all');
        const notifs = this.getNotifications();
        notifs.forEach(n => n.read = 1);
        this.set('notifications', notifs);
        this.set('unreadNotifications', 0);
    },

    async deleteNotification(id) {
        await this.api('DELETE', `/api/notifications/${id}`);
        let notifs = this.getNotifications();
        const n = notifs.find(n => n.id === id);
        if (n && !n.read) {
            const count = this.getUnreadCount();
            if (count > 0) this.set('unreadNotifications', count - 1);
        }
        notifs = notifs.filter(n => n.id !== id);
        this.set('notifications', notifs);
    },

    // ── University ──
    async fetchCourses() {
        return await this.api('GET', '/api/university/courses') || [];
    },

    async fetchCourseProgress() {
        return await this.api('GET', '/api/university/progress') || [];
    },

    async markCourseCompleted(courseId) {
        return await this.api('POST', '/api/university/progress', { courseId });
    },

    async unmarkCourseCompleted(courseId) {
        return await this.api('DELETE', `/api/university/progress/${courseId}`);
    },

    // ── Reports ──
    async fetchSalesReport(from, to) {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        return await this.api('GET', `/api/reports/sales?${params}`) || {};
    },

    async fetchCommissionsReport(from, to, type) {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (type) params.set('type', type);
        return await this.api('GET', `/api/reports/commissions?${params}`) || {};
    },

    // ── Documents ──
    async uploadDocument(processId, file) {
        try {
            const token = this.getToken();
            const formData = new FormData();
            formData.append('document', file);
            const res = await fetch(`${this.API_URL}/api/documents/upload/${processId}`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: formData
            });
            return await res.json();
        } catch (e) {
            console.error('Upload error:', e);
            return null;
        }
    },

    async fetchProcessDocuments(processId) {
        return await this.api('GET', `/api/documents/process/${processId}`) || [];
    },

    async deleteDocument(id) {
        return await this.api('DELETE', `/api/documents/${id}`);
    },

    // ── LGPD ──
    async getLGPDConsent() {
        return await this.api('GET', '/api/lgpd/consent') || {};
    },

    async updateLGPDConsent(consent) {
        return await this.api('POST', '/api/lgpd/consent', { consent });
    },

    async exportMyData() {
        try {
            const token = this.getToken();
            const res = await fetch(`${this.API_URL}/api/lgpd/export`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'meus-dados-credbusiness.json';
            link.click();
            URL.revokeObjectURL(url);
            return { success: true };
        } catch (e) {
            console.error('Export error:', e);
            return { success: false };
        }
    },

    async requestDataDeletion(password) {
        return await this.api('POST', '/api/lgpd/delete-request', { password });
    },

    // ── Pagamentos (Asaas) ──
    async createPackagePayment(packageId, method, cardData) {
        const body = { method };
        if (method === 'credit_card' && cardData) {
            body.creditCard = cardData.creditCard;
            body.creditCardHolderInfo = cardData.creditCardHolderInfo;
        }
        return await this.api('POST', `/api/payments/package/${packageId}`, body);
    },

    async createPlanPayment(planId, method, cardData) {
        const body = { method };
        if (method === 'credit_card' && cardData) {
            body.creditCard = cardData.creditCard;
            body.creditCardHolderInfo = cardData.creditCardHolderInfo;
        }
        return await this.api('POST', `/api/payments/plan/${planId}`, body);
    },

    async checkPaymentStatus(paymentId) {
        return await this.api('GET', `/api/payments/${paymentId}/status`);
    },

    async getMyPayments() {
        const result = await this.api('GET', '/api/payments/my');
        return result && result.payments ? result.payments : [];
    },

    async getPixQrCode(paymentId) {
        return await this.api('GET', `/api/payments/${paymentId}/pix`);
    },

    async requestWithdraw(amount, pixKey) {
        return await this.api('POST', '/api/services/transactions/withdraw', { amount, pixKey });
    },

    // ── Mensalidade ──
    async getMonthlyFeeStatus() {
        return await this.api('GET', '/api/payments/monthly-fee/status');
    },

    async payMonthlyFee(method) {
        return await this.api('POST', '/api/payments/monthly-fee/pay', { method });
    },

    // ── Wallet (PIX, Financial Password, Transfer, Deposit) ──
    async getPixInfo() {
        return await this.api('GET', '/api/wallet/pix') || {};
    },

    async updatePix(pix_key, pix_type) {
        return await this.api('PUT', '/api/wallet/pix', { pix_key, pix_type });
    },

    async getFinancialPasswordStatus() {
        return await this.api('GET', '/api/wallet/financial-password/status') || {};
    },

    async setFinancialPassword(password, currentPassword) {
        return await this.api('POST', '/api/wallet/financial-password', { password, currentPassword });
    },

    async walletTransfer(username, amount, financialPassword) {
        return await this.api('POST', '/api/wallet/transfer', { username, amount, financialPassword });
    },

    async walletDeposit(amount, method) {
        return await this.api('POST', '/api/wallet/deposit', { amount, method });
    },

    async getWithdrawals() {
        return await this.api('GET', '/api/wallet/withdrawals') || [];
    },

    // ── Downloads ──
    async getDownloads() {
        return await this.api('GET', '/api/wallet/downloads') || [];
    },

    // ── Event Orders & Tickets ──
    async buyEventTicket(eventId, quantity) {
        return await this.api('POST', `/api/wallet/events/${eventId}/buy`, { quantity });
    },

    async getEventOrders() {
        return await this.api('GET', '/api/wallet/events/orders') || [];
    },

    async getEventTickets() {
        return await this.api('GET', '/api/wallet/events/tickets') || [];
    },

    // ── Network Clients ──
    async getNetworkClients() {
        return await this.api('GET', '/api/wallet/network/clients') || {};
    },

    // ── Graduation Report ──
    async getGraduationReport() {
        return await this.api('GET', '/api/wallet/graduation') || {};
    },

    // ── Address ──
    async getAddress() {
        return await this.api('GET', '/api/users/address') || {};
    },

    async updateAddress(data) {
        return await this.api('PUT', '/api/users/address', data);
    },

    // ── User Documents (KYC) ──
    async getUserDocuments() {
        return await this.api('GET', '/api/users/documents') || [];
    },

    async uploadUserDocument(type, file) {
        try {
            const token = this.getToken();
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', type);
            const res = await fetch(`${this.API_URL}/api/users/documents`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: formData
            });
            return await res.json();
        } catch (e) {
            console.error('Upload error:', e);
            return null;
        }
    },

    async deleteUserDocument(id) {
        return await this.api('DELETE', `/api/users/documents/${id}`);
    },

    // ── Contracts ──
    async getContracts() {
        return await this.api('GET', '/api/users/contracts') || [];
    },

    async getContract(id) {
        return await this.api('GET', `/api/users/contracts/${id}`);
    },

    async acceptContract(id) {
        return await this.api('POST', `/api/users/contracts/${id}/accept`);
    },

    // ── Subscriptions ──
    async getSubscriptions() {
        return await this.api('GET', '/api/users/subscriptions') || [];
    },

    async getSubscription(id) {
        return await this.api('GET', `/api/users/subscriptions/${id}`);
    },

    // ── Referral Report ──
    async getReferralReport() {
        return await this.api('GET', '/api/users/referral-report') || {};
    },

    // ── Limpa Nome Dashboard ──
    async getLimpaNomeDashboard() {
        return await this.api('GET', '/api/users/limpanome-dashboard') || {};
    },

    // ═══════════════════════════════════════════
    //   SSE — Real-time updates
    // ═══════════════════════════════════════════
    _sse: null,
    _sseRetryTimer: null,
    _sseListeners: {},

    /**
     * Connect to SSE endpoint for real-time admin → user updates
     */
    connectSSE() {
        if (this._sse) return; // already connected
        const token = this.getToken();
        if (!token) return;

        // EventSource doesn't support custom headers, pass token via query
        const url = `${this.API_URL}/api/sse?token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        this._sse = es;

        // Listen for all entity update events
        const entities = ['users', 'user_updated', 'processes', 'transactions', 'tickets',
                          'packages', 'news', 'events', 'settings', 'notifications',
                          'university', 'landing', 'downloads', 'faqs', 'custom_pages'];

        entities.forEach(entity => {
            es.addEventListener(entity, (e) => {
                try {
                    const data = JSON.parse(e.data);
                    this._handleSSE(entity, data);
                } catch { /* ignore parse errors */ }
            });
        });

        es.onerror = () => {
            this._closeSSE();
            // Reconnect after 5s
            this._sseRetryTimer = setTimeout(() => this.connectSSE(), 5000);
        };
    },

    /**
     * Handle an SSE event: re-sync relevant data from server
     */
    _handleSSE(entity, data) {
        // Debounce: avoid multiple rapid syncs
        if (this._sseSyncPending) return;
        this._sseSyncPending = true;

        setTimeout(() => {
            this._sseSyncPending = false;
            this.syncData().then(() => {
                // Dispatch custom DOM event so pages can react
                window.dispatchEvent(new CustomEvent('realtime-update', {
                    detail: { entity, ...data }
                }));
            });
        }, 300);
    },

    /**
     * Close SSE connection
     */
    _closeSSE() {
        if (this._sse) {
            this._sse.close();
            this._sse = null;
        }
        if (this._sseRetryTimer) {
            clearTimeout(this._sseRetryTimer);
            this._sseRetryTimer = null;
        }
    }
};

// Initialize on load
DB.init();
