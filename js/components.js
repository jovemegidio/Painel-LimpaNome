/* ═══════════════════════════════════════════
   Credbusiness — Shared Components
   Sidebar, Header, Footer, Modal, Toast
   ═══════════════════════════════════════════ */

const Layout = {
    basePath: '',

    init(options = {}) {
        this.basePath = options.basePath || '';
        this.page = options.page || '';
        this.title = options.title || '';
        this.isAdmin = options.admin || false;
        this.settings = DB.getSettings();

        // Auth check
        const cur = DB.getCurrentUser();
        if (!cur) { window.location.href = this.basePath + 'login.html'; return; }
        if (this.isAdmin && cur.role !== 'admin') { window.location.href = this.basePath + 'login.html'; return; }
        if (!this.isAdmin && cur.role === 'admin') { window.location.href = this.basePath + 'admin/index.html'; return; }

        this.user = cur;
        this.buildLayout();
        this.initSidebar();
        this.initHeader();

        // Background sync — atualiza dados do servidor silenciosamente
        if (DB.getToken && DB.getToken()) {
            DB.syncData().then(() => {
                // Refresh user data from cache after sync
                const refreshed = DB.getCurrentUser();
                if (refreshed) this.user = refreshed;
            }).catch(() => {});
        }
    },

    buildLayout() {
        const app = document.getElementById('app');
        const pageContent = document.getElementById('page-content');
        const contentHTML = pageContent ? pageContent.innerHTML : '';

        app.innerHTML = `
            <aside class="sidebar ${this.isAdmin ? 'admin-sidebar' : ''}" id="sidebar">
                ${this.renderSidebar()}
            </aside>
            <div class="main-wrapper">
                <header class="top-header" id="topHeader">
                    ${this.renderHeader()}
                </header>
                <main class="content">
                    ${contentHTML}
                </main>
                <footer class="main-footer">
                    <p>${this.settings.footerText || '© 2026 Credbusiness'} — ${this.isAdmin ? 'Painel Administrativo' : 'Escritório Virtual'}</p>
                </footer>
            </div>
            <div class="overlay" id="overlay"></div>
            <div class="toast-container" id="toastContainer"></div>
            <div class="modal-overlay" id="modalOverlay">
                <div class="modal" id="modal">
                    <div class="modal-header"><h3 id="modalTitle"></h3><button class="modal-close" onclick="Layout.closeModal()"><i class="fas fa-times"></i></button></div>
                    <div class="modal-body" id="modalBody"></div>
                    <div class="modal-footer" id="modalFooter"></div>
                </div>
            </div>
        `;

        // Remove the template
        if (pageContent) pageContent.remove();
    },

    renderSidebar() {
        if (this.isAdmin) return this.renderAdminSidebar();

        const u = this.user;
        const levels = DB.get('levels');
        const lvl = levels ? levels[u.level] : {};
        const bp = this.basePath;
        const p = this.page;

        const menu = [
            { section: 'Principal' },
            { id: 'dashboard', icon: 'fas fa-th-large', label: 'Dashboard', href: bp + 'pages/dashboard.html' },
            { id: 'meu-plano', icon: 'fas fa-id-card', label: 'Meu Plano', href: bp + 'pages/meu-plano.html' },
            { section: 'Serviços' },
            { id: 'limpa-nome', icon: 'fas fa-broom', label: 'Limpa Nome', children: [
                { id: 'limpa-nome-consulta', label: 'Consultar CPF', href: bp + 'pages/limpa-nome-consulta.html' },
                { id: 'limpa-nome-processos', label: 'Meus Processos', href: bp + 'pages/limpa-nome-processos.html' }
            ]},
            { id: 'bacen', icon: 'fas fa-university', label: 'Bacen', children: [
                { id: 'bacen-consulta', label: 'Consulta', href: bp + 'pages/bacen-consulta.html' },
                { id: 'bacen-relatorios', label: 'Relatórios', href: bp + 'pages/bacen-relatorios.html' }
            ]},
            { id: 'pacotes', icon: 'fas fa-cube', label: 'Pacotes', children: [
                { id: 'pacotes-disponiveis', label: 'Disponíveis', href: bp + 'pages/pacotes-disponiveis.html' },
                { id: 'pacotes-meus', label: 'Meus Pacotes', href: bp + 'pages/pacotes-meus.html' }
            ]},
            { id: 'consultas', icon: 'fas fa-search', label: 'Consultas', href: bp + 'pages/consultas.html' },
            { section: 'Informações' },
            { id: 'informativos', icon: 'fas fa-newspaper', label: 'Informativos', href: bp + 'pages/informativos.html' },
            { id: 'eventos', icon: 'fas fa-calendar-alt', label: 'Eventos', href: bp + 'pages/eventos.html' },
            { section: 'Rede MLM' },
            { id: 'rede', icon: 'fas fa-sitemap', label: 'Minha Rede', children: [
                { id: 'rede-indicados', label: 'Indicados Diretos', href: bp + 'pages/rede-indicados.html' },
                { id: 'rede-equipe', label: 'Minha Equipe', href: bp + 'pages/rede-equipe.html' },
                { id: 'rede-arvore', label: 'Árvore', href: bp + 'pages/rede-arvore.html' }
            ]},
            { id: 'relatorios', icon: 'fas fa-chart-bar', label: 'Relatórios', children: [
                { id: 'relatorios-vendas', label: 'Vendas', href: bp + 'pages/relatorios-vendas.html' },
                { id: 'relatorios-comissoes', label: 'Comissões', href: bp + 'pages/relatorios-comissoes.html' }
            ]},
            { id: 'financeiro', icon: 'fas fa-wallet', label: 'Financeiro', href: bp + 'pages/financeiro.html' },
            { section: 'Aprendizado' },
            { id: 'universidade', icon: 'fas fa-graduation-cap', label: 'Universidade', href: bp + 'pages/universidade.html' },
            { section: 'Ajuda' },
            { id: 'suporte', icon: 'fas fa-headset', label: 'Suporte', children: [
                { id: 'suporte-tickets', label: 'Tickets', href: bp + 'pages/suporte-tickets.html' },
                { id: 'suporte-faq', label: 'FAQ', href: bp + 'pages/suporte-faq.html' }
            ]}
        ];

        return `
            <div class="sidebar-header">
                <a class="sidebar-brand" href="${bp}pages/dashboard.html">
                    <div class="brand-icon">${this.settings.logoText || 'Credbusiness'}</div>
                    <h1>${this.settings.siteName || 'Credbusiness'}</h1>
                </a>
            </div>
            <nav class="sidebar-nav">
                ${menu.map(item => {
                    if (item.section) return `<div class="nav-section"><div class="nav-section-title">${item.section}</div></div>`;
                    const isActive = p === item.id || (item.children && item.children.some(c => p === c.id));
                    const isOpen = item.children && item.children.some(c => p === c.id);
                    if (item.children) {
                        return `<div class="nav-section"><div class="nav-item ${isActive ? 'active' : ''} ${isOpen ? 'open' : ''}">
                            <a class="nav-link" onclick="this.parentElement.classList.toggle('open')"><i class="${item.icon}"></i><span>${item.label}</span><i class="fas fa-chevron-right arrow"></i></a>
                            <ul class="submenu">${item.children.map(c => `<li class="nav-item ${p===c.id?'active':''}"><a class="nav-link" href="${c.href}">${c.label}</a></li>`).join('')}</ul>
                        </div></div>`;
                    }
                    return `<div class="nav-section"><div class="nav-item ${isActive ? 'active' : ''}"><a class="nav-link" href="${item.href}"><i class="${item.icon}"></i><span>${item.label}</span></a></div></div>`;
                }).join('')}
            </nav>
            <div class="sidebar-footer">
                <div class="sidebar-user" onclick="window.location.href='${bp}pages/meu-plano.html'">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=${(this.settings.primaryColor||'#6366f1').replace('#','')}&color=fff&size=34&rounded=true&bold=true" alt="">
                    <div class="sidebar-user-info">
                        <div class="name">${u.name}</div>
                        <div class="role">${lvl.icon || ''} ${lvl.name || 'Prata'}</div>
                    </div>
                </div>
            </div>
        `;
    },

    renderAdminSidebar() {
        const bp = this.basePath;
        const p = this.page;
        const adminMenu = [
            { id: 'admin-dashboard', icon: 'fas fa-tachometer-alt', label: 'Dashboard', href: bp + 'admin/index.html' },
            { id: 'admin-users', icon: 'fas fa-users', label: 'Usuários', href: bp + 'admin/users.html' },
            { id: 'admin-processes', icon: 'fas fa-file-alt', label: 'Processos', href: bp + 'admin/processes.html' },
            { id: 'admin-transactions', icon: 'fas fa-exchange-alt', label: 'Transações', href: bp + 'admin/transactions.html' },
            { id: 'admin-packages', icon: 'fas fa-cube', label: 'Pacotes', href: bp + 'admin/packages.html' },
            { id: 'admin-tickets', icon: 'fas fa-headset', label: 'Tickets', href: bp + 'admin/tickets.html' },
            { id: 'admin-network', icon: 'fas fa-sitemap', label: 'Rede', href: bp + 'admin/network.html' },
            { id: 'admin-news', icon: 'fas fa-newspaper', label: 'Informativos', href: bp + 'admin/news.html' },
            { id: 'admin-events', icon: 'fas fa-calendar', label: 'Eventos', href: bp + 'admin/events.html' },
            { id: 'admin-settings', icon: 'fas fa-cog', label: 'Configurações', href: bp + 'admin/settings.html' },
        ];

        return `
            <div class="sidebar-header">
                <a class="sidebar-brand" href="${bp}admin/index.html">
                    <div class="brand-icon">${this.settings.logoText || 'Credbusiness'}</div>
                    <h1>${this.settings.siteName || 'Credbusiness'}</h1>
                </a>
            </div>
            <nav class="sidebar-nav">
                <div class="nav-section"><div class="nav-section-title">Administração</div></div>
                ${adminMenu.map(item => `<div class="nav-section"><div class="nav-item ${p===item.id?'active':''}"><a class="nav-link" href="${item.href}"><i class="${item.icon}"></i><span>${item.label}</span></a></div></div>`).join('')}
            </nav>
            <div class="sidebar-footer">
                <div class="admin-badge-tag"><i class="fas fa-shield-halved"></i> Administrador</div>
            </div>
        `;
    },

    renderHeader() {
        const u = this.user;
        const bp = this.basePath;

        if (this.isAdmin) {
            return `
                <button class="menu-toggle" id="menuToggle"><i class="fas fa-bars"></i></button>
                <div class="header-breadcrumb">Admin &rsaquo; <span>${this.title}</span></div>
                <div class="header-spacer"></div>
                <div class="header-actions">
                    <a href="${bp}pages/dashboard.html" class="btn btn-sm btn-outline"><i class="fas fa-external-link-alt"></i> Painel</a>
                </div>
                <div class="user-menu" id="userMenuBtn">
                    <img src="https://ui-avatars.com/api/?name=Admin&background=dc2626&color=fff&size=34&rounded=true&bold=true" alt="">
                    <div><div class="name">Admin</div></div>
                </div>
                <div class="dropdown" id="userDropdown">
                    <a href="#" onclick="Layout.logout();return false" class="text-danger"><i class="fas fa-sign-out-alt"></i>Sair</a>
                </div>`;
        }

        const levels = DB.get('levels');
        const lvl = levels ? levels[u.level] : {};
        return `
            <button class="menu-toggle" id="menuToggle"><i class="fas fa-bars"></i></button>
            <div class="header-breadcrumb">Painel &rsaquo; <span>${this.title}</span></div>
            <div class="header-spacer"></div>
            <div class="header-actions">
                <div class="notification-wrapper" id="notifWrapper">
                    <button class="header-btn" id="notifBtn" title="Notificações"><i class="fas fa-bell"></i><span class="dot" id="notifDot" style="display:none"></span></button>
                    <div class="notification-dropdown" id="notifDropdown">
                        <div class="notif-header">
                            <strong>Notificações</strong>
                            <a href="#" id="notifReadAll" style="font-size:.78rem;color:var(--primary)">Marcar todas como lidas</a>
                        </div>
                        <div class="notif-list" id="notifList"><div style="padding:16px;text-align:center;color:var(--text3);font-size:.85rem">Carregando...</div></div>
                        <div class="notif-footer"><a href="${bp}pages/configuracoes.html">Ver todas</a></div>
                    </div>
                </div>
            </div>
            <div class="user-menu" id="userMenuBtn">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=${(this.settings.primaryColor||'#6366f1').replace('#','')}&color=fff&size=34&rounded=true&bold=true" alt="">
                <div>
                    <div class="name">${u.name}</div>
                    <div class="level-tag">${lvl.icon || ''} ${lvl.name || 'Prata'}</div>
                </div>
            </div>
            <div class="dropdown" id="userDropdown">
                <a href="${bp}pages/meu-plano.html"><i class="fas fa-user"></i>Meu Perfil</a>
                <a href="${bp}pages/configuracoes.html"><i class="fas fa-cog"></i>Configurações</a>
                <a href="${bp}pages/financeiro.html"><i class="fas fa-wallet"></i>Financeiro</a>
                <div class="divider"></div>
                <a href="#" onclick="Layout.logout();return false" class="text-danger"><i class="fas fa-sign-out-alt"></i>Sair</a>
            </div>`;
    },

    initSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('menuToggle');
        const overlay = document.getElementById('overlay');
        toggle?.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
        overlay?.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
    },

    initHeader() {
        const btn = document.getElementById('userMenuBtn');
        const dd = document.getElementById('userDropdown');
        btn?.addEventListener('click', e => { e.stopPropagation(); dd.classList.toggle('show'); });
        document.addEventListener('click', () => dd?.classList.remove('show'));

        // ── Notifications ──
        if (!this.isAdmin) {
            this.initNotifications();
        }
    },

    initNotifications() {
        const notifBtn = document.getElementById('notifBtn');
        const notifDropdown = document.getElementById('notifDropdown');
        const notifDot = document.getElementById('notifDot');
        const notifList = document.getElementById('notifList');
        const notifReadAll = document.getElementById('notifReadAll');

        if (!notifBtn) return;

        // Toggle dropdown
        notifBtn.addEventListener('click', e => {
            e.stopPropagation();
            notifDropdown.classList.toggle('show');
            if (notifDropdown.classList.contains('show')) this.loadNotifications();
        });
        document.addEventListener('click', e => {
            if (!e.target.closest('.notification-wrapper')) notifDropdown?.classList.remove('show');
        });

        // Mark all as read
        notifReadAll?.addEventListener('click', async e => {
            e.preventDefault();
            await DB.markAllNotificationsRead();
            notifDot.style.display = 'none';
            this.loadNotifications();
        });

        // Initial count check
        DB.fetchUnreadCount().then(count => {
            if (count > 0) {
                notifDot.style.display = '';
                notifDot.textContent = count > 9 ? '9+' : count;
            }
        }).catch(() => {});
    },

    async loadNotifications() {
        const notifList = document.getElementById('notifList');
        const notifDot = document.getElementById('notifDot');
        if (!notifList) return;

        try {
            const notifs = await DB.fetchNotifications();
            if (!notifs || notifs.length === 0) {
                notifList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:.85rem"><i class="fas fa-bell-slash" style="font-size:1.5rem;margin-bottom:8px;display:block;opacity:.5"></i>Nenhuma notificação</div>';
                return;
            }

            const icons = { info: 'fa-info-circle text-primary', success: 'fa-check-circle text-success', warning: 'fa-exclamation-triangle text-warning', alert: 'fa-exclamation-circle text-danger', error: 'fa-times-circle text-danger' };
            notifList.innerHTML = notifs.slice(0, 10).map(n => `
                <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" data-link="${n.link || ''}">
                    <i class="fas ${icons[n.type] || icons.info}"></i>
                    <div class="notif-content">
                        <div class="notif-title">${n.title}</div>
                        <div class="notif-msg">${n.message}</div>
                        <div class="notif-time">${this.timeAgo(n.created_at)}</div>
                    </div>
                    <button class="notif-dismiss" onclick="event.stopPropagation();Layout.dismissNotif(${n.id})"><i class="fas fa-times"></i></button>
                </div>
            `).join('');

            // Click to navigate
            notifList.querySelectorAll('.notif-item').forEach(el => {
                el.addEventListener('click', async () => {
                    const id = el.dataset.id;
                    await DB.markNotificationRead(id);
                    const link = el.dataset.link;
                    if (link) window.location.href = this.basePath + link.replace(/^\//, '');
                });
            });

            const unread = notifs.filter(n => !n.read).length;
            if (unread > 0) {
                notifDot.style.display = '';
                notifDot.textContent = unread > 9 ? '9+' : unread;
            } else {
                notifDot.style.display = 'none';
            }
        } catch (err) {
            notifList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3)">Erro ao carregar</div>';
        }
    },

    async dismissNotif(id) {
        await DB.deleteNotification(id);
        this.loadNotifications();
    },

    timeAgo(dateStr) {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Agora';
        if (mins < 60) return mins + 'min atrás';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h atrás';
        const days = Math.floor(hrs / 24);
        if (days < 7) return days + 'd atrás';
        return new Date(dateStr).toLocaleDateString('pt-BR');
    },

    logout() { DB.logout(); window.location.href = this.basePath + 'login.html'; },

    // ── Modal ──
    openModal(title, body, footer) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;
        document.getElementById('modalFooter').innerHTML = footer || '';
        document.getElementById('modalOverlay').classList.add('show');
    },
    closeModal() { document.getElementById('modalOverlay').classList.remove('show'); },

    // ── Toast ──
    toast(msg, type) {
        type = type || 'info';
        const c = document.getElementById('toastContainer');
        const icon = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.innerHTML = `<i class="fas ${icon[type] || icon.info}"></i><span>${msg}</span>`;
        c.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
    }
};

