const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const VPS = { host: '177.153.58.152', port: 22, username: 'root', password: 'Credbusiness2504A@', readyTimeout: 30000 };
const APP_DIR = '/var/www/credbusiness';

// Files to update
const filesToUpload = [
    { local: 'server.js', remote: `${APP_DIR}/server.js` },
    { local: 'database/init.js', remote: `${APP_DIR}/database/init.js` },
    { local: 'routes/auth.js', remote: `${APP_DIR}/routes/auth.js` },
    { local: 'routes/services.js', remote: `${APP_DIR}/routes/services.js` },
    { local: 'routes/content.js', remote: `${APP_DIR}/routes/content.js` },
    { local: 'routes/admin.js', remote: `${APP_DIR}/routes/admin.js` },
    { local: 'routes/users.js', remote: `${APP_DIR}/routes/users.js` },
    { local: 'routes/sync.js', remote: `${APP_DIR}/routes/sync.js` },
    { local: 'routes/tickets.js', remote: `${APP_DIR}/routes/tickets.js` },
    { local: 'routes/notifications.js', remote: `${APP_DIR}/routes/notifications.js` },
    { local: 'routes/university.js', remote: `${APP_DIR}/routes/university.js` },
    { local: 'routes/reports.js', remote: `${APP_DIR}/routes/reports.js` },
    { local: 'routes/documents.js', remote: `${APP_DIR}/routes/documents.js` },
    { local: 'routes/lgpd.js', remote: `${APP_DIR}/routes/lgpd.js` },
    { local: 'routes/payments.js', remote: `${APP_DIR}/routes/payments.js` },
    { local: 'utils/audit.js', remote: `${APP_DIR}/utils/audit.js` },
    { local: 'utils/notifications.js', remote: `${APP_DIR}/utils/notifications.js` },
    { local: 'utils/asaas.js', remote: `${APP_DIR}/utils/asaas.js` },
    { local: '.gitignore', remote: `${APP_DIR}/.gitignore` },
    { local: 'package.json', remote: `${APP_DIR}/package.json` },
    { local: 'utils/email.js', remote: `${APP_DIR}/utils/email.js` },
    { local: 'middleware/auth.js', remote: `${APP_DIR}/middleware/auth.js` },
    { local: 'ecosystem.config.js', remote: `${APP_DIR}/ecosystem.config.js` },
    { local: 'index.html', remote: `${APP_DIR}/index.html` },
    { local: 'login.html', remote: `${APP_DIR}/login.html` },
    { local: 'register.html', remote: `${APP_DIR}/register.html` },
    { local: 'password-forgot.html', remote: `${APP_DIR}/password-forgot.html` },
    { local: 'password-reset.html', remote: `${APP_DIR}/password-reset.html` },
    { local: 'termos-de-uso.html', remote: `${APP_DIR}/termos-de-uso.html` },
    { local: 'politica-de-privacidade.html', remote: `${APP_DIR}/politica-de-privacidade.html` },
    { local: 'js/data.js', remote: `${APP_DIR}/js/data.js` },
    { local: 'js/components.js', remote: `${APP_DIR}/js/components.js` },
    { local: 'css/style.css', remote: `${APP_DIR}/css/style.css` },
    { local: 'pages/configuracoes.html', remote: `${APP_DIR}/pages/configuracoes.html` },
    { local: 'pages/dashboard.html', remote: `${APP_DIR}/pages/dashboard.html` },
    { local: 'pages/relatorios-comissoes.html', remote: `${APP_DIR}/pages/relatorios-comissoes.html` },
    { local: 'pages/relatorios-vendas.html', remote: `${APP_DIR}/pages/relatorios-vendas.html` },
    { local: 'pages/eventos.html', remote: `${APP_DIR}/pages/eventos.html` },
    { local: 'pages/pacotes-disponiveis.html', remote: `${APP_DIR}/pages/pacotes-disponiveis.html` },
    { local: 'pages/limpa-nome-consulta.html', remote: `${APP_DIR}/pages/limpa-nome-consulta.html` },
    { local: 'pages/bacen-consulta.html', remote: `${APP_DIR}/pages/bacen-consulta.html` },
    { local: 'pages/bacen-relatorios.html', remote: `${APP_DIR}/pages/bacen-relatorios.html` },
    { local: 'pages/consultas.html', remote: `${APP_DIR}/pages/consultas.html` },
    { local: 'pages/cnpj-consulta.html', remote: `${APP_DIR}/pages/cnpj-consulta.html` },
    { local: 'pages/universidade.html', remote: `${APP_DIR}/pages/universidade.html` },
    { local: 'pages/suporte-faq.html', remote: `${APP_DIR}/pages/suporte-faq.html` },
    { local: 'pages/financeiro.html', remote: `${APP_DIR}/pages/financeiro.html` },
    { local: 'pages/meu-plano.html', remote: `${APP_DIR}/pages/meu-plano.html` },
    { local: 'pages/pacotes-meus.html', remote: `${APP_DIR}/pages/pacotes-meus.html` },
    { local: 'pages/rede-arvore.html', remote: `${APP_DIR}/pages/rede-arvore.html` },
    { local: 'pages/rede-equipe.html', remote: `${APP_DIR}/pages/rede-equipe.html` },
    { local: 'pages/rede-indicados.html', remote: `${APP_DIR}/pages/rede-indicados.html` },
    { local: 'pages/suporte-tickets.html', remote: `${APP_DIR}/pages/suporte-tickets.html` },
    { local: 'pages/informativos.html', remote: `${APP_DIR}/pages/informativos.html` },
    { local: 'pages/limpa-nome-processos.html', remote: `${APP_DIR}/pages/limpa-nome-processos.html` },
    { local: 'admin/index.html', remote: `${APP_DIR}/admin/index.html` },
    { local: 'admin/users.html', remote: `${APP_DIR}/admin/users.html` },
    { local: 'admin/transactions.html', remote: `${APP_DIR}/admin/transactions.html` },
    { local: 'admin/news.html', remote: `${APP_DIR}/admin/news.html` },
    { local: 'admin/events.html', remote: `${APP_DIR}/admin/events.html` },
    { local: 'admin/packages.html', remote: `${APP_DIR}/admin/packages.html` },
    { local: 'admin/network.html', remote: `${APP_DIR}/admin/network.html` },
    { local: 'admin/settings.html', remote: `${APP_DIR}/admin/settings.html` },
    { local: 'admin/tickets.html', remote: `${APP_DIR}/admin/tickets.html` },
    { local: 'admin/processes.html', remote: `${APP_DIR}/admin/processes.html` },
];

