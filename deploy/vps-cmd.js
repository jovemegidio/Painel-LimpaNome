/* Quick VPS command runner */
const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const VPS = {
    host: process.env.VPS_HOST || '177.153.58.152',
    port: Number(process.env.VPS_PORT) || 22,
    username: process.env.VPS_USER || 'root',
    password: process.env.VPS_PASSWORD,
    readyTimeout: 30000
};
if (!VPS.password) { console.error('❌ VPS_PASSWORD não definida no .env'); process.exit(1); }

const cmd = process.argv[2] || 'pm2 logs credbusiness --lines 30 --nostream';

const conn = new Client();
conn.on('ready', () => {
    conn.exec(cmd, (err, stream) => {
        if (err) { console.error(err); conn.end(); return; }
        stream.on('data', (d) => process.stdout.write(d));
        stream.stderr.on('data', (d) => process.stderr.write(d));
        stream.on('close', () => { conn.end(); process.exit(0); });
    });
});
conn.on('error', (e) => { console.error('SSH Error:', e.message); process.exit(1); });
conn.connect(VPS);
