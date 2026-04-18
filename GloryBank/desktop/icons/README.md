# Ícones do GloryBank Desktop

Gere os ícones a partir do SVG do projeto:

```bash
cd desktop
npm run generate-icons
```

Ou manualmente usando o SVG em `public/icons/icon-512.svg`:

```bash
# Instalar dependência
npm install -g png-to-ico sharp-cli

# PNG 512x512
npx sharp -i ../public/icons/icon-512.svg -o icons/icon.png resize 512 512

# ICO para Windows (multi-size)
npx png-to-ico icons/icon.png > icons/icon.ico

# ICNS para macOS
# Use: https://cloudconvert.com/png-to-icns
```

Formatos necessários:
- `icon.png` — 512×512 PNG (Linux e fallback)
- `icon.ico` — Multi-size ICO (Windows)
- `icon.icns` — ICNS (macOS)
