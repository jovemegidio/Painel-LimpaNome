const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const c = new Client();
const userUsername = process.env.SMOKE_USER_USERNAME || 'credbusiness';
const userPassword = process.env.SMOKE_USER_PASSWORD;
const adminUsername = process.env.SMOKE_ADMIN_USERNAME || 'ADM-CREDBUSINESS';
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

if (!process.env.VPS_PASSWORD || !userPassword || !adminPassword) {
  console.error('Defina VPS_PASSWORD, SMOKE_USER_PASSWORD e SMOKE_ADMIN_PASSWORD no .env antes de rodar este script.');
  process.exit(1);
}

c.on('ready', () => {
  const cmds = [
    // Test login
    `curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"${userUsername}","password":"${userPassword}"}'`,
    // Test admin login
    `curl -s -X POST http://localhost:3001/api/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"${adminUsername}","password":"${adminPassword}"}'`,
    // Test public site via nginx
    `curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/login.html`,
    // Test API via nginx
    `curl -s http://mkt-credbusiness.vps-kinghost.net/api/content/settings | head -c 100`
  ];

  let i = 0;
  function next() {
    if (i >= cmds.length) { c.end(); return; }
    const label = ['LOGIN', 'ADMIN LOGIN', 'NGINX HTML', 'NGINX API'][i];
    console.log(`\n=== ${label} ===`);
    c.exec(cmds[i], (err, stream) => {
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => {
        console.log(out.toString().substring(0, 500));
        i++;
        next();
      });
    });
  }
  next();
}).connect({
  host: process.env.VPS_HOST || '177.153.58.152',
  port: Number(process.env.VPS_PORT) || 22,
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 30000
});