const c = new Client();

function exec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let out = '';
            stream.on('data', d => out += d);
            stream.stderr.on('data', d => out += d);
            stream.on('close', () => resolve(out));
        });
    });
}

c.on('ready', async () => {
    console.log('🔗 Conectado à VPS\n');

    // 1. Create directories that may not exist
    console.log('📁 Criando diretórios...');
    await exec(c, `mkdir -p ${APP_DIR}/utils ${APP_DIR}/pages ${APP_DIR}/admin ${APP_DIR}/js ${APP_DIR}/css ${APP_DIR}/routes ${APP_DIR}/database ${APP_DIR}/middleware ${APP_DIR}/uploads`);
    console.log('  ✅ Todos os diretórios criados');

    // 2. Upload files via SFTP
    console.log('\n📤 Enviando arquivos atualizados...');
    const sftp = await new Promise((res, rej) => c.sftp((e, s) => e ? rej(e) : res(s)));

    for (const file of filesToUpload) {
        const localPath = path.join(__dirname, '..', file.local);
        const content = fs.readFileSync(localPath);
        await new Promise((resolve, reject) => {
            const ws = sftp.createWriteStream(file.remote);
            ws.on('close', () => { console.log(`  ✅ ${file.local}`); resolve(); });
            ws.on('error', reject);
            ws.end(content);
        });
    }

    // 3. Install new npm packages (skip if no changes)
    console.log('\n📦 Verificando dependências...');
    let out = await exec(c, `cd ${APP_DIR} && npm install --omit=dev 2>&1`);
    console.log('  ', out.substring(0, 300));

    // 4. Delete old DB (to force recreation with new schema)
    console.log('\n🗑️  Recriando banco de dados...');
    out = await exec(c, `rm -f ${APP_DIR}/database/mi2.db && echo "DB removed"`);
    console.log('  ', out.trim());

    // 5. Restart PM2
    console.log('\n🔄 Reiniciando aplicação...');
    out = await exec(c, `cd ${APP_DIR} && pm2 delete credbusiness 2>/dev/null; pm2 start ecosystem.config.js`);
    console.log('  ', out.substring(0, 200));

    // 6. Wait and check status
    await new Promise(r => setTimeout(r, 4000));
    out = await exec(c, 'pm2 status');
    console.log('\n📊 Status PM2:');
    console.log(out);

    // 7. Check logs
    out = await exec(c, 'pm2 logs credbusiness --lines 15 --nostream');
    console.log('📋 Logs:');
    console.log(out);

    // 8. Test endpoints
    console.log('\n🧪 Testando endpoints...');

    // Test security: .env should NOT be accessible
    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/.env`);
    console.log(`  .env acessível? HTTP ${out} (esperado: 404)`);

    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/server.js`);
    console.log(`  server.js acessível? HTTP ${out} (esperado: 404)`);

    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/database/mi2.db`);
    console.log(`  mi2.db acessível? HTTP ${out} (esperado: 404)`);

    // Test health
    out = await exec(c, `curl -s http://localhost:3001/api/health`);
    console.log(`  /api/health: ${out.substring(0, 100)}`);

    // Test settings (should NOT show commission rates)
    out = await exec(c, `curl -s http://localhost:3001/api/content/settings`);
    const hasCommission = out.includes('commissionLevel');
    console.log(`  Settings expõe comissões? ${hasCommission ? '❌ SIM' : '✅ NÃO'}`);

    // Test login
    out = await exec(c, `curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"credbusiness","password":"Service"}'`);
    const loginOk = out.includes('"success":true');
    console.log(`  Login: ${loginOk ? '✅ OK' : '❌ FALHOU'}`);

    // Test login with wrong password returns 401
    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"credbusiness","password":"wrong"}'`);
    console.log(`  Login errado: HTTP ${out} (esperado: 401)`);

    // Test Nginx external
    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/login.html`);
    console.log(`  Nginx login.html: HTTP ${out}`);

    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/.env`);
    console.log(`  Nginx .env: HTTP ${out} (esperado: 404)`);

    // Test new pages
    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/password-reset.html`);
    console.log(`  password-reset.html: HTTP ${out} (esperado: 200)`);

    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/termos-de-uso.html`);
    console.log(`  termos-de-uso.html: HTTP ${out} (esperado: 200)`);

    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/politica-de-privacidade.html`);
    console.log(`  politica-de-privacidade.html: HTTP ${out} (esperado: 200)`);

    // Test forgot-password no longer returns tempPassword
    out = await exec(c, `curl -s -X POST http://localhost:3001/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"username":"credbusiness","email":"cred@business.com"}'`);
    const noTemp = !out.includes('tempPassword');
    console.log(`  Forgot-password sem tempPassword? ${noTemp ? '✅ SIM' : '❌ NÃO'}`);

    // Test admin login with new password
    out = await exec(c, `curl -s -X POST http://localhost:3001/api/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"Cr3dBus!n3ss@2026#Adm"}'`);
    const adminOk = out.includes('"success":true');
    console.log(`  Admin login (nova senha): ${adminOk ? '✅ OK' : '❌ FALHOU'}`);

    // Test old admin password no longer works
    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3001/api/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}'`);
    console.log(`  Admin login (admin123): HTTP ${out} (esperado: 401)`);

    console.log('\n🎯 DEPLOY COMPLETO!');
    c.end();
}).connect(VPS);
