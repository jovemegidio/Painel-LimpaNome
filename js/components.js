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

        // Verificar se o usuário (não-admin) tem pacote ativo — se não, limitar acesso
        const freePages = ['dashboard', 'pacotes-disponiveis', 'pacotes-meus', 'meu-plano', 'configuracoes', 'suporte-tickets', 'suporte-faq', 'contratos'];
        this.hasPackage = !!(cur.has_package);
        if (!this.isAdmin && !this.hasPackage && this.page && !freePages.includes(this.page)) {
            window.location.href = this.basePath + 'pages/pacotes-disponiveis.html';
            return;
        }

        // Verificar bloqueio por mensalidade vencida
        const feeFreePagesArr = ['dashboard', 'meu-plano', 'configuracoes', 'suporte-tickets', 'suporte-faq'];
        if (!this.isAdmin && cur.access_blocked && this.page && !feeFreePagesArr.includes(this.page)) {
            window.location.href = this.basePath + 'pages/dashboard.html';
            return;
        }

        this.buildLayout();
        this.initSidebar();
        this.initHeader();

        // Background sync — atualiza dados do servidor silenciosamente
        if (DB.getToken && DB.getToken()) {
            DB.syncData().then((ok) => {
                if (!ok && !DB.getToken()) {
                    // Token foi invalidado pelo servidor — redirecionar para login
                    window.location.href = this.basePath + 'login.html';
                    return;
                }
                // Refresh user data from cache after sync
                const refreshed = DB.getCurrentUser();
                if (refreshed) this.user = refreshed;
            }).catch(() => {});
        }
    },

    buildLayout() {
        // Favicon dinâmico
        if (!document.querySelector('link[rel="icon"]')) {
            const link = document.createElement('link');
            link.rel = 'icon';
            link.href = '/favicon.ico';
            link.type = 'image/svg+xml';
            document.head.appendChild(link);
        }

        const app = document.getElementById('app');
        const pageContent = document.getElementById('page-content');
        const contentHTML = pageContent ? pageContent.innerHTML : '';

        app.innerHTML = `
            <a class="skip-to-content" href="#main-content">Pular para o conteúdo</a>
            <aside class="sidebar ${this.isAdmin ? 'admin-sidebar' : ''}" id="sidebar" role="navigation" aria-label="Menu principal">
                ${this.renderSidebar()}
            </aside>
            <div class="main-wrapper">
                <header class="top-header" id="topHeader" role="banner">
                    ${this.renderHeader()}
                </header>
                <main class="content" id="main-content" role="main" tabindex="-1">
                    ${contentHTML}
                </main>
                <footer class="main-footer" role="contentinfo">
                    <p>${this.settings.footerText || '© 2026 Credbusiness'} — ${this.isAdmin ? 'Painel Administrativo' : 'Escritório Virtual'}</p>
                </footer>
            </div>
            <div class="overlay" id="overlay"></div>
            <div class="toast-container" id="toastContainer" role="status" aria-live="polite" aria-atomic="false"></div>
            <div class="modal-overlay" id="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
                <div class="modal" id="modal">
                    <div class="modal-header"><h3 id="modalTitle"></h3><button class="modal-close" onclick="Layout.closeModal()" aria-label="Fechar modal"><i class="fas fa-times" aria-hidden="true"></i></button></div>
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

        // Páginas ocultas pelo admin (settings.hiddenPages é CSV: "assinaturas,bacen-consulta,...")
        const hiddenPages = (this.settings.hiddenPages || 'assinaturas,universidade,downloads,informativos,eventos').split(',').map(s => s.trim()).filter(Boolean);

        const fullMenu = [
            { section: 'Principal' },
            { id: 'dashboard', icon: 'fas fa-th-large', label: 'Dashboard', href: bp + 'pages/dashboard.html' },
            { id: 'meu-plano', icon: 'fas fa-id-card', label: 'Meu Plano', href: bp + 'pages/meu-plano.html' },
            { id: 'assinaturas', icon: 'fas fa-sync-alt', label: 'Assinaturas', href: bp + 'pages/assinaturas.html' },
            { id: 'contratos', icon: 'fas fa-file-contract', label: 'Contratos', href: bp + 'pages/contratos.html' },
            { section: 'Serviços' },
            { id: 'limpa-nome-processos', icon: 'fas fa-broom', label: 'Meus Processos', href: bp + 'pages/limpa-nome-processos.html' },

            { id: 'pacotes', icon: 'fas fa-cube', label: 'Pacotes', children: [
                { id: 'pacotes-disponiveis', label: 'Disponíveis', href: bp + 'pages/pacotes-disponiveis.html' },
                { id: 'pacotes-meus', label: 'Meus Pacotes', href: bp + 'pages/pacotes-meus.html' }
            ]},
            { section: 'Informações' },
            { id: 'informativos', icon: 'fas fa-newspaper', label: 'Informativos', href: bp + 'pages/informativos.html' },
            { id: 'eventos', icon: 'fas fa-calendar-alt', label: 'Eventos', mobileOnly: true, children: [
                { id: 'eventos-agenda', label: 'Agenda', href: bp + 'pages/eventos.html' },
                { id: 'eventos-compras', label: 'Compras', href: bp + 'pages/eventos-compras.html' },
                { id: 'eventos-ingressos', label: 'Ingressos', href: bp + 'pages/eventos-ingressos.html' }
            ]},
            { section: 'Rede MLM' },
            { id: 'rede', icon: 'fas fa-sitemap', label: 'Minha Rede', children: [
                { id: 'rede-indicados', label: 'Indicados Diretos', href: bp + 'pages/rede-indicados.html' },
                { id: 'rede-equipe', label: 'Minha Equipe', href: bp + 'pages/rede-equipe.html' },
                { id: 'rede-clientes', label: 'Clientes', href: bp + 'pages/rede-clientes.html' },
                { id: 'rede-matriz', label: 'Matriz', href: bp + 'pages/rede-matriz.html' },
                { id: 'rede-arvore', label: 'Árvore', href: bp + 'pages/rede-arvore.html' }
            ]},
            { id: 'relatorios', icon: 'fas fa-chart-bar', label: 'Relatórios', children: [
                { id: 'relatorios-indicacao', label: 'Indicação', href: bp + 'pages/relatorios-indicacao.html' },
                { id: 'relatorios-vendas', label: 'Vendas', href: bp + 'pages/relatorios-vendas.html' },
                { id: 'relatorios-comissoes', label: 'Comissões', href: bp + 'pages/relatorios-comissoes.html' },
                { id: 'relatorios-graduacao', label: 'Graduação', href: bp + 'pages/relatorios-graduacao.html' }
            ]},
            { id: 'financeiro', icon: 'fas fa-wallet', label: 'Financeiro', children: [
                { id: 'financeiro-extrato', label: 'Extrato', href: bp + 'pages/financeiro.html' },
                { id: 'carteira-depositar', label: 'Depositar', href: bp + 'pages/carteira-depositar.html' },
                { id: 'carteira-transferir', label: 'Transferir', href: bp + 'pages/carteira-transferir.html' },
                { id: 'carteira-saques', label: 'Saques', href: bp + 'pages/carteira-saques.html' },
                { id: 'meu-pix', label: 'Meu PIX', href: bp + 'pages/meu-pix.html' },
                { id: 'senha-financeira', label: 'Senha Financeira', href: bp + 'pages/senha-financeira.html' }
            ]},
            { section: 'Aprendizado' },
            { id: 'universidade', icon: 'fas fa-graduation-cap', label: 'Universidade', href: bp + 'pages/universidade.html', mobileOnly: true },
            { section: 'Ajuda' },
            { id: 'suporte', icon: 'fas fa-headset', label: 'Suporte', children: [
                { id: 'suporte-tickets', label: 'Tickets', href: bp + 'pages/suporte-tickets.html' },
                { id: 'suporte-faq', label: 'FAQ', href: bp + 'pages/suporte-faq.html' }
            ]}
        ];

        // Adicionar páginas personalizadas do admin
        const customPages = DB.get('customPages') || [];
        if (customPages.length > 0) {
            const bySection = {};
            customPages.forEach(cp => {
                const sec = cp.section || 'Personalizado';
                if (!bySection[sec]) bySection[sec] = [];
                bySection[sec].push(cp);
            });
            for (const [sec, cpages] of Object.entries(bySection)) {
                // Verificar se a seção já existe no menu
                const sectionExists = fullMenu.some(item => item.section === sec);
                if (!sectionExists) fullMenu.push({ section: sec });
                cpages.forEach(cp => {
                    fullMenu.push({
                        id: 'custom-' + cp.slug,
                        icon: 'fas ' + (cp.icon || 'fa-file-alt'),
                        label: cp.title,
                        href: bp + 'pages/custom-' + cp.slug + '.html'
                    });
                });
            }
        }

        // Filtrar páginas ocultas pelo admin
        const menu = fullMenu.filter(item => {
            if (item.section) return true;
            if (item.id && hiddenPages.includes(item.id)) return false;
            if (item.children) {
                item.children = item.children.filter(c => !hiddenPages.includes(c.id));
                if (item.children.length === 0) return false;
            }
            return true;
        });

        const avatarUrl = u.avatar ? (u.avatar.startsWith('http') ? u.avatar : `${bp}${u.avatar}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nickname || u.name)}&background=${(this.settings.primaryColor||'#6366f1').replace('#','')}&color=fff&size=34&rounded=true&bold=true`;

        const packageBanner = !this.hasPackage ? `
            <div style="margin:8px auto;width:44px;height:44px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="window.location.href='${bp}pages/pacotes-disponiveis.html'" title="Ative seu acesso completo">
                <i class="fas fa-lock" style="font-size:1rem;color:#fff"></i>
            </div>` : '';

        return `
            ${packageBanner}
            <nav class="sidebar-nav" aria-label="Navegação principal">
                ${menu.map(item => {
                    if (item.section) return `<div class="nav-section"><div class="nav-section-title" role="heading" aria-level="2">${item.section}</div></div>`;
                    const isActive = p === item.id || (item.children && item.children.some(c => p === c.id));
                    const moCls = item.mobileOnly ? ' mobile-only-item' : '';
                    if (item.children) {
                        return `<div class="nav-section${moCls}"><div class="nav-item has-submenu ${isActive ? 'active' : ''}" data-tooltip="${item.label}">
                            <a class="nav-link" role="button" tabindex="0"><i class="${item.icon}" aria-hidden="true"></i><span>${item.label}</span></a>
                            <ul class="submenu" role="list">${item.children.map(c => `<li class="nav-item ${p===c.id?'active':''}" role="listitem"><a class="nav-link" href="${c.href}" ${p===c.id ? 'aria-current="page"' : ''}>${c.label}</a></li>`).join('')}</ul>
                        </div></div>`;
                    }
                    return `<div class="nav-section${moCls}"><div class="nav-item ${isActive ? 'active' : ''}" data-tooltip="${item.label}"><a class="nav-link" href="${item.href}" ${isActive ? 'aria-current="page"' : ''}><i class="${item.icon}" aria-hidden="true"></i><span>${item.label}</span></a></div></div>`;
                }).join('')}
            </nav>
            <div class="sidebar-footer">
                <div class="sidebar-user" onclick="window.location.href='${bp}pages/meu-plano.html'" title="${u.nickname || u.name}">
                    <img src="${avatarUrl}" alt="">
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
            { id: 'admin-landing', icon: 'fas fa-globe', label: 'Landing Page', href: bp + 'admin/landing.html' },
            { id: 'admin-university', icon: 'fas fa-graduation-cap', label: 'Universidade', href: bp + 'admin/university.html' },
            { id: 'admin-faq', icon: 'fas fa-question-circle', label: 'FAQ', href: bp + 'admin/faq.html' },
            { id: 'admin-downloads', icon: 'fas fa-download', label: 'Downloads', href: bp + 'admin/downloads.html' },
            { id: 'admin-audit', icon: 'fas fa-history', label: 'Auditoria', href: bp + 'admin/audit.html' },
            { id: 'admin-custom-pages', icon: 'fas fa-file-alt', label: 'Páginas', href: bp + 'admin/custom-pages.html' },
        ];

        return `
            <nav class="sidebar-nav" aria-label="Navegação administrativa">
                ${adminMenu.map(item => `<div class="nav-section"><div class="nav-item ${p===item.id?'active':''}" data-tooltip="${item.label}"><a class="nav-link" href="${item.href}" ${p===item.id ? 'aria-current="page"' : ''}><i class="${item.icon}" aria-hidden="true"></i><span>${item.label}</span></a></div></div>`).join('')}
            </nav>
            <div class="sidebar-footer">
                <div class="admin-badge-tag" title="Administrador"><i class="fas fa-shield-halved"></i></div>
            </div>
        `;
    },

    renderHeader() {
        const u = this.user;
        const bp = this.basePath;

        if (this.isAdmin) {
            return `
                <button class="menu-toggle" id="menuToggle" aria-label="Abrir menu lateral" aria-expanded="false"><i class="fas fa-bars" aria-hidden="true"></i></button>
                <div class="header-breadcrumb" aria-label="Navegação estrutural">Admin &rsaquo; <span>${this.title}</span></div>
                <div class="header-spacer"></div>
                <div class="header-actions">
                    <a href="${bp}pages/dashboard.html" class="btn btn-sm btn-outline"><i class="fas fa-external-link-alt" aria-hidden="true"></i> Painel</a>
                </div>
                <div class="user-menu" id="userMenuBtn" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false" aria-label="Menu do usuário">
                    <img src="https://ui-avatars.com/api/?name=Admin&background=dc2626&color=fff&size=34&rounded=true&bold=true" alt="Avatar Admin">
                    <div><div class="name">Admin</div></div>
                </div>
                <div class="dropdown" id="userDropdown" role="menu">
                    <a href="#" onclick="Layout.logout();return false" class="text-danger" role="menuitem"><i class="fas fa-sign-out-alt" aria-hidden="true"></i>Sair</a>
                </div>`;
        }

        const levels = DB.get('levels');
        const lvl = levels ? levels[u.level] : {};
        return `
            <button class="menu-toggle" id="menuToggle" aria-label="Abrir menu lateral" aria-expanded="false"><i class="fas fa-bars" aria-hidden="true"></i></button>
            <div class="header-breadcrumb" aria-label="Navegação estrutural">Painel &rsaquo; <span>${this.title}</span></div>
            <div class="header-spacer"></div>
            <div class="header-actions">
                <div class="notification-wrapper" id="notifWrapper">
                    <button class="header-btn" id="notifBtn" aria-label="Notificações" aria-haspopup="true" aria-expanded="false"><i class="fas fa-bell" aria-hidden="true"></i><span class="dot" id="notifDot" style="display:none" aria-hidden="true"></span></button>
                    <div class="notification-dropdown" id="notifDropdown" role="region" aria-label="Painel de notificações">
                        <div class="notif-header">
                            <strong>Notificações</strong>
                            <a href="#" id="notifReadAll" style="font-size:.78rem;color:var(--primary)">Marcar todas como lidas</a>
                        </div>
                        <div class="notif-list" id="notifList" role="list"><div style="padding:16px;text-align:center;color:var(--text3);font-size:.85rem">Carregando...</div></div>
                        <div class="notif-footer"><a href="${bp}pages/configuracoes.html">Ver todas</a></div>
                    </div>
                </div>
            </div>
            <div class="user-menu" id="userMenuBtn" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false" aria-label="Menu do usuário">
                <img src="${u.avatar ? (u.avatar.startsWith('http') ? u.avatar : `${bp}${u.avatar}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nickname || u.name)}&background=${(this.settings.primaryColor||'#6366f1').replace('#','')}&color=fff&size=34&rounded=true&bold=true`}" alt="Avatar do usuário">
                <div>
                    <div class="name">${u.nickname || u.name}</div>
                    <div class="level-tag">${lvl.icon ? `<i class="fas ${lvl.icon}"></i>` : ''} ${lvl.name || 'Prata'}</div>
                </div>
            </div>
            <div class="dropdown" id="userDropdown" role="menu">
                <a href="${bp}pages/meu-plano.html" role="menuitem"><i class="fas fa-user" aria-hidden="true"></i>Meu Perfil</a>
                <a href="${bp}pages/configuracoes.html" role="menuitem"><i class="fas fa-cog" aria-hidden="true"></i>Configurações</a>
                <a href="${bp}pages/conta-endereco.html" role="menuitem"><i class="fas fa-map-marker-alt" aria-hidden="true"></i>Endereço</a>
                <a href="${bp}pages/conta-documentos.html" role="menuitem"><i class="fas fa-id-card" aria-hidden="true"></i>Documentos</a>
                <a href="${bp}pages/contratos.html" role="menuitem"><i class="fas fa-file-contract" aria-hidden="true"></i>Contratos</a>
                <a href="${bp}pages/financeiro.html" role="menuitem"><i class="fas fa-wallet" aria-hidden="true"></i>Financeiro</a>
                <a href="${bp}pages/meu-pix.html" role="menuitem"><i class="fas fa-key" aria-hidden="true"></i>Meu PIX</a>
                <a href="${bp}pages/senha-financeira.html" role="menuitem"><i class="fas fa-lock" aria-hidden="true"></i>Senha Financeira</a>
                <div class="divider" role="separator"></div>
                <a href="#" onclick="Layout.logout();return false" class="text-danger" role="menuitem"><i class="fas fa-sign-out-alt" aria-hidden="true"></i>Sair</a>
            </div>`;
    },

    initSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('menuToggle');
        const overlay = document.getElementById('overlay');
        toggle?.addEventListener('click', () => {
            const isOpen = sidebar.classList.toggle('open');
            overlay.classList.toggle('show');
            toggle.setAttribute('aria-expanded', isOpen);
            toggle.setAttribute('aria-label', isOpen ? 'Fechar menu lateral' : 'Abrir menu lateral');
        });
        overlay?.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
            toggle?.setAttribute('aria-expanded', 'false');
            toggle?.setAttribute('aria-label', 'Abrir menu lateral');
        });

        // Keyboard: Enter/Space to toggle submenus
        sidebar?.querySelectorAll('.nav-link[role="button"]').forEach(link => {
            link.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    link.click();
                    const expanded = link.parentElement.classList.contains('open');
                    link.setAttribute('aria-expanded', expanded);
                }
            });
        });

        // Keyboard: Escape closes mobile sidebar
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && sidebar?.classList.contains('open')) {
                sidebar.classList.remove('open');
                overlay?.classList.remove('show');
                toggle?.setAttribute('aria-expanded', 'false');
                toggle?.focus();
            }
        });
    },

    initHeader() {
        const btn = document.getElementById('userMenuBtn');
        const dd = document.getElementById('userDropdown');

        const toggleMenu = (e) => {
            e.stopPropagation();
            const isOpen = dd.classList.toggle('show');
            btn.setAttribute('aria-expanded', isOpen);
            if (isOpen) {
                const firstLink = dd.querySelector('a');
                firstLink?.focus();
            }
        };
        btn?.addEventListener('click', toggleMenu);
        btn?.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMenu(e); }
        });

        // Keyboard nav inside dropdown
        dd?.addEventListener('keydown', e => {
            const links = [...dd.querySelectorAll('a')];
            const idx = links.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); links[(idx + 1) % links.length]?.focus(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); links[(idx - 1 + links.length) % links.length]?.focus(); }
            if (e.key === 'Escape') { dd.classList.remove('show'); btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
        });

        document.addEventListener('click', () => { dd?.classList.remove('show'); btn?.setAttribute('aria-expanded', 'false'); });

        // ── Notifications ──
        if (!this.isAdmin) {
            this.initNotifications();
        }

        // ── Real-time updates via SSE ──
        window.addEventListener('realtime-update', (e) => {
            const { entity } = e.detail;
            // Refresh notification badge
            if (entity === 'notifications' && !this.isAdmin) {
                DB.fetchUnreadCount().then(count => {
                    const dot = document.getElementById('notifDot');
                    if (dot) {
                        dot.style.display = count > 0 ? '' : 'none';
                        dot.textContent = count > 9 ? '9+' : count;
                    }
                }).catch(() => {});
            }
            // Refresh user data in header (balance, level, etc.)
            if (entity === 'user_updated' || entity === 'transactions') {
                const refreshed = DB.getCurrentUser();
                if (refreshed) this.user = refreshed;
            }
            // Let each page handle its own refresh
            if (typeof window.onRealtimeUpdate === 'function') {
                window.onRealtimeUpdate(e.detail);
            }
        });
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
            const isOpen = notifDropdown.classList.toggle('show');
            notifBtn.setAttribute('aria-expanded', isOpen);
            if (isOpen) this.loadNotifications();
        });
        document.addEventListener('click', e => {
            if (!e.target.closest('.notification-wrapper')) {
                notifDropdown?.classList.remove('show');
                notifBtn?.setAttribute('aria-expanded', 'false');
            }
        });
        // Escape to close
        notifDropdown?.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                notifDropdown.classList.remove('show');
                notifBtn.setAttribute('aria-expanded', 'false');
                notifBtn.focus();
            }
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
    _previousFocus: null,
    openModal(title, body, footer) {
        this._previousFocus = document.activeElement;
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;
        document.getElementById('modalFooter').innerHTML = footer || '';
        const overlay = document.getElementById('modalOverlay');
        overlay.classList.add('show');

        // Focus first interactive element or close button
        requestAnimationFrame(() => {
            const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length) focusable[0].focus();
        });

        // Focus trap
        if (!this._modalTrapHandler) {
            this._modalTrapHandler = (e) => {
                if (e.key === 'Escape') { this.closeModal(); return; }
                if (e.key !== 'Tab') return;
                const modal = document.getElementById('modal');
                const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (!focusable.length) return;
                const first = focusable[0], last = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            };
        }
        document.addEventListener('keydown', this._modalTrapHandler);
    },
    closeModal() {
        document.getElementById('modalOverlay').classList.remove('show');
        document.removeEventListener('keydown', this._modalTrapHandler);
        if (this._previousFocus) { this._previousFocus.focus(); this._previousFocus = null; }
    },

    // ── Toast ──
    toast(msg, type) {
        type = type || 'info';
        const c = document.getElementById('toastContainer');
        const icon = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'assertive');
        el.innerHTML = `<i class="fas ${icon[type] || icon.info}" aria-hidden="true"></i><span>${msg}</span>`;
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

