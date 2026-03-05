/* Temporary test: register + login on VPS via SSH */
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
        label: '=== TEST 1: REGISTER ===',
        cmd: `curl -s -X POST http://localhost:3001/api/auth/register -H 'Content-Type: application/json' -d '{"username":"teste.analise","password":"Teste123","name":"Teste Analise","email":"teste.analise@test.com","cpf":"999.888.777-66","phone":"(11) 99999-9999","sponsor":"credbusiness"}'`
    },
    {
        label: '=== TEST 2: LOGIN (verify user saved) ===',
        cmd: `curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"teste.analise","password":"Teste123"}'`
    }
];

function runCommand(conn, label, cmd) {
    return new Promise((resolve, reject) => {
        console.log('\n' + label);
        console.log('CMD: ' + cmd.substring(0, 80) + '...');
        console.log('---');
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let output = '';
            stream.on('data', (d) => { output += d.toString(); });
            stream.stderr.on('data', (d) => { output += d.toString(); });
            stream.on('close', (code) => {
                console.log('RESPONSE:', output);
                console.log('EXIT CODE:', code);
                // Try to pretty-print JSON
                try {
                    const json = JSON.parse(output);
                    console.log('PARSED JSON:', JSON.stringify(json, null, 2));
                } catch(e) { /* not JSON */ }
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

    conn.on('ready', async () => {
        console.log('SSH Connected to VPS');
        try {
            for (const { label, cmd } of commands) {
                await runCommand(conn, label, cmd);
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
        conn.end();
        process.exit(0);
    });

    conn.connect(VPS);
}

main();
