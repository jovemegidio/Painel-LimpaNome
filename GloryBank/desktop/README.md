# GloryBank Desktop

Aplicativo desktop do GloryBank Internet Banking, construído com **Electron 33** + **electron-builder**.

## Stack

| Componente | Tecnologia |
|---|---|
| Runtime | Electron 33 (Chromium + Node.js) |
| Build | electron-builder 25 (NSIS/DMG/AppImage) |
| Updates | electron-updater (GitHub Releases) |
| Ícones | sharp (geração automática do SVG) |
| Segurança | Context Isolation, Sandbox, CSP |

## Desenvolvimento

```bash
cd desktop
npm install

# Inicia o app conectando ao servidor local Next.js
npm run dev
```

> Certifique-se de que o servidor Next.js está rodando em `http://localhost:3000`.

## Build do Instalador

```bash
# Gerar ícones (automático no build)
npm run generate-icons

# Windows (NSIS installer) → dist/GloryBank-Setup-1.0.0.exe
npm run build:win

# macOS (DMG) → dist/GloryBank-1.0.0.dmg
npm run build:mac

# Linux (AppImage + deb) → dist/GloryBank-1.0.0.AppImage
npm run build:linux

# Todas as plataformas
npm run build
```

Os instaladores serão gerados em `desktop/dist/`.

## Configuração

| Variável | Descrição | Padrão |
|---|---|---|
| `GLORYBANK_URL` | URL do servidor Next.js | `https://glorybank.vercel.app` |
| `NODE_ENV` | Se `development`, abre DevTools | — |

## Funcionalidades

- **Splash Screen** — Tela de carregamento animada com marca GloryBank
- **Offline Detection** — Tela amigável quando sem internet, com botão de retry
- **Single Instance** — Apenas uma instância do app pode rodar
- **System Tray** — Ícone na bandeja com acesso rápido (minimiza para tray)
- **Auto-update** — Atualização automática via GitHub Releases com diálogo
- **Keyboard Shortcuts** — Ctrl+H (Início), Ctrl+P (PIX), Ctrl+E (Extrato)
- **Segurança** — Context isolation, sandbox, sem node integration
- **Links externos** — URLs externas abrem no navegador padrão
- **Title Bar integrada** — Barra de título no tema escuro do sidebar
