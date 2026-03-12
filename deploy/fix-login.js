const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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
    console.log('Connected\n');
    const APP = '/var/www/credbusiness';

    // 1. Upload fixed files
    const sftp = await new Promise((r, j) => c.sftp((e, s) => e ? j(e) : r(s)));
    const filesToUpload = [
        { local: 'server.js', remote: `${APP}/server.js` },
        { local: 'database/init.js', remote: `${APP}/database/init.js` },
    ];

    for (const file of filesToUpload) {
        const content = fs.readFileSync(path.join(__dirname, '..', file.local));
        await new Promise((r, j) => {
            const ws = sftp.createWriteStream(file.remote);
            ws.on('close', () => { console.log(`  ✅ ${file.local}`); r(); });
            ws.on('error', j);
            ws.end(content);
        });
    }

    // 2. Run seed to create root user
    console.log('\n📊 Creating root user...');
    let out = await exec(c, `cd ${APP} && node -e "
        const {initDatabase, getDB} = require('./database/init');
        initDatabase();
        const db = getDB();
        const users = db.prepare('SELECT id, username, name, email FROM users').all();
        console.log('Users:', JSON.stringify(users));
        const admins = db.prepare('SELECT id, username FROM admins').all();
        console.log('Admins:', JSON.stringify(admins));
    " 2>&1`);
    console.log(out);

    // 3. Restart PM2
    console.log('🔄 Restarting...');
    out = await exec(c, `cd ${APP} && pm2 restart credbusiness 2>&1`);
    console.log(out.substring(0, 300));

    // Wait for startup
    await new Promise(r => setTimeout(r, 4000));

    // 4. Test login with root user
    console.log('\n🧪 Testing login...');
    out = await exec(c, `curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"credbusiness","password":"Cred@2026Biz"}'`);
    const loginResult = JSON.parse(out);
    console.log('Root login:', loginResult.success ? '✅ OK' : `❌ ${loginResult.error}`);

    // 5. Test admin login
    out = await exec(c, `curl -s -X POST http://localhost:3001/api/auth/admin-login -H 'Content-Type: application/json' -d '{"username":"ADM-CREDBUSINESS","password":"credadmin"}'`);
    const adminResult = JSON.parse(out);
    console.log('Admin login:', adminResult.success ? '✅ OK' : `❌ ${adminResult.error}`);

    // 6. Test through HTTPS
    out = await exec(c, `curl -s -X POST https://www.credbusinessconsultoria.com.br/api/auth/login -H 'Content-Type: application/json' -d '{"username":"credbusiness","password":"Cred@2026Biz"}'`);
    try {
        const httpsResult = JSON.parse(out);
        console.log('HTTPS login:', httpsResult.success ? '✅ OK' : `❌ ${httpsResult.error}`);
    } catch { console.log('HTTPS login raw:', out.substring(0, 200)); }

    // 7. Test sponsor check
    out = await exec(c, `curl -s 'http://localhost:3001/api/auth/check-sponsor?username=credbusiness'`);
    console.log('Sponsor check:', out);

    // 8. PM2 status
    out = await exec(c, 'pm2 status');
    console.log('\nPM2:', out);

    // 9. Check error log for rate limiter crash
    out = await exec(c, 'tail -5 /var/www/credbusiness/logs/error-0.log 2>&1');
    console.log('Recent errors:', out);

    c.end();
}).connect({
    host: process.env.VPS_HOST || '177.153.58.152',
    port: Number(process.env.VPS_PORT) || 22,
    username: process.env.VPS_USER || 'root',
    password: process.env.VPS_PASSWORD,
    readyTimeout: 30000
});
