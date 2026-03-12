/* Diagnose payment 400 error */
const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const REMOTE_SCRIPT = `
process.chdir("/var/www/credbusiness");
require("dotenv").config();
const db = require("./database/init").getDB();
db.prepare("UPDATE users SET names_available = 0 WHERE id = 1").run();
const u = db.prepare("SELECT id, name, names_available, points FROM users WHERE id = 1").get();
console.log("User after reset:", JSON.stringify(u));
`;

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) { console.error(err); conn.end(); return; }
        sftp.writeFile('/var/www/credbusiness/diag.js', REMOTE_SCRIPT, 'utf8', (err) => {
            if (err) { console.error(err); conn.end(); return; }
            conn.exec('cd /var/www/credbusiness && node diag.js && rm diag.js', (err, stream) => {
                if (err) { console.error(err); conn.end(); return; }
                stream.on('data', d => process.stdout.write(d));
                stream.stderr.on('data', d => process.stderr.write(d));
                stream.on('close', () => conn.end());
            });
        });
    });
});
conn.on('error', e => { console.error('SSH Error:', e.message); process.exit(1); });
conn.connect({
    host: process.env.VPS_HOST || '177.153.58.152',
    port: Number(process.env.VPS_PORT) || 22,
    username: process.env.VPS_USER || 'root',
    password: process.env.VPS_PASSWORD,
    readyTimeout: 30000
});
