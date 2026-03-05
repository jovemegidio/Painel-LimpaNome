const { Client } = require('ssh2');
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
BACKUP_DIR=/var/backups/mi2
DB_PATH=/var/www/mi2/database/mi2.db
sqlite3 $DB_PATH ".backup $BACKUP_DIR/mi2_$DATE.db"
ls -t $BACKUP_DIR/mi2_*.db 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null
echo "[$(date)] Backup mi2_$DATE.db OK" >> /var/log/mi2-backup.log
`;

c.on('ready', async () => {
    console.log('🔗 Conectado');

    // Upload backup script
    const sftp = await new Promise((res, rej) => c.sftp((e, s) => e ? rej(e) : res(s)));
    await new Promise((res, rej) => {
        const ws = sftp.createWriteStream('/usr/local/bin/backup-mi2.sh');
        ws.on('close', res);
        ws.on('error', rej);
        ws.end(backupScript);
    });
    console.log('✅ Script de backup enviado');

    let out;
    out = await exec(c, 'chmod +x /usr/local/bin/backup-mi2.sh');
    out = await exec(c, 'mkdir -p /var/backups/mi2');
    out = await exec(c, 'apt-get install -y sqlite3 2>&1 | tail -3');
    console.log('  sqlite3:', out.trim());

    // Add to crontab
    out = await exec(c, '(crontab -l 2>/dev/null | grep -v backup-mi2; echo "0 */6 * * * /usr/local/bin/backup-mi2.sh") | crontab -');
    console.log('✅ Cron configurado (backup a cada 6h)');
    out = await exec(c, 'crontab -l');
    console.log('  ', out.trim());

    // Run first backup
    out = await exec(c, '/usr/local/bin/backup-mi2.sh && ls -la /var/backups/mi2/');
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
    out = await exec(c, "pm2 status && echo '---' && df -h / | tail -1 && echo '---' && free -h | tail -2 && echo '---' && ls -lh /var/www/mi2/database/mi2.db && echo '---' && cat /etc/nginx/sites-enabled/mi2 | grep -E 'ssl|listen|server_name' | head -10");
    console.log(out);

    console.log('\n🎯 SETUP SSL + BACKUP COMPLETO!');
    c.end();
}).connect({ host: '177.153.58.152', port: 22, username: 'root', password: 'Credbusiness2504A@' });
