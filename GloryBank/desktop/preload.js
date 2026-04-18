const { contextBridge, ipcRenderer } = require("electron");

/**
 * Expose a minimal, safe API to the renderer process.
 * The banking app can detect it's running inside Electron via window.credbusiness.
 */
contextBridge.exposeInMainWorld("credbusiness", {
  platform: process.platform,
  isDesktop: true,
  version: require("./package.json").version,
  arch: process.arch,

  // Auto-update listener
  onUpdateReady: (callback) => {
    ipcRenderer.on("update-ready", () => callback());
  },

  // Window controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
});
