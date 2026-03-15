/* ═══════════════════════════════════════════
   Credbusiness — Gerador de Ícones PWA
   Gera ícones PNG em múltiplos tamanhos
   a partir do logo existente usando Canvas
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, 'icons');

// Tamanhos necessários para PWA
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Criar diretório de ícones
if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
}

// Gerar SVG base com o logo da Credbusiness
function generateIconSVG(size, maskable = false) {
    const padding = maskable ? Math.round(size * 0.1) : Math.round(size * 0.05);
    const innerSize = size - padding * 2;
    const centerX = size / 2;
    const centerY = size / 2;
    const bgRadius = maskable ? 0 : Math.round(size * 0.18);
    const letterSize = Math.round(innerSize * 0.45);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#4f46e5"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#10b981"/>
      <stop offset="100%" style="stop-color:#059669"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${bgRadius}" fill="url(#bg)"/>
  <text x="${centerX}" y="${centerY + letterSize * 0.35}" text-anchor="middle" 
    font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="800" 
    font-size="${letterSize}" fill="white" letter-spacing="-${Math.round(letterSize * 0.05)}">CB</text>
  <circle cx="${centerX + innerSize * 0.28}" cy="${centerY - innerSize * 0.22}" r="${Math.round(size * 0.06)}" fill="url(#accent)"/>
</svg>`;
}

// Converter SVG para PNG usando sharp se disponível, senão salvar como SVG
async function generateIcons() {
    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        console.log('⚠️  Módulo "sharp" não instalado. Gerando SVGs base...');
        console.log('   Para converter em PNG, instale: npm install sharp');
        console.log('   Depois execute novamente: node generate-icons.js\n');
        
        // Salvar SVGs para conversão manual
        for (const size of SIZES) {
            const svg = generateIconSVG(size);
            fs.writeFileSync(path.join(ICONS_DIR, `icon-${size}x${size}.svg`), svg);
            console.log(`  ✓ icons/icon-${size}x${size}.svg`);
        }
        
        // Maskable
        for (const size of [192, 512]) {
            const svg = generateIconSVG(size, true);
            fs.writeFileSync(path.join(ICONS_DIR, `icon-maskable-${size}x${size}.svg`), svg);
            console.log(`  ✓ icons/icon-maskable-${size}x${size}.svg`);
        }
        
        console.log('\n📌 Use https://svgtopng.com ou similar para converter SVGs em PNGs.');
        console.log('   Ou instale sharp: npm install sharp && node generate-icons.js');
        return;
    }

    // Com sharp disponível, gerar PNGs diretamente
    console.log('🎨 Gerando ícones PWA...\n');

    for (const size of SIZES) {
        const svg = Buffer.from(generateIconSVG(size));
        await sharp(svg).resize(size, size).png().toFile(path.join(ICONS_DIR, `icon-${size}x${size}.png`));
        console.log(`  ✓ icons/icon-${size}x${size}.png`);
    }

    // Maskable icons
    for (const size of [192, 512]) {
        const svg = Buffer.from(generateIconSVG(size, true));
        await sharp(svg).resize(size, size).png().toFile(path.join(ICONS_DIR, `icon-maskable-${size}x${size}.png`));
        console.log(`  ✓ icons/icon-maskable-${size}x${size}.png`);
    }

    console.log('\n✅ Todos os ícones PWA foram gerados com sucesso!');
}

generateIcons().catch(console.error);
