const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const VPS = { host: process.env.VPS_HOST || '177.153.58.152', port: Number(process.env.VPS_PORT) || 22, username: process.env.VPS_USER || 'root', password: process.env.VPS_PASSWORD };
if (!VPS.password) { console.error('❌ VPS_PASSWORD não definida no .env'); process.exit(1); }
const c = new Client();

function exec(conn, cmd) {
    return new Promise((res, rej) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return rej(err);
            let out = '';
            stream.on('data', d => out += d);
            stream.stderr.on('data', d => out += d);
            stream.on('close', () => res(out));
        });
    });
}

const backupScript = `#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/var/backups/credbusiness
DB_PATH=/var/www/credbusiness/database/credbusiness.db
sqlite3 $DB_PATH ".backup $BACKUP_DIR/credbusiness_$DATE.db"
ls -t $BACKUP_DIR/credbusiness_*.db 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null
echo "[$(date)] Backup credbusiness_$DATE.db OK" >> /var/log/credbusiness-backup.log
`;

c.on('ready', async () => {
    console.log('🔗 Conectado');

    // Upload backup script
    const sftp = await new Promise((res, rej) => c.sftp((e, s) => e ? rej(e) : res(s)));
    await new Promise((res, rej) => {
        const ws = sftp.createWriteStream('/usr/local/bin/backup-credbusiness.sh');
        ws.on('close', res);
        ws.on('error', rej);
        ws.end(backupScript);
    });
    console.log('✅ Script de backup enviado');

    let out;
    out = await exec(c, 'chmod +x /usr/local/bin/backup-credbusiness.sh');
    out = await exec(c, 'mkdir -p /var/backups/credbusiness');
    out = await exec(c, 'apt-get install -y sqlite3 2>&1 | tail -3');
    console.log('  sqlite3:', out.trim());

    // Add to crontab
    out = await exec(c, '(crontab -l 2>/dev/null | grep -v backup-credbusiness; echo "0 */6 * * * /usr/local/bin/backup-credbusiness.sh") | crontab -');
    console.log('✅ Cron configurado (backup a cada 6h)');
    out = await exec(c, 'crontab -l');
    console.log('  ', out.trim());

    // Run first backup
    out = await exec(c, '/usr/local/bin/backup-credbusiness.sh && ls -la /var/backups/credbusiness/');
    console.log('✅ Primeiro backup:', out.trim());

    // Verify HTTPS works
    console.log('\n🔒 Testando HTTPS...');
    out = await exec(c, "curl -s -o /dev/null -w '%{http_code}' https://mkt-credbusiness.vps-kinghost.net/login.html");
    console.log(`  HTTPS login.html: ${out}`);
    out = await exec(c, "curl -s -o /dev/null -w '%{http_code}' https://mkt-credbusiness.vps-kinghost.net/api/health");
    console.log(`  HTTPS /api/health: ${out}`);
    out = await exec(c, "curl -s -o /dev/null -w '%{http_code}' http://mkt-credbusiness.vps-kinghost.net/login.html");
    console.log(`  HTTP→HTTPS redirect: ${out} (esperado: 301)`);

    // Final summary
    console.log('\n════════════════════════════════════════');
    out = await exec(c, "pm2 status && echo '---' && df -h / | tail -1 && echo '---' && free -h | tail -2 && echo '---' && ls -lh /var/www/credbusiness/database/credbusiness.db && echo '---' && cat /etc/nginx/sites-enabled/credbusiness | grep -E 'ssl|listen|server_name' | head -10");
    console.log(out);

    console.log('\n🎯 SETUP SSL + BACKUP COMPLETO!');
    c.end();
}).connect(VPS);
