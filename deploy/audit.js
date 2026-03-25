const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const c = new Client();
const smokeUserUsername = process.env.SMOKE_USER_USERNAME || 'credbusiness';
const smokeUserPassword = process.env.SMOKE_USER_PASSWORD;
const smokeAdminUsername = process.env.SMOKE_ADMIN_USERNAME || 'ADM-CREDBUSINESS';
const smokeAdminPassword = process.env.SMOKE_ADMIN_PASSWORD;

if (!process.env.VPS_PASSWORD || !smokeUserPassword || !smokeAdminPassword) {
  console.error('Defina VPS_PASSWORD, SMOKE_USER_PASSWORD e SMOKE_ADMIN_PASSWORD no .env antes de rodar este script.');
  process.exit(1);
}

const tests = [
  // 1. Listar todas as tabelas
  `cd /var/www/credbusiness && node -e "
    const db = require('./database/init')();
    const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();
    console.log('=== TABELAS (' + tables.length + ') ===');
    tables.forEach(t => {
      const cols = db.prepare('PRAGMA table_info(' + t.name + ')').all();
      const count = db.prepare('SELECT COUNT(*) as c FROM ' + t.name).get().c;
      console.log('\\n📋 ' + t.name + ' (' + count + ' registros)');
      cols.forEach(col => console.log('   ' + col.name + ' [' + col.type + ']' + (col.pk ? ' PK' : '') + (col.notnull ? ' NOT NULL' : '')));
    });
  "`,

  // 2. Testar TODOS os endpoints GET
  `cd /var/www/credbusiness && TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"${smokeUserUsername}","password":"${smokeUserPassword}"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))") && echo "TOKEN=$TOKEN" && echo "=== TESTING ENDPOINTS ===" && for EP in "/api/users/me" "/api/users/network" "/api/users/network/tree" "/api/users/dashboard" "/api/content/news" "/api/content/events" "/api/content/plans" "/api/content/levels" "/api/content/packages" "/api/content/settings" "/api/services/processes" "/api/services/transactions" "/api/tickets" "/api/sync"; do CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "http://localhost:3001$EP"); echo "$CODE $EP"; done`,

  // 3. Testar endpoints ADMIN
  `cd /var/www/credbusiness && ATOKEN=$(curl -s -X POST http://localhost:3001/api/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"${smokeAdminUsername}","password":"${smokeAdminPassword}"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))") && echo "=== ADMIN ENDPOINTS ===" && for EP in "/api/admin/users" "/api/admin/processes" "/api/admin/transactions" "/api/admin/tickets" "/api/admin/packages" "/api/admin/news" "/api/admin/events" "/api/admin/settings" "/api/admin/network"; do CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ATOKEN" "http://localhost:3001$EP"); echo "$CODE $EP"; done`,

  // 4. Testar criação de processo (POST)
  `cd /var/www/credbusiness && TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"${smokeUserUsername}","password":"${smokeUserPassword}"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))") && echo "=== POST TESTS ===" && curl -s -X POST http://localhost:3001/api/services/processes -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"cpf":"111.222.333-44","name":"Teste Comercial","type":"limpa_nome"}' | head -c 300 && echo "" && curl -s -X POST http://localhost:3001/api/tickets -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"subject":"Teste Ticket","message":"Testando sistema"}' | head -c 300`,

  // 5. Verificar segurança e configs
  `echo "=== SEGURANCA ===" && echo "--- Nginx ---" && nginx -t 2>&1 && echo "--- UFW ---" && ufw status && echo "--- PM2 ---" && pm2 status && echo "--- .env ---" && cat /var/www/credbusiness/.env && echo "--- Disco ---" && df -h / && echo "--- Memoria ---" && free -h && echo "--- DB Size ---" && ls -lh /var/www/credbusiness/database/*.db 2>/dev/null`,

  // 6. Testar acesso externo via nginx
  `echo "=== NGINX EXTERNO ===" && curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/login.html && echo " login.html" && curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/api/content/settings && echo " /api/settings" && curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/pages/dashboard.html && echo " dashboard.html" && curl -s -o /dev/null -w '%{http_code}' -X POST http://mkt-credbusiness.vps-kinghost.net/api/auth/login -H 'Content-Type: application/json' -d '{"username":"${smokeUserUsername}","password":"${smokeUserPassword}"}' && echo " /api/auth/login"`
];

let i = 0;
c.on('ready', () => {
  function next() {
    if (i >= tests.length) { c.end(); return; }
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TESTE ${i + 1}/${tests.length}`);
    console.log('═'.repeat(60));
    c.exec(tests[i], (err, stream) => {
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => {
        console.log(out.toString());
        i++;
        next();
      });
    });
  }
  next();
}).connect({ host: process.env.VPS_HOST || '177.153.58.152', port: Number(process.env.VPS_PORT) || 22, username: process.env.VPS_USER || 'root', password: process.env.VPS_PASSWORD, readyTimeout: 30000 });
