/* Quick VPS command runner */
const { Client } = require('ssh2');

const VPS = {
    host: '177.153.58.152',
    port: 22,
    username: 'root',
    password: 'Credbusiness2504A@',
    readyTimeout: 30000
};

const cmd = process.argv[2] || 'pm2 logs mi2 --lines 30 --nostream';

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
