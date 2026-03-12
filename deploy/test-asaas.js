/* Quick test: verify Asaas config on VPS */
const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const conn = new Client();
conn.on('ready', () => {
    const script = `
cd /var/www/credbusiness
node -e '
require("dotenv").config();
const a = require("./utils/asaas");
console.log("=== Config ===");
console.log("isConfigured:", a.isConfigured());
console.log("ENV:", process.env.ASAAS_ENV);
console.log("KEY length:", (process.env.ASAAS_API_KEY||"").length);
console.log("KEY prefix:", (process.env.ASAAS_API_KEY||"").substring(0,15));
console.log("WEBHOOK length:", (process.env.ASAAS_WEBHOOK_TOKEN||"").length);
console.log("");
console.log("=== API Test (GET /finance/balance) ===");
a.getBalance().then(b => {
    if (b) { console.log("Balance:", JSON.stringify(b)); console.log("API OK!"); }
    else { console.log("ERROR: getBalance returned null"); }
}).catch(e => { console.log("ERROR:", e.message); });
'
`;
    conn.exec(script, (err, stream) => {
        if (err) { console.error(err); conn.end(); return; }
        stream.on('data', d => process.stdout.write(d));
        stream.stderr.on('data', d => process.stderr.write(d));
        stream.on('close', () => conn.end());
    });
});
conn.on('error', e => { console.error('SSH Error:', e.message); process.exit(1); });
conn.connect({
    host: process.env.VPS_HOST || '177.153.58.152',
    port: Number(process.env.VPS_PORT) || 22,
    username: process.env.VPS_USER || 'root',
    password: process.env.VPS_PASSWORD,
    readyTimeout: 30000
});
