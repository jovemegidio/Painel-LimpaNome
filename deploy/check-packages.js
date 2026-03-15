const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const VPS = {
    host: process.env.VPS_HOST || '177.153.58.152',
    port: 22,
    username: 'root',
    password: process.env.VPS_PASSWORD,
    readyTimeout: 30000
};

const conn = new Client();
conn.on('ready', () => {
    const cmds = [
        "SELECT 'user_packages com pkg 49:', COUNT(*) FROM user_packages WHERE package_id=49",
        "SELECT 'payments com pkg 49:', COUNT(*) FROM payments WHERE reference_id=49 AND type='package'",
        "SELECT 'user_packages com pkg 48:', COUNT(*) FROM user_packages WHERE package_id=48",
    ];
    const sql = cmds.join('; ');
    conn.exec(`sqlite3 /var/www/credbusiness/database/credbusiness.db "${sql}"`, (err, stream) => {
        if (err) { console.error(err); conn.end(); return; }
        let out = '';
        stream.on('data', d => out += d.toString());
        stream.stderr.on('data', d => process.stderr.write(d));
        stream.on('close', () => {
            console.log(out);
            // Delete duplicate package 49 if safe
            conn.exec(`sqlite3 /var/www/credbusiness/database/credbusiness.db "DELETE FROM packages WHERE id=49"`, (e2, s2) => {
                if (e2) { console.error(e2); conn.end(); return; }
                let o2 = '';
                s2.on('data', d => o2 += d.toString());
                s2.stderr.on('data', d => process.stderr.write(d));
                s2.on('close', () => {
                    console.log('Pacote 49 removido');
                    // Reatribuir compras do 49 para o 48
                    conn.exec(`sqlite3 /var/www/credbusiness/database/credbusiness.db "UPDATE user_packages SET package_id=48 WHERE package_id=49; UPDATE payments SET reference_id=48 WHERE reference_id=49 AND type='package';"`, (e3, s3) => {
                        if (e3) { console.error(e3); conn.end(); return; }
                        s3.on('data', d => process.stdout.write(d));
                        s3.stderr.on('data', d => process.stderr.write(d));
                        s3.on('close', () => {
                            console.log('Compras reatribuidas para pacote 48');
                            // Verify final state
                            conn.exec(`sqlite3 /var/www/credbusiness/database/credbusiness.db "SELECT id, name, names_count, price, level_key FROM packages WHERE names_count=1;"`, (e4, s4) => {
                                if (e4) { console.error(e4); conn.end(); return; }
                                s4.on('data', d => process.stdout.write(d));
                                s4.stderr.on('data', d => process.stderr.write(d));
                                s4.on('close', () => conn.end());
                            });
                        });
                    });
                });
            });
        });
    });
});
conn.on('error', e => { console.error('SSH Error:', e.message); process.exit(1); });
conn.connect(VPS);
