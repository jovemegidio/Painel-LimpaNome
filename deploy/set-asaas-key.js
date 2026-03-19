/* Set ASAAS_API_KEY on VPS .env - one-time script */
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

const API_KEY = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjAxMzFhZjIwLThjODgtNDMwMC05MDUwLWZkNTYwMWZmMzgwNjo6JGFhY2hfZTE4OWQxZmYtMTMxOS00N2Q2LWFmZDUtMmViY2EyYThhZGE1';

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if (err) { console.error('SFTP error:', err); conn.end(); return; }
        
        sftp.readFile('/var/www/credbusiness/.env', 'utf8', (err, data) => {
            if (err) { console.error('Read error:', err); conn.end(); return; }
            
            const updated = data.replace(/^ASAAS_API_KEY=.*/m, 'ASAAS_API_KEY=' + API_KEY)
                                .replace(/^ASAAS_ENV=.*/m, 'ASAAS_ENV=production');
            
            sftp.writeFile('/var/www/credbusiness/.env', updated, 'utf8', (err) => {
                if (err) { console.error('Write error:', err); conn.end(); return; }
                console.log('✅ ASAAS_API_KEY configurada');
                console.log('✅ ASAAS_ENV alterado para production');
                
                // Restart PM2
                conn.exec('cd /var/www/credbusiness && pm2 restart credbusiness', (err, stream) => {
                    if (err) { console.error(err); conn.end(); return; }
                    stream.on('data', d => process.stdout.write(d));
                    stream.stderr.on('data', d => process.stderr.write(d));
                    stream.on('close', () => {
                        console.log('✅ PM2 reiniciado');
                        
                        // Verify
                        conn.exec('grep "ASAAS_" /var/www/credbusiness/.env', (err, stream) => {
                            if (err) { console.error(err); conn.end(); return; }
                            stream.on('data', d => process.stdout.write(d));
                            stream.stderr.on('data', d => process.stderr.write(d));
                            stream.on('close', () => conn.end());
                        });
                    });
                });
            });
        });
    });
});
conn.on('error', e => { console.error('SSH Error:', e.message); process.exit(1); });
conn.connect(VPS);
