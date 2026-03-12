const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const VPS = { host: process.env.VPS_HOST || '177.153.58.152', port: Number(process.env.VPS_PORT) || 22, username: process.env.VPS_USER || 'root', password: process.env.VPS_PASSWORD, readyTimeout: 30000 };
if (!VPS.password) { console.error('❌ VPS_PASSWORD não definida no .env'); process.exit(1); }
const c = new Client();
c.on('ready', async () => {
    function exec(cmd) {
        return new Promise((ok, fail) => {
            c.exec(cmd, (e, s) => {
                if (e) return fail(e);
                let o = '';
                s.on('data', d => o += d);
                s.stderr.on('data', d => o += d);
                s.on('close', code => ok({ out: o, code }));
            });
        });
    }

    console.log('Connected to VPS\n');

    // 1. Check Nginx status
    const nginx = await exec('systemctl status nginx 2>&1 | head -20');
    console.log('=== NGINX STATUS ===');
    console.log(nginx.out);

    // 2. Check PM2 status
    const pm2 = await exec('pm2 status 2>&1');
    console.log('=== PM2 STATUS ===');
    console.log(pm2.out);

    // 3. Check PM2 error logs
    const logs = await exec('pm2 logs credbusiness --err --lines 20 --nostream 2>&1');
    console.log('=== PM2 ERROR LOGS ===');
    console.log(logs.out);

    // 4. Check PM2 out logs
    const outLogs = await exec('pm2 logs credbusiness --out --lines 10 --nostream 2>&1');
    console.log('=== PM2 OUT LOGS ===');
    console.log(outLogs.out);

    // 5. Check if port 3001 is listening
    const port = await exec('ss -tlnp | grep 3001 2>&1');
    console.log('=== PORT 3001 ===');
    console.log(port.out || '(not listening)');

    // 6. Check if port 80 is listening
    const port80 = await exec('ss -tlnp | grep :80 2>&1');
    console.log('=== PORT 80 ===');
    console.log(port80.out || '(not listening)');

    // 7. Check Nginx config
    const nginxTest = await exec('nginx -t 2>&1');
    console.log('=== NGINX CONFIG TEST ===');
    console.log(nginxTest.out);

    // 8. Check .env
    const env = await exec('cat /var/www/credbusiness/.env');
    console.log('=== .ENV ===');
    console.log(env.out);

    c.end();
});
c.on('error', err => console.error('SSH Error:', err.message));
c.connect(VPS);
