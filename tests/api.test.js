/* ═══════════════════════════════════════════
   Credbusiness — API Tests
   Health, Auth, Security, Core Routes
   ═══════════════════════════════════════════ */

const request = require('supertest');

// Set env before loading app
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-automated-tests-32chars';
process.env.DB_PATH = './database/test-temp.db';

const fs = require('fs');
const path = require('path');

// Clean test DB before start
const testDbPath = path.join(__dirname, '..', 'database', 'test-temp.db');
try { fs.unlinkSync(testDbPath); } catch {}
try { fs.unlinkSync(testDbPath + '-shm'); } catch {}
try { fs.unlinkSync(testDbPath + '-wal'); } catch {}

const app = require('../server');
const { getDB } = require('../database/init');

let adminToken = '';
let userToken = '';
const testUser = {
    name: 'Teste Automatizado',
    email: 'teste@teste.com',
    username: 'testeteste',
    password: 'Test1234!',
    cpf: '12345678901',
    phone: '11999999999',
    sponsor: 'credbusiness'
};

// ═══════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════
describe('Health Check', () => {
    test('GET /api/health → 200 com status ok', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('timestamp');
    });
});

// ═══════════════════════════════════════
// SECURITY HEADERS
// ═══════════════════════════════════════
describe('Security Headers', () => {
    test('Helmet headers presentes', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
        expect(res.headers).toHaveProperty('x-frame-options');
        expect(res.headers).toHaveProperty('strict-transport-security');
    });

    test('CSRF cookie é definido', async () => {
        const res = await request(app).get('/api/health');
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const csrfCookie = cookies?.find(c => c.startsWith('csrf_token='));
        expect(csrfCookie).toBeDefined();
    });
});

// ═══════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════
describe('Auth — Admin Login', () => {
    test('POST /api/auth/admin-login com credenciais padrão → 200', async () => {
        const res = await request(app)
            .post('/api/auth/admin-login')
            .send({ username: 'ADM-CREDBUSINESS', password: 'CHANGE_ME_SUPERADMIN_PASSWORD' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        adminToken = res.body.token;
    });

    test('POST /api/auth/admin-login com senha errada → 401', async () => {
        const res = await request(app)
            .post('/api/auth/admin-login')
            .send({ username: 'admin', password: 'wrong' });
        expect(res.status).toBe(401);
    });
});

describe('Auth — Registro de Usuário', () => {
    test('POST /api/auth/register → 201 criado', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(testUser);
        // Accept 201 or 200
        expect([200, 201]).toContain(res.status);
        if (res.body.token) userToken = res.body.token;
    });

    test('POST /api/auth/register duplicado → 400/409', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(testUser);
        expect([400, 409]).toContain(res.status);
    });
});

describe('Auth — Login de Usuário', () => {
    test('POST /api/auth/login com login=email → 200 com token', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ login: testUser.email, password: testUser.password });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        userToken = res.body.token;
    });

    test('POST /api/auth/login senha errada → 401', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ login: testUser.email, password: 'WrongPass1' });
        expect(res.status).toBe(401);
    });

    test('POST /api/auth/login com username legado → 200', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: testUser.username, password: testUser.password });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
    });
});

// ═══════════════════════════════════════
// AUTH GUARD
// ═══════════════════════════════════════
describe('Auth Guard', () => {
    test('GET /api/users/me sem token → 401', async () => {
        const res = await request(app).get('/api/users/me');
        expect(res.status).toBe(401);
    });

    test('GET /api/users/me com token inválido → 401', async () => {
        const res = await request(app)
            .get('/api/users/me')
            .set('Authorization', 'Bearer invalid-token');
        expect(res.status).toBe(401);
    });

    test('GET /api/admin/dashboard sem admin → 401/403', async () => {
        const res = await request(app)
            .get('/api/admin/dashboard')
            .set('Authorization', `Bearer ${userToken}`);
        expect([401, 403]).toContain(res.status);
    });
});

// ═══════════════════════════════════════
// USER ROUTES
// ═══════════════════════════════════════
describe('User Routes', () => {
    test('GET /api/users/me → perfil do usuário', async () => {
        const res = await request(app)
            .get('/api/users/me')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('name', testUser.name);
    });

    test('GET /api/users/dashboard → dados do dashboard', async () => {
        const res = await request(app)
            .get('/api/users/dashboard')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
    });

    test('GET /api/users/network → rede do usuário', async () => {
        const res = await request(app)
            .get('/api/users/network')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
    });
});

