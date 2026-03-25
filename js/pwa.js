/* ═══════════════════════════════════════════
   Credbusiness — PWA Engine
   Splash screen, SW registration, install prompts,
   bottom nav, offline support, update banners
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  const IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  // ════════════════════════════════════════
  // SPLASH SCREEN
  // ════════════════════════════════════════
  function injectSplash() {
    if (document.getElementById('pwa-splash')) return;
    const splash = document.createElement('div');
    splash.id = 'pwa-splash';
    splash.innerHTML = `
      <div class="splash-logo">CB</div>
      <div class="splash-name">Credbusiness</div>
      <div class="splash-tagline">Escritório Virtual</div>
      <div class="splash-loader">
        <div class="splash-loader-dot"></div>
        <div class="splash-loader-dot"></div>
        <div class="splash-loader-dot"></div>
      </div>
    `;
    document.body.insertBefore(splash, document.body.firstChild);

    // Esconder após carregamento (max 2.5s)
    const hideSplash = () => {
      splash.classList.add('hidden');
      setTimeout(() => splash.remove(), 500);
    };
    if (document.readyState === 'complete') {
      setTimeout(hideSplash, 800);
    } else {
      window.addEventListener('load', () => setTimeout(hideSplash, 600), { once: true });
      setTimeout(hideSplash, 2500);
    }
  }

  // Mostrar splash em standalone ou primeiro carregamento
  if (IS_STANDALONE || sessionStorage.getItem('pwa-first-load') !== '1') {
    injectSplash();
    sessionStorage.setItem('pwa-first-load', '1');
  }

  // ════════════════════════════════════════
  // BOTTOM NAVIGATION (mobile standalone)
  // ════════════════════════════════════════
  function injectBottomNav() {
    if (!IS_STANDALONE) return;
    if (document.getElementById('pwa-bottom-nav')) return;
    // Não injetar em páginas de auth
    const authPages = ['/login.html', '/register.html', '/password-forgot.html', '/password-reset.html', '/index.html', '/'];
    const currentPath = window.location.pathname;
    if (authPages.some(p => currentPath === p || currentPath.endsWith(p))) return;

    const currentPage = currentPath.split('/').pop() || 'dashboard.html';
    const navItems = [
      { icon: 'fa-gauge', label: 'Dashboard',  href: '/pages/dashboard.html' },
      { icon: 'fa-magnifying-glass-dollar', label: 'Limpa Nome', href: '/pages/limpa-nome-dashboard.html' },
      { icon: 'fa-wallet', label: 'Carteira',   href: '/pages/financeiro.html' },
      { icon: 'fa-users', label: 'Rede',        href: '/pages/rede-indicados.html' },
      { icon: 'fa-gear',  label: 'Config',      href: '/pages/configuracoes.html' },
    ];

    const nav = document.createElement('nav');
    nav.id = 'pwa-bottom-nav';
    nav.className = 'pwa-bottom-nav';
    nav.setAttribute('aria-label', 'Navegação principal');
    nav.innerHTML = `
      <div class="pwa-bottom-nav-inner">
        ${navItems.map(item => `
          <a href="${item.href}" class="pwa-nav-item${currentPage === item.href.split('/').pop() ? ' active' : ''}" aria-label="${item.label}">
            <i class="fa-solid ${item.icon}"></i>
            <span>${item.label}</span>
          </a>`).join('')}
      </div>
    `;
    document.body.appendChild(nav);
  }

  window.addEventListener('load', injectBottomNav);

  // ════════════════════════════════════════
  // SERVICE WORKER REGISTRATION
  // ════════════════════════════════════════
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          setInterval(() => reg.update(), 60 * 60 * 1000);

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                showUpdateBanner();
              }
            });
          });
        })
        .catch((err) => console.warn('[PWA] Falha ao registrar SW:', err));
    });
  }

  // ════════════════════════════════════════
  // BANNER: ATUALIZAÇÃO DISPONÍVEL
  // ════════════════════════════════════════
  function showUpdateBanner() {
    if (document.getElementById('pwa-update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.style.cssText = `position:fixed;bottom:${IS_STANDALONE?'72':'24'}px;left:50%;
      transform:translateX(-50%);z-index:99999;background:#1e293b;color:#fff;
      padding:14px 24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.3);
      display:flex;align-items:center;gap:16px;font-family:'Inter',system-ui,sans-serif;
      font-size:.9rem;max-width:calc(100vw - 32px);`;
    banner.innerHTML = `
      <i class="fa-solid fa-rotate" style="color:#6366f1;font-size:1.1rem"></i>
      <span style="flex:1">Nova versão disponível!</span>
      <button onclick="location.reload()" style="background:#6366f1;color:#fff;border:none;
        padding:8px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:.82rem;
        min-height:36px">Atualizar</button>
      <button onclick="document.getElementById('pwa-update-banner').remove()"
        style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.2rem;
        padding:4px 4px;min-height:36px">&times;</button>
    `;
    document.body.appendChild(banner);
  }

  // ════════════════════════════════════════
  // BANNER: INSTALAR APP (Add to Home Screen)
  // ════════════════════════════════════════
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Delay 3s para não atrapalhar carregamento
    setTimeout(showInstallBanner, 3000);
  });

  function showInstallBanner() {
    if (IS_STANDALONE) return;
    if (document.getElementById('pwa-install-banner')) return;
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const wrap = document.createElement('div');
    wrap.id = 'pwa-install-banner';
    wrap.className = 'pwa-install-banner-wrap';
    wrap.innerHTML = `
      <div class="pwa-install-inner">
        <div class="pwa-install-icon">📱</div>
        <div class="pwa-install-text">
          <strong>Instalar Credbusiness</strong>
          <span>Acesse direto da tela inicial · funciona sem internet</span>
        </div>
        <div class="pwa-install-actions">
          <button class="btn-install" id="pwa-install-btn">Instalar</button>
          <button class="btn-dismiss" id="pwa-install-dismiss" aria-label="Dispensar">×</button>
        </div>
      </div>
    `;

    // Adicionar CSS inline apenas para o container
    wrap.style.cssText = `position:fixed;bottom:0;left:0;right:0;z-index:99998;padding:0 16px 16px;pointer-events:none;`;

    document.body.appendChild(wrap);

    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      wrap.remove();
      deferredPrompt = null;
    });

    document.getElementById('pwa-install-dismiss').addEventListener('click', () => {
      wrap.remove();
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    });
  }

  // ── Detectar quando instalado ──
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
    // Pequeno toast de sucesso
    showInstalledToast();
  });

  function showInstalledToast() {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);
      z-index:999999;background:#059669;color:#fff;padding:12px 24px;border-radius:12px;
      font-family:'Inter',system-ui,sans-serif;font-size:.875rem;font-weight:600;
      box-shadow:0 8px 24px rgba(5,150,105,.3);display:flex;align-items:center;gap:10px;
      animation:fadeInUp .4s ease both;`;
    t.innerHTML = '<i class="fa-solid fa-check-circle"></i> App instalado com sucesso!';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ════════════════════════════════════════
  // ONLINE/OFFLINE STATUS
  // ════════════════════════════════════════
  function showOfflineBanner() {
    if (document.getElementById('pwa-offline')) return;
    const b = document.createElement('div');
    b.id = 'pwa-offline';
    b.innerHTML = `<i class="fa-solid fa-wifi-slash"></i> Sem conexão — usando dados em cache`;
    b.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:999998;background:#f59e0b;
      color:#fff;text-align:center;padding:8px 20px;font-family:'Inter',sans-serif;
      font-size:.82rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;`;
    document.body.insertBefore(b, document.body.firstChild);
  }
  function hideOfflineBanner() {
    const b = document.getElementById('pwa-offline');
    if (b) b.remove();
  }
  window.addEventListener('offline', showOfflineBanner);
  window.addEventListener('online', hideOfflineBanner);
  if (!navigator.onLine) showOfflineBanner();

  // ════════════════════════════════════════
  // SHARE API (Web Share)
  // ════════════════════════════════════════
  window.pwashare = function(title, text, url) {
    if (navigator.share) {
      navigator.share({ title, text, url: url || location.href }).catch(() => {});
    } else {
      // Fallback: copiar URL
      navigator.clipboard.writeText(url || location.href).then(() => {
        const t = document.createElement('div');
        t.textContent = '🔗 Link copiado!';
        t.style.cssText = 'position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 20px;border-radius:10px;font-family:Inter,system-ui,sans-serif;font-size:.85rem;z-index:999999;';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
      });
    }
  };

})();