/* ── Currency formatter ── */
function fmt(n) { return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/* ── Pagination Utility ── */
const Paginator = {
    create(containerId, items, perPage, renderFn) {
        perPage = perPage || 15;
        const state = { page: 1, items, perPage, containerId, renderFn };
        this._render(state);
        return state;
    },
    _render(state) {
        const totalPages = Math.max(1, Math.ceil(state.items.length / state.perPage));
        if (state.page > totalPages) state.page = totalPages;
        const start = (state.page - 1) * state.perPage;
        const pageItems = state.items.slice(start, start + state.perPage);
        state.renderFn(pageItems, start);

        // Render pagination controls
        let pag = document.getElementById(state.containerId + '-pagination');
        if (!pag) {
            pag = document.createElement('div');
            pag.id = state.containerId + '-pagination';
            pag.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 0;font-size:.85rem;color:var(--text3)';
            const container = document.getElementById(state.containerId);
            if (container) container.parentNode.insertBefore(pag, container.nextSibling);
        }
        if (state.items.length <= state.perPage) { pag.innerHTML = ''; return; }
        const showing = `Mostrando ${start + 1}-${Math.min(start + state.perPage, state.items.length)} de ${state.items.length}`;
        let btns = '';
        btns += `<button class="btn btn-sm btn-outline" ${state.page <= 1 ? 'disabled' : ''} onclick="Paginator._go('${state.containerId}',${state.page - 1})"><i class="fas fa-chevron-left"></i></button>`;
        for (let i = 1; i <= totalPages; i++) {
            if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - state.page) > 1) {
                if (i === 3 || i === totalPages - 2) btns += '<span style="padding:0 4px">...</span>';
                continue;
            }
            btns += `<button class="btn btn-sm ${i === state.page ? 'btn-primary' : 'btn-outline'}" onclick="Paginator._go('${state.containerId}',${i})">${i}</button>`;
        }
        btns += `<button class="btn btn-sm btn-outline" ${state.page >= totalPages ? 'disabled' : ''} onclick="Paginator._go('${state.containerId}',${state.page + 1})"><i class="fas fa-chevron-right"></i></button>`;
        pag.innerHTML = `<span>${showing}</span><div style="display:flex;gap:4px">${btns}</div>`;
        // Store state globally for navigation
        window['_pag_' + state.containerId] = state;
    },
    _go(containerId, page) {
        const state = window['_pag_' + containerId];
        if (!state) return;
        state.page = page;
        this._render(state);
    },
    update(containerId, newItems) {
        const state = window['_pag_' + containerId];
        if (!state) return;
        state.items = newItems;
        state.page = 1;
        this._render(state);
    }
};

/* ── CSV Export Utility ── */
const ExportCSV = {
    download(filename, headers, rows) {
        const bom = '\uFEFF'; // UTF-8 BOM for Excel
        const csv = bom + [headers.join(';'), ...rows.map(r => r.map(c => '"' + String(c || '').replace(/"/g, '""') + '"').join(';'))].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename + '_' + new Date().toISOString().slice(0, 10) + '.csv';
        link.click();
        URL.revokeObjectURL(link.href);
        Layout.toast('Arquivo exportado com sucesso!', 'success');
    }
};
