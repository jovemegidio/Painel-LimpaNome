const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const c = new Client();
const smokeUserUsername = process.env.SMOKE_USER_USERNAME || 'credbusiness';
const smokeUserPassword = process.env.SMOKE_USER_PASSWORD;
const smokeAdminUsername = process.env.SMOKE_ADMIN_USERNAME || 'ADM-CREDBUSINESS';
const smokeAdminPassword = process.env.SMOKE_ADMIN_PASSWORD;

if (!smokeUserPassword || !smokeAdminPassword) {
    console.error('❌ Defina SMOKE_USER_PASSWORD e SMOKE_ADMIN_PASSWORD no .env');
    process.exit(1);
}

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
    console.log('Connected\n');

    // 1. Check users in database
    console.log('=== USERS IN DATABASE ===');
    let out = await exec(c, `cd /var/www/credbusiness && node -e "
        const {getDB} = require('./database/init');
        const db = getDB();
        const users = db.prepare('SELECT id, username, name, email, active, last_login FROM users').all();
        console.log('Total users:', users.length);
        users.forEach(u => console.log(JSON.stringify(u)));
    " 2>&1`);
    console.log(out);

    // 2. Check admins
    console.log('=== ADMINS ===');
    out = await exec(c, `cd /var/www/credbusiness && node -e "
        const {getDB} = require('./database/init');
        const db = getDB();
        const admins = db.prepare('SELECT id, username, name, role FROM admins').all();
        admins.forEach(a => console.log(JSON.stringify(a)));
    " 2>&1`);
    console.log(out);

    // 3. Test login with a real user
    console.log('=== TEST LOGIN (curl to local) ===');
    out = await exec(c, `curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"${smokeUserUsername}","password":"${smokeUserPassword}"}'`);
    console.log('User login:', out);

    // 4. Test admin login
    out = await exec(c, `curl -s -X POST http://localhost:3001/api/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"${smokeAdminUsername}","password":"${smokeAdminPassword}"}'`);
    console.log('Admin login:', out.substring(0, 300));

    // 5. Test through Nginx (www)
    console.log('\n=== TEST VIA NGINX ===');
    out = await exec(c, `curl -s -o /dev/null -w '%{http_code}' -X POST https://www.credbusinessconsultoria.com.br/api/auth/login -H 'Content-Type: application/json' -d '{"username":"test","password":"test"}'`);
    console.log('www login HTTP:', out);

    out = await exec(c, `curl -sv -X POST https://www.credbusinessconsultoria.com.br/api/auth/login -H 'Content-Type: application/json' -d '{"username":"test","password":"test"}' 2>&1 | head -30`);
    console.log('www login verbose:', out);

    // 6. Check Nginx config
    console.log('\n=== NGINX CONFIG ===');
    out = await exec(c, `cat /etc/nginx/sites-enabled/credbusiness 2>/dev/null || cat /etc/nginx/conf.d/credbusiness.conf 2>/dev/null || ls /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>&1`);
    console.log(out.substring(0, 2000));

    // 7. Check PM2 status
    out = await exec(c, 'pm2 status');
    console.log('\n=== PM2 ===');
    console.log(out);

    // 8. Check recent error log
    console.log('=== RECENT ERRORS ===');
    out = await exec(c, 'tail -20 /var/www/credbusiness/logs/error-0.log 2>&1');
    console.log(out);

    // 9. Check .env JWT_SECRET
    console.log('=== JWT_SECRET check ===');
    out = await exec(c, `grep JWT_SECRET /var/www/credbusiness/.env`);
    console.log(out);

    c.end();
}).connect({
    host: process.env.VPS_HOST || '177.153.58.152',
    port: Number(process.env.VPS_PORT) || 22,
    username: process.env.VPS_USER || 'root',
    password: process.env.VPS_PASSWORD,
    readyTimeout: 30000
});
