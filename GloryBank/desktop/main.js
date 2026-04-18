const { app, BrowserWindow, shell, Menu, Tray, nativeImage, session, dialog, net } = require("electron");
const path = require("path");

// ─── Configuration ───
const APP_URL =
  process.env.CREDBUSINESS_URL || "https://credbusiness.vercel.app";
const IS_DEV = process.env.NODE_ENV === "development" || !!process.env.CREDBUSINESS_URL;

let mainWindow = null;
let splashWindow = null;
let tray = null;

// ─── Single Instance Lock ───
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── Splash Screen ───
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const splashHTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:transparent;display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-app-region:drag;user-select:none}
    .card{background:#1a1a2e;border-radius:24px;padding:48px 56px;text-align:center;box-shadow:0 32px 64px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.06)}
    .logo{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#e30613,#ff4d4d);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 8px 24px rgba(227,6,19,0.4)}
    .logo svg{width:28px;height:28px;color:#fff;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    h1{color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.03em;margin-bottom:4px}
    h1 span{color:#f87171}
    p{color:rgba(255,255,255,0.5);font-size:12px;margin-bottom:24px}
    .bar{width:180px;height:3px;border-radius:99px;background:rgba(255,255,255,0.08);margin:0 auto;overflow:hidden}
    .bar::after{content:'';display:block;width:40%;height:100%;border-radius:99px;background:linear-gradient(90deg,#e30613,#ff4d4d);animation:load 1.2s ease-in-out infinite}
    @keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
    </style></head><body><div class="card">
    <div class="logo"><svg viewBox="0 0 24 24"><path d="M3 22h18"/><path d="M5 10h14"/><path d="M7 10v8"/><path d="M12 10v8"/><path d="M17 10v8"/><path d="M12 2 4 6v4h16V6Z"/></svg></div>
    <h1>Glory<span>Bank</span></h1>
    <p>Internet Banking Desktop</p>
    <div class="bar"></div>
    </div></body></html>
  `)}`;

  splashWindow.loadURL(splashHTML);
  splashWindow.center();
}

// ─── Create Window ───
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "CredBusiness — Internet Banking",
    icon: path.join(__dirname, "icons", "icon.png"),
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#1a1a2e",
      symbolColor: "#ffffff",
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
    show: false,
  });

  // Load the app with timeout
  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.on("did-finish-load", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    if (IS_DEV) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  // Handle load failure (offline)
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDesc) => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html><html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{background:#1a1a2e;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}
      .c{max-width:400px;padding:40px}
      .icon{width:64px;height:64px;border-radius:18px;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
      h2{font-size:20px;margin-bottom:8px}
      p{color:rgba(255,255,255,0.6);font-size:14px;margin-bottom:24px;line-height:1.6}
      button{background:linear-gradient(135deg,#e30613,#ff4d4d);color:#fff;border:none;padding:12px 32px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;transition:opacity 0.2s}
      button:hover{opacity:0.9}
      code{display:block;margin-top:16px;font-size:11px;color:rgba(255,255,255,0.3)}
      </style></head><body><div class="c">
      <div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg></div>
      <h2>Sem conexão</h2>
      <p>Não foi possível conectar ao servidor do CredBusiness. Verifique sua conexão com a internet e tente novamente.</p>
      <button onclick="location.href='${APP_URL}'">Tentar novamente</button>
      <code>${errorDesc} (${errorCode})</code>
      </div></body></html>
    `)}`);
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Navigation guard – keep user within the banking app
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const appOrigin = new URL(APP_URL).origin;
    if (!url.startsWith(appOrigin) && !url.startsWith("data:")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Window state save/restore
  mainWindow.on("close", (e) => {
    if (tray && process.platform !== "darwin") {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── App Menu ───
function buildMenu() {
  const template = [
    {
      label: "CredBusiness",
      submenu: [
        { label: "Início", accelerator: "CmdOrCtrl+H", click: () => mainWindow?.loadURL(APP_URL + "/dashboard") },
        { label: "PIX", accelerator: "CmdOrCtrl+P", click: () => mainWindow?.loadURL(APP_URL + "/dashboard/pix") },
        { label: "Extrato", accelerator: "CmdOrCtrl+E", click: () => mainWindow?.loadURL(APP_URL + "/dashboard/extrato") },
        { type: "separator" },
        { label: "Recarregar", role: "reload" },
        { label: "Forçar Recarga", role: "forceReload" },
        { type: "separator" },
        { label: "Sair", accelerator: "CmdOrCtrl+Q", click: () => { tray = null; app.quit(); } },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Desfazer" },
        { role: "redo", label: "Refazer" },
        { type: "separator" },
        { role: "cut", label: "Recortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" },
        { role: "selectAll", label: "Selecionar tudo" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "zoomIn", label: "Aumentar Zoom" },
        { role: "zoomOut", label: "Diminuir Zoom" },
        { role: "resetZoom", label: "Zoom Padrão" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tela Cheia" },
      ],
    },
  ];

  if (IS_DEV) {
    template.push({
      label: "Dev",
      submenu: [
        { role: "toggleDevTools", label: "DevTools" },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── System Tray ───
function createTray() {
  const iconPath = path.join(__dirname, "icons", "icon.png");
  try {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip("CredBusiness – Internet Banking");

    const contextMenu = Menu.buildFromTemplate([
      { label: "Abrir CredBusiness", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { label: "Início", click: () => { mainWindow?.show(); mainWindow?.loadURL(APP_URL + "/dashboard"); } },
      { type: "separator" },
      { label: "Sair", click: () => { tray = null; app.quit(); } },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
      }
    });
  } catch {
    // Icon not found – skip tray
  }
}

// ─── Auto Updater ───
function checkForUpdates() {
  if (IS_DEV) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on("update-downloaded", (info) => {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Atualização disponível",
        message: `CredBusiness v${info.version} está pronta para instalar.`,
        detail: "A atualização será aplicada ao reiniciar o aplicativo.",
        buttons: ["Reiniciar agora", "Depois"],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });
  } catch {
    // electron-updater not available
  }
}

// ─── App Lifecycle ───
app.whenReady().then(() => {
  const { ipcMain } = require("electron");

  // Window control IPC handlers
  ipcMain.on("window-minimize", () => mainWindow?.minimize());
  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on("window-close", () => mainWindow?.close());

  // Set a permissive Content-Security-Policy for the loaded web app
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: details.responseHeaders });
  });

  buildMenu();
  createSplash();
  createWindow();
  createTray();

  // Check for updates 5s after launch
  setTimeout(checkForUpdates, 5000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
  else mainWindow.show();
});
