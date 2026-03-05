// ═══════════════════════════════════════════
// Credbusiness — Payment Endpoints Test
// Tests payment routes without real Asaas
// ═══════════════════════════════════════════

const { spawn } = require('child_process');
const http = require('http');

const PORT = 3097;
let serverProcess;
let adminToken = '';
let userToken = '';
let passed = 0;
let failed = 0;

function request(method, path, data, token) {
    return new Promise((resolve) => {
        const body = data ? JSON.stringify(data) : '';
        const opts = {
            hostname: '127.0.0.1', port: PORT, path, method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;

        const req = http.request(opts, (res) => {
            let chunks = '';
            res.on('data', c => chunks += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(chunks) }); }
                catch { resolve({ status: res.statusCode, data: chunks }); }
            });
        });
        req.on('error', (e) => resolve({ status: 0, data: { error: e.message } }));
        req.write(body);
        req.end();
    });
}

function assert(label, condition) {
    if (condition) { console.log(`   ✅ ${label}`); passed++; }
    else { console.log(`   ❌ ${label}`); failed++; }
}

async function waitForServer() {
    for (let i = 0; i < 30; i++) {
        try {
            const r = await request('GET', '/api/health');
            if (r.status === 200) return true;
        } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

async function runTests() {
    console.log('Starting server on port ' + PORT + '...');
    serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        env: { ...process.env, PORT: String(PORT), JWT_SECRET: 'test-secret-payments', NODE_ENV: 'test' },
        stdio: 'pipe'
    });
    serverProcess.stderr.on('data', d => {
        const msg = d.toString();
        if (!msg.includes('JWT_SECRET') && !msg.includes('ExperimentalWarning')) {
            process.stderr.write(msg);
        }
    });

    const ready = await waitForServer();
    if (!ready) { console.error('❌ Server failed to start'); process.exit(1); }
    console.log('Server ready!\n');

    // Login
    const adminLogin = await request('POST', '/api/auth/admin-login', { username: 'admin', password: 'Cr3dBus!n3ss@2026#Adm' });
    adminToken = adminLogin.data.token;
    const userLogin = await request('POST', '/api/auth/login', { username: 'credbusiness', password: 'Service' });
    userToken = userLogin.data.token;
    assert('Admin login', !!adminToken);
    assert('User login', !!userToken);

    // Give user balance for tests
    const userId = userLogin.data.user?.id || 2;
    await request('PUT', `/api/admin/users/${userId}`, { balance: 5000 }, adminToken);

    // ═══════════════════════════════════════
    console.log('\n1. PAYMENT — Buy Package (PIX fallback)');
    const buyPix = await request('POST', '/api/payments/package/1', { method: 'pix' }, userToken);
    console.log('   ℹ️  Status:', buyPix.status, 'Approved:', buyPix.data.approved);
    assert('Status 200', buyPix.status === 200);
    assert('Success true', buyPix.data.success === true);
    assert('Approved (fallback)', buyPix.data.approved === true);

    // ═══════════════════════════════════════
    console.log('\n2. PAYMENT — Buy Package (Boleto fallback)');
    const buyBoleto = await request('POST', '/api/payments/package/2', { method: 'boleto' }, userToken);
    assert('Status 200', buyBoleto.status === 200);
    assert('Approved (fallback)', buyBoleto.data.approved === true);

    // ═══════════════════════════════════════
    console.log('\n3. PAYMENT — Invalid method');
    const badMethod = await request('POST', '/api/payments/package/1', { method: 'bitcoin' }, userToken);
    assert('Status 400', badMethod.status === 400);
    assert('Has error message', !!badMethod.data.error);

    // ═══════════════════════════════════════
    console.log('\n4. PAYMENT — Package not found');
    const badPkg = await request('POST', '/api/payments/package/999', { method: 'pix' }, userToken);
    assert('Status 404', badPkg.status === 404);
    assert('Package not found', badPkg.data.error === 'Pacote não encontrado');

    // ═══════════════════════════════════════
    console.log('\n5. PAYMENT — No auth');
    const noAuth = await request('POST', '/api/payments/package/1', { method: 'pix' });
    assert('Status 401', noAuth.status === 401);

    // ═══════════════════════════════════════
    console.log('\n6. PAYMENT — Change Plan (free plan)');
    const changePlan = await request('POST', '/api/payments/plan/basico', { method: 'pix' }, userToken);
    assert('Status 200', changePlan.status === 200);
    assert('Success', changePlan.data.success === true);
    assert('Approved (free)', changePlan.data.approved === true);

    // ═══════════════════════════════════════
    console.log('\n7. PAYMENT — Change Plan (paid plan fallback)');
    const changePaid = await request('POST', '/api/payments/plan/plus', { method: 'pix' }, userToken);
    assert('Status 200', changePaid.status === 200);
    assert('Success', changePaid.data.success === true);

    // ═══════════════════════════════════════
    console.log('\n8. PAYMENT — Plan not found');
    const badPlan = await request('POST', '/api/payments/plan/xpto', { method: 'pix' }, userToken);
    assert('Status 404', badPlan.status === 404);

    // ═══════════════════════════════════════
    console.log('\n9. PAYMENT — My payments list');
    const myPayments = await request('GET', '/api/payments/my', null, userToken);
    assert('Status 200', myPayments.status === 200);
    assert('Has payments array', Array.isArray(myPayments.data.payments));
    console.log('   ℹ️  Total payments:', myPayments.data.payments.length);

    // ═══════════════════════════════════════
    console.log('\n10. PAYMENT — Webhook (no auth token, sandbox mode)');
    const webhook = await request('POST', '/api/payments/webhook', {
        event: 'PAYMENT_RECEIVED',
        payment: { id: 'pay_test_123', status: 'RECEIVED' }
    });
    assert('Status 200', webhook.status === 200);
    assert('Received true', webhook.data.received === true);

    // ═══════════════════════════════════════
    console.log('\n11. PAYMENT — Admin list all');
    const adminList = await request('GET', '/api/payments/admin/all', null, adminToken);
    assert('Status 200', adminList.status === 200);
    assert('Has payments', Array.isArray(adminList.data.payments));
    assert('Has total', typeof adminList.data.total === 'number');
    console.log('   ℹ️  Total:', adminList.data.total);

    // ═══════════════════════════════════════
    console.log('\n12. PAYMENT — Admin balance (no gateway)');
    const balance = await request('GET', '/api/payments/admin/balance', null, adminToken);
    assert('Status 200', balance.status === 200);
    assert('Balance 0 (no gateway)', balance.data.balance === 0);

    // ═══════════════════════════════════════
    console.log('\n13. WITHDRAW — Via API (real endpoint)');
    // First give user some balance
    await request('PUT', `/api/admin/users/${userLogin.data.user?.id || 2}`, { balance: 500 }, adminToken);
    const withdraw = await request('POST', '/api/services/transactions/withdraw', { amount: 50, pixKey: '12345678901' }, userToken);
    assert('Status 200', withdraw.status === 200);
    assert('Success', withdraw.data.success === true);
    assert('Has message', !!withdraw.data.message);
    console.log('   ℹ️  Message:', withdraw.data.message);

    // ═══════════════════════════════════════
    console.log('\n14. WITHDRAW — Insufficient balance');
    const bigWithdraw = await request('POST', '/api/services/transactions/withdraw', { amount: 999999, pixKey: '12345678901' }, userToken);
    assert('Status 400', bigWithdraw.status === 400);
    assert('Insufficient balance', bigWithdraw.data.error?.includes('Saldo') || bigWithdraw.data.error?.includes('insuficiente'));

    // ═══════════════════════════════════════
    console.log('\n15. WITHDRAW — Below minimum');
    const smallWithdraw = await request('POST', '/api/services/transactions/withdraw', { amount: 10, pixKey: '12345678901' }, userToken);
    assert('Status 400', smallWithdraw.status === 400);

    // ═══════════════════════════════════════
    console.log('\n16. WITHDRAW — No PIX key');
    const noPix = await request('POST', '/api/services/transactions/withdraw', { amount: 50 }, userToken);
    assert('Status 400', noPix.status === 400);

    // Done
    console.log(`\n╔═════════════════════════════════════════╗`);
    console.log(`║  RESULTS: ${passed} passed, ${failed} failed          ║`);
    console.log(`╚═════════════════════════════════════════╝`);

    if (failed === 0) console.log('🎉 ALL PAYMENT TESTS PASSED!');
    else console.log(`⚠️  ${failed} test(s) failed`);

    serverProcess.kill('SIGTERM');
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 1000);
}

runTests().catch(err => {
    console.error('Fatal:', err);
    if (serverProcess) serverProcess.kill();
    process.exit(1);
});
