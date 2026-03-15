require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    const cmd = `cd /var/www/credbusiness && node -e "
const db = require('./database/init').getDB();
db.prepare('DELETE FROM contract_acceptances WHERE client_cpf = ?').run('11122233344');
console.log('Teste removido');
"`;

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
