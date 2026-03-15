/* ═══════════════════════════════════════════
   Script para injetar tags PWA em todas as páginas HTML
   Execução única: node inject-pwa.js
   ═══════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

// Tags PWA para injetar no <head> (após a linha viewport)
const PWA_HEAD_TAGS = `
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#6366f1">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Credbusiness">
    <link rel="apple-touch-icon" href="/icons/icon-192x192.png">`;

// Script PWA para injetar antes de </body>
const PWA_SCRIPT = `<script src="/js/pwa.js"></script>`;

// Coletar todos os arquivos HTML
function getHtmlFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !['node_modules', '.git', 'uploads', 'backups', 'deploy', 'tests', 'database', 'utils', 'middleware', 'routes'].includes(entry.name)) {
            results.push(...getHtmlFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
            results.push(fullPath);
        }
    }
    return results;
}

const htmlFiles = getHtmlFiles(ROOT);
let modified = 0;
let skipped = 0;

console.log(`🔍 Encontrados ${htmlFiles.length} arquivos HTML\n`);

for (const filePath of htmlFiles) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const relPath = path.relative(ROOT, filePath);
    let changed = false;

    // Verificar se já tem manifest (já processado)
    if (content.includes('rel="manifest"') || content.includes("rel='manifest'")) {
        console.log(`  ⏭  ${relPath} (já tem manifest)`);
        skipped++;
        continue;
    }

    // 1. Injetar tags PWA no <head> — após a linha <meta name="viewport"...>
    const viewportRegex = /(<meta\s+name=["']viewport["'][^>]*>)/i;
    if (viewportRegex.test(content)) {
        content = content.replace(viewportRegex, `$1${PWA_HEAD_TAGS}`);
        changed = true;
    }

    // 2. Injetar script PWA antes de </body>
    if (content.includes('</body>') && !content.includes('pwa.js')) {
        content = content.replace('</body>', `    ${PWA_SCRIPT}\n</body>`);
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`  ✅ ${relPath}`);
        modified++;
    } else {
        console.log(`  ⚠️  ${relPath} (sem viewport ou body)`);
        skipped++;
    }
}

console.log(`\n✅ PWA integrado em ${modified} arquivos`);
console.log(`⏭  ${skipped} arquivos ignorados`);