// ═══════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════
describe('Admin Routes', () => {
    test('GET /api/admin/dashboard → métricas', async () => {
        const res = await request(app)
            .get('/api/admin/dashboard')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalUsers');
    });

    test('GET /api/admin/users → lista de usuários', async () => {
        const res = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.users || res.body)).toBe(true);
    });

    test('POST /api/admin/users/:id/release-monthly-fee libera mensalidade', async () => {
        const db = getDB();
        const user = db.prepare('SELECT id FROM users WHERE username = ?').get(testUser.username);
        expect(user).toBeTruthy();

        db.prepare("UPDATE users SET has_package = 1, access_blocked = 1, monthly_fee_paid_until = '2024-01-01' WHERE id = ?")
            .run(user.id);

        const res = await request(app)
            .post(`/api/admin/users/${user.id}/release-monthly-fee`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('paidUntil');

        const updated = db.prepare('SELECT access_blocked, monthly_fee_paid_until FROM users WHERE id = ?').get(user.id);
        expect(updated.access_blocked).toBe(0);
        expect(updated.monthly_fee_paid_until).not.toBe('2024-01-01');

        const payment = db.prepare("SELECT * FROM payments WHERE user_id = ? AND type = 'monthly_fee' AND status = 'pago' ORDER BY id DESC LIMIT 1").get(user.id);
        expect(payment).toBeTruthy();
        expect(payment.amount).toBeCloseTo(95);
    });

    test('GET /api/admin/settings → configurações', async () => {
        const res = await request(app)
            .get('/api/admin/settings')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
    });
});

// ═══════════════════════════════════════
// CONTENT ROUTES (public)
// ═══════════════════════════════════════
describe('Content Routes', () => {
    test('GET /api/content/levels → níveis', async () => {
        const res = await request(app)
            .get('/api/content/levels')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
    });

    test('GET /api/content/plans → planos', async () => {
        const res = await request(app)
            .get('/api/content/plans')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
    });

    test('GET /api/content/packages → pacotes', async () => {
        const res = await request(app)
            .get('/api/content/packages')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
    });
});

// ═══════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════
describe('Notifications', () => {
    test('GET /api/notifications → lista', async () => {
        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
    });

    test('GET /api/notifications/count → contagem', async () => {
        const res = await request(app)
            .get('/api/notifications/count')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('unread');
    });
});

// ═══════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════
describe('Rate Limiting', () => {
    test('Headers de rate limit presentes', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers).toHaveProperty('ratelimit-limit');
    });
});

// ═══════════════════════════════════════
// SECURITY REGRESSIONS
// ═══════════════════════════════════════
describe('Security Regressions', () => {
    test('Webhook Asaas sem token → 401', async () => {
        const res = await request(app)
            .post('/api/payments/webhook')
            .send({ event: 'PAYMENT_CONFIRMED', payment: { id: 'fake' } });
        expect(res.status).toBe(401);
    });

    test('Documentos privados não ficam expostos em /uploads raiz', async () => {
        const res = await request(app).get('/uploads/teste-privado.pdf');
        expect(res.status).toBe(404);
    });

    test('Reset de senha via admin exige senha forte e não expõe a senha na resposta', async () => {
        const res = await request(app)
            .post('/api/admin/users/1/reset-password')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ password: 'NovaSenha9' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(JSON.stringify(res.body)).not.toContain('NovaSenha9');
    });
});

// ═══════════════════════════════════════
// INPUT VALIDATION
// ═══════════════════════════════════════
describe('Input Validation', () => {
    test('Registro com senha fraca → 400', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...testUser, email: 'weak@test.com', username: 'weakuser', password: '123', cpf: '99999999999' });
        expect(res.status).toBe(400);
    });

    test('Registro com email inválido → 400', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ ...testUser, email: 'not-an-email', username: 'bademail', cpf: '88888888888' });
        expect(res.status).toBe(400);
    });
});

// ═══════════════════════════════════════
// 404 HANDLING
// ═══════════════════════════════════════
describe('404 Handling', () => {
    test('GET /api/rota-inexistente → 404 JSON', async () => {
        const res = await request(app).get('/api/rota-inexistente');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error');
    });
});

// ═══════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════
afterAll(() => {
    // Clean up test database
    try { fs.unlinkSync(testDbPath); } catch {}
    try { fs.unlinkSync(testDbPath + '-shm'); } catch {}
    try { fs.unlinkSync(testDbPath + '-wal'); } catch {}
});
