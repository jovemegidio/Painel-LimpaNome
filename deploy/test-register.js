/* Test complete registration flow on VPS */
const { Client } = require('ssh2');

const VPS = {
    host: '177.153.58.152',
    port: 22,
    username: 'root',
    password: 'Credbusiness2504A@',
    readyTimeout: 30000
};

const commands = [
    {
        label: '1) REGISTER new user',
        cmd: `curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' -d '{"username":"novo.usuario","password":"Teste123","name":"Novo Usuário Teste","email":"novo@test.com","cpf":"111.222.333-44","phone":"(11) 91234-5678","sponsor":"credbusiness"}'`
    },
    {
        label: '2) LOGIN with new user',
        cmd: `curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"novo.usuario","password":"Teste123"}'`
    },
    {
        label: '3) CHECK register.html accessible (HTTP status)',
        cmd: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/register.html`
    },
    {
        label: '4) CHECK referral link register page (HTTP status)',
        cmd: `curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3001/register.html?ref=credbusiness'`
    }
];

function runCommand(conn, { label, cmd }) {
    return new Promise((resolve, reject) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`  ${label}`);
        console.log(`${'='.repeat(60)}`);
        console.log(`> ${cmd}\n`);

        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let output = '';
            stream.on('data', (d) => {
                const s = d.toString();
                output += s;
                process.stdout.write(s);
            });
            stream.stderr.on('data', (d) => {
                const s = d.toString();
                output += s;
                process.stderr.write(s);
            });
            stream.on('close', (code) => {
                console.log(`\n[exit code: ${code}]`);
                resolve(output);
            });
        });
    });
}

async function main() {
    const conn = new Client();

    conn.on('error', (e) => {
        console.error('SSH Error:', e.message);
        process.exit(1);
    });

    await new Promise((resolve) => {
        conn.on('ready', resolve);
        conn.connect(VPS);
    });

    console.log('=== SSH connected to VPS ===\n');

    for (const c of commands) {
        await runCommand(conn, c);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('  ALL TESTS COMPLETE');
    console.log(`${'='.repeat(60)}`);

    conn.end();
    process.exit(0);
}

main().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
