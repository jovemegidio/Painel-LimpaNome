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
                s.on('close', () => ok(o));
            });
        });
    }

    // Full nginx config
    const conf = await exec('cat /etc/nginx/sites-available/credbusiness');
    console.log('=== FULL NGINX CONFIG ===');
    console.log(conf);

    // Check if SSL cert still exists
    const ssl = await exec('ls -la /etc/letsencrypt/live/ 2>&1');
    console.log('\n=== SSL CERTS ===');
    console.log(ssl);

    // Check enabled sites
    const enabled = await exec('ls -la /etc/nginx/sites-enabled/ 2>&1');
    console.log('\n=== SITES ENABLED ===');
    console.log(enabled);

    // Test curl localhost
    const curl = await exec('curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>&1');
    console.log('\n=== CURL localhost:3001 ===');
    console.log('HTTP', curl);

    // Test curl via nginx
    const curlNginx = await exec('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>&1');
    console.log('\n=== CURL via Nginx (127.0.0.1:80) ===');
    console.log('HTTP', curlNginx);

    // Check default nginx config
    const defaultConf = await exec('cat /etc/nginx/sites-available/default 2>&1 | head -20');
    console.log('\n=== DEFAULT SITE CONFIG ===');
    console.log(defaultConf);

    c.end();
});
c.on('error', err => console.error('SSH Error:', err.message));
c.connect(VPS);