/* ── PDF Export Utility (html2pdf.js) ── */
const ExportPDF = {
    _loaded: false,
    _loadLib() {
        if (this._loaded) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
            s.onload = () => { this._loaded = true; resolve(); };
            s.onerror = reject;
            document.head.appendChild(s);
        });
    },
    async download(filename, title, headers, rows, options = {}) {
        await this._loadLib();
        const settings = DB.getSettings();
        const date = new Date().toLocaleDateString('pt-BR');
        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#1a1a2e">
            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${settings.primaryColor || '#6366f1'};padding-bottom:16px;margin-bottom:20px">
                <div>
                    <h1 style="margin:0;font-size:20px;color:${settings.primaryColor || '#6366f1'}">${settings.siteName || 'Credbusiness'}</h1>
                    <p style="margin:4px 0 0;font-size:11px;color:#666">Escritório Virtual — Relatório</p>
                </div>
                <div style="text-align:right;font-size:11px;color:#666">
                    <div>${date} às ${time}</div>
                </div>
            </div>
            <h2 style="font-size:16px;margin:0 0 16px;color:#1a1a2e">${title}</h2>
            ${options.summary ? `<div style="display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap">${options.summary.map(s => `<div style="background:#f8f9fa;border-radius:8px;padding:10px 16px;flex:1;min-width:120px"><div style="font-size:11px;color:#666">${s.label}</div><div style="font-size:16px;font-weight:700;color:${s.color || '#1a1a2e'}">${s.value}</div></div>`).join('')}</div>` : ''}
            <table style="width:100%;border-collapse:collapse;font-size:11px">
                <thead><tr>${headers.map(h => `<th style="background:${settings.primaryColor || '#6366f1'};color:#fff;padding:8px 10px;text-align:left;font-size:11px">${h}</th>`).join('')}</tr></thead>
                <tbody>${rows.map((r, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9fa'}">${r.map(c => `<td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px">${c || ''}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
            <div style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;text-align:center;font-size:10px;color:#999">
                ${settings.footerText || '© 2026 Credbusiness'} — Documento gerado automaticamente em ${date}
            </div>
        </div>`;

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);

        const opt = {
            margin: [10, 10, 10, 10],
            filename: `${filename}_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: rows[0] && rows[0].length > 6 ? 'landscape' : 'portrait' }
        };

        try {
            await html2pdf().set(opt).from(container).save();
            Layout.toast('PDF exportado com sucesso!', 'success');
        } catch (e) {
            Layout.toast('Erro ao gerar PDF', 'error');
        } finally {
            container.remove();
        }
    }
};
