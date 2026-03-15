/* ═══════════════════════════════════════════
   Credbusiness — PWA Registration
   Registra Service Worker + Install prompt
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Registrar Service Worker ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          // Verificar atualizações periodicamente (a cada 1h)
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
        .catch((err) => {
          console.warn('[PWA] Falha ao registrar SW:', err);
        });
    });
  }

  // ── Banner de atualização disponível ──
  function showUpdateBanner() {
    if (document.getElementById('pwa-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.innerHTML = `
      <div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;
        background:#1e293b;color:#fff;padding:14px 24px;border-radius:12px;
        box-shadow:0 8px 32px rgba(0,0,0,.3);display:flex;align-items:center;gap:16px;
        font-family:'Inter',system-ui,sans-serif;font-size:.9rem;max-width:90vw">
        <span>🔄 Nova versão disponível!</span>
        <button onclick="location.reload()" style="background:#6366f1;color:#fff;border:none;
          padding:8px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem;
          white-space:nowrap">Atualizar</button>
        <button onclick="this.closest('#pwa-update-banner').remove()" style="background:none;
          border:none;color:#94a3b8;cursor:pointer;font-size:1.2rem;padding:0 4px">&times;</button>
      </div>
    `;
    document.body.appendChild(banner);
  }

  // ── Install prompt (A2HS — Add to Home Screen) ──
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  function showInstallBanner() {
    // Não mostrar se já foi dispensado recentemente
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;
    // Não mostrar se já é standalone
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99998;
        background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;padding:18px 28px;
        border-radius:14px;box-shadow:0 8px 32px rgba(99,102,241,.35);display:flex;
        align-items:center;gap:16px;font-family:'Inter',system-ui,sans-serif;max-width:90vw">
        <div style="width:44px;height:44px;background:rgba(255,255,255,.2);border-radius:10px;
          display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0">
          📱
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.95rem;margin-bottom:2px">Instalar Credbusiness</div>
          <div style="font-size:.8rem;opacity:.85">Acesse direto da tela inicial do seu celular</div>
        </div>
        <button id="pwa-install-btn" style="background:#fff;color:#4f46e5;border:none;
          padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-size:.85rem;
          white-space:nowrap">Instalar</button>
        <button id="pwa-install-dismiss" style="background:none;border:none;color:rgba(255,255,255,.6);
          cursor:pointer;font-size:1.3rem;padding:0 4px">&times;</button>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        banner.remove();
      }
      deferredPrompt = null;
    });

    document.getElementById('pwa-install-dismiss').addEventListener('click', () => {
      banner.remove();
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    });
  }

  // ── Detectar modo standalone (já instalado) ──
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
  });
})();
