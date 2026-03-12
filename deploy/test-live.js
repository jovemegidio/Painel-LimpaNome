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
    console.log('Connected to VPS\n');

    // Upload fixed init.js
    const sftp = await new Promise((r, j) => c.sftp((e, s) => e ? j(e) : r(s)));
    const content = fs.readFileSync(path.join(__dirname, '..', 'database/init.js'));
    await new Promise((r, j) => {
        const ws = sftp.createWriteStream('/var/www/credbusiness/database/init.js');
        ws.on('close', () => { console.log('database/init.js uploaded\n'); r(); });
        ws.on('error', j);
        ws.end(content);
    });

    console.log('Testing endpoints...\n');

    let out = await exec(c, 'curl -s http://localhost:3001/api/health');
    console.log('Health:', out.substring(0, 200));

    out = await exec(c, "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/favicon.ico");
    console.log('Favicon:', out);

    out = await exec(c, "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/login.html");
    console.log('Login page:', out);

    out = await exec(c, "curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{\"username\":\"test\",\"password\":\"wrong\"}'");
    console.log('Login wrong:', out.substring(0, 200));

    out = await exec(c, "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/.env");
    console.log('.env blocked:', out);

    out = await exec(c, "curl -s -o /dev/null -w '%{http_code}' https://credbusinessconsultoria.com.br/login.html");
    console.log('HTTPS login:', out);

    out = await exec(c, "curl -s -o /dev/null -w '%{http_code}' https://credbusinessconsultoria.com.br/favicon.ico");
    console.log('HTTPS favicon:', out);

    // Check PM2 status
    out = await exec(c, 'pm2 status');
    console.log('\nPM2 Status:');
    console.log(out);

    // Fix PM2 - kill whatever is on 3001, then restart properly
    console.log('\n--- FIXING PM2 ---');
    out = await exec(c, 'fuser -k 3001/tcp 2>/dev/null; sleep 1; cd /var/www/credbusiness && pm2 delete credbusiness 2>/dev/null; pm2 start ecosystem.config.js 2>&1');
    console.log(out);
    
    // Wait for startup
    await new Promise(r => setTimeout(r, 5000));
    
    // Verify PM2 status
    out = await exec(c, 'pm2 status');
    console.log('\nPM2 after fix:');
    console.log(out);

    // Final endpoint test
    out = await exec(c, 'curl -s http://localhost:3001/api/health');
    console.log('Health check:', out);

    c.end();
}).connect({
    host: process.env.VPS_HOST || '177.153.58.152',
    port: Number(process.env.VPS_PORT) || 22,
    username: process.env.VPS_USER || 'root',
    password: process.env.VPS_PASSWORD,
    readyTimeout: 30000
});
