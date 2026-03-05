/* Test registration + login via SSH on VPS */
const { Client } = require('ssh2');

const VPS = {
    host: '177.153.58.152',
    port: 22,
    username: 'root',
    password: 'Credbusiness2504A@',
    readyTimeout: 30000
};

function runCmd(conn, label, cmd) {
    return new Promise((resolve, reject) => {
        console.log(`\n========== ${label} ==========`);
        console.log(`CMD: ${cmd}\n`);
        let output = '';
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            stream.on('data', (d) => { const s = d.toString(); output += s; process.stdout.write(s); });
            stream.stderr.on('data', (d) => { const s = d.toString(); output += s; process.stderr.write(s); });
            stream.on('close', (code) => {
                console.log(`\n[Exit code: ${code}]`);
                resolve(output);
            });
        });
    });
}

(async () => {
    const conn = new Client();

    conn.on('error', (e) => { console.error('SSH Error:', e.message); process.exit(1); });

    conn.on('ready', async () => {
        console.log('SSH connected to VPS!\n');

        try {
            // 1) Register new user
            const regCmd = `curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' -d '{"username":"usuario.mar2026","password":"MinhaSenh@1","name":"Usuario Março 2026","email":"marco2026@test.com","cpf":"555.666.777-88","phone":"(21) 98765-4321","sponsor":"credbusiness"}'`;
            await runCmd(conn, 'REGISTER', regCmd);

            // 2) Login with the new user
            const loginCmd = `curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"usuario.mar2026","password":"MinhaSenh@1"}'`;
            await runCmd(conn, 'LOGIN', loginCmd);

        } catch (e) {
            console.error('Error:', e.message);
        }

        conn.end();
        process.exit(0);
    });

    conn.connect(VPS);
})();
