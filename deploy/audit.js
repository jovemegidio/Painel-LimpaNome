const { Client } = require('ssh2');
const c = new Client();

const tests = [
  // 1. Listar todas as tabelas
  `cd /var/www/mi2 && node -e "
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
  `cd /var/www/mi2 && TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"credbusiness","password":"Service"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))") && echo "TOKEN=$TOKEN" && echo "=== TESTING ENDPOINTS ===" && for EP in "/api/users/me" "/api/users/network" "/api/users/network/tree" "/api/users/dashboard" "/api/content/news" "/api/content/events" "/api/content/plans" "/api/content/levels" "/api/content/packages" "/api/content/settings" "/api/services/processes" "/api/services/transactions" "/api/tickets" "/api/sync"; do CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "http://localhost:3001$EP"); echo "$CODE $EP"; done`,

  // 3. Testar endpoints ADMIN
  `cd /var/www/mi2 && ATOKEN=$(curl -s -X POST http://localhost:3001/api/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))") && echo "=== ADMIN ENDPOINTS ===" && for EP in "/api/admin/users" "/api/admin/processes" "/api/admin/transactions" "/api/admin/tickets" "/api/admin/packages" "/api/admin/news" "/api/admin/events" "/api/admin/settings" "/api/admin/network"; do CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ATOKEN" "http://localhost:3001$EP"); echo "$CODE $EP"; done`,

  // 4. Testar criação de processo (POST)
  `cd /var/www/mi2 && TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"credbusiness","password":"Service"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))") && echo "=== POST TESTS ===" && curl -s -X POST http://localhost:3001/api/services/processes -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"cpf":"111.222.333-44","name":"Teste Comercial","type":"limpa_nome"}' | head -c 300 && echo "" && curl -s -X POST http://localhost:3001/api/tickets -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"subject":"Teste Ticket","message":"Testando sistema"}' | head -c 300`,

  // 5. Verificar segurança e configs
  `echo "=== SEGURANCA ===" && echo "--- Nginx ---" && nginx -t 2>&1 && echo "--- UFW ---" && ufw status && echo "--- PM2 ---" && pm2 status && echo "--- .env ---" && cat /var/www/mi2/.env && echo "--- Disco ---" && df -h / && echo "--- Memoria ---" && free -h && echo "--- DB Size ---" && ls -lh /var/www/mi2/database/*.db 2>/dev/null`,

  // 6. Testar acesso externo via nginx
  `echo "=== NGINX EXTERNO ===" && curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/login.html && echo " login.html" && curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/api/content/settings && echo " /api/settings" && curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/pages/dashboard.html && echo " dashboard.html" && curl -s -o /dev/null -w '%{http_code}' -X POST http://mkt-credbusiness.vps-kinghost.net/api/auth/login -H 'Content-Type: application/json' -d '{"username":"credbusiness","password":"Service"}' && echo " /api/auth/login"`
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
}).connect({ host: '177.153.58.152', port: 22, username: 'root', password: 'Credbusiness2504A@', readyTimeout: 30000 });
