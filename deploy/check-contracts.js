require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    const cmd = `cd /var/www/credbusiness && node -e "
const D = require('better-sqlite3');
const db = new D('database/credbusiness.db');
// Check if asaas key was saved in settings table
const settings = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('%asaas%');
console.log('Settings with asaas:', JSON.stringify(settings));
// Also check all settings keys
const allKeys = db.prepare('SELECT key FROM settings').all().map(r => r.key);
console.log('All settings keys:', allKeys.join(', '));
// Check full .env
" && echo '--- Full .env ---' && cat .env`;
    c.exec(cmd, (err, stream) => {
        let out = '';
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => out += d);
        stream.on('close', () => { console.log(out); c.end(); });
    });
}).connect({
    host: process.env.VPS_HOST || '177.153.58.152',
    port: 22,
    username: 'root',
    password: process.env.VPS_PASSWORD
});
