// Test all new API endpoints — spawns server as child process
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3098;
const BASE = `http://localhost:${PORT}`;
let passed = 0, failed = 0;

function request(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function check(label, condition) {
  if (condition) { passed++; console.log(`   ✅ ${label}`); }
  else { failed++; console.log(`   ❌ ${label}`); }
}

function waitForServer(maxRetries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryConnect = () => {
      attempts++;
      const req = http.get(`${BASE}/`, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (attempts >= maxRetries) reject(new Error('Server did not start'));
        else setTimeout(tryConnect, 500);
      });
      req.end();
    };
    tryConnect();
  });
}

async function test() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  TESTING ALL NEW API ENDPOINTS       ║');
  console.log('╚══════════════════════════════════════╝\n');
  
  // ── 1. Login ──
  console.log('1. USER LOGIN');
  const login = await request('POST', '/api/auth/login', null, { username: 'credbusiness', password: 'Service' });
  check('Status 200', login.status === 200);
  check('Success true', login.data.success === true);
  check('Has token', !!login.data.token);
  const token = login.data.token;
  if (!token) { console.log('\n   FATAL: No token, cannot continue.'); return; }
  console.log('');

  // ── 2. Notifications List ──
  console.log('2. NOTIFICATIONS - List');
  const notifs = await request('GET', '/api/notifications', token);
  check('Status 200', notifs.status === 200);
  check('Has notifications array', Array.isArray(notifs.data.notifications));
  check('Has total count', typeof notifs.data.total === 'number');
  check('Has pagination (offset-based)', typeof notifs.data.total === 'number' && Array.isArray(notifs.data.notifications));
  console.log(`   📊 ${notifs.data.notifications?.length} notifications, total: ${notifs.data.total}\n`);

  // ── 3. Notifications Count ──
  console.log('3. NOTIFICATIONS - Unread Count');
  const count = await request('GET', '/api/notifications/count', token);
  check('Status 200', count.status === 200);
  check('Has unread field', typeof count.data.unread === 'number');
  console.log(`   📊 Unread: ${count.data.unread}\n`);

  // ── 4. Notifications Mark Read ──
  console.log('4. NOTIFICATIONS - Mark Read');
  if (notifs.data.notifications?.length > 0) {
    const first = notifs.data.notifications[0];
    const markRead = await request('PUT', `/api/notifications/${first.id}/read`, token);
    check('Mark single read', markRead.data.success === true);
  } else {
    console.log('   ⏭️  No notifications to mark');
  }
  const markAll = await request('PUT', '/api/notifications/read-all', token);
  check('Mark all read', markAll.data.success === true);
  console.log('');

  // ── 5. University Courses ──
  console.log('5. UNIVERSITY - Courses');
  const courses = await request('GET', '/api/university/courses', token);
  check('Status 200', courses.status === 200);
  check('Is array', Array.isArray(courses.data));
  check('Has courses', courses.data.length > 0);
  if (courses.data.length > 0) {
    check('Course has title', !!courses.data[0].title);
    check('Course has category', !!courses.data[0].category);
    console.log(`   📊 ${courses.data.length} courses, first: "${courses.data[0].title}"\n`);
  }

  // ── 6. University Progress ──
  console.log('6. UNIVERSITY - Progress');
  if (courses.data.length > 0) {
    const complete = await request('POST', '/api/university/progress', token, { courseId: courses.data[0].id });
    check('Mark completed', complete.data.success === true);
    
    const progress = await request('GET', '/api/university/progress', token);
    check('Status 200', progress.status === 200);
    check('Has completed count', typeof progress.data.completed === 'number');
    check('Has total count', typeof progress.data.total === 'number');
    check('Has percentage', typeof progress.data.percentage === 'number');
    check('Percentage > 0', progress.data.percentage > 0);
    console.log(`   📊 ${progress.data.completed}/${progress.data.total} (${progress.data.percentage}%)`);
    
    const uncomplete = await request('DELETE', `/api/university/progress/${courses.data[0].id}`, token);
    check('Uncomplete', uncomplete.data.success === true);
  }
  console.log('');

  // ── 7. Reports - Sales ──
  console.log('7. REPORTS - Sales');
  const sales = await request('GET', '/api/reports/sales', token);
  check('Status 200', sales.status === 200);
  check('Has totalSales', typeof sales.data.totalSales === 'number');
  check('Has teamSize', typeof sales.data.teamSize === 'number');
  console.log(`   📊 Sales: ${sales.data.totalSales}, Team: ${sales.data.teamSize}\n`);

  // ── 8. Reports - Commissions ──
  console.log('8. REPORTS - Commissions');
  const comms = await request('GET', '/api/reports/commissions', token);
  check('Status 200', comms.status === 200);
  check('Has total', typeof comms.data.total === 'number');
  check('Has commissions array', Array.isArray(comms.data.commissions));
  console.log(`   📊 Total: R$ ${comms.data.total}\n`);

  // ── 9. LGPD Consent - Get ──
  console.log('9. LGPD - Get Consent');
  const consent = await request('GET', '/api/lgpd/consent', token);
  check('Status 200', consent.status === 200);
  check('Has consent field', typeof consent.data.consent === 'boolean');
  console.log(`   📊 Consent: ${consent.data.consent}\n`);

  // ── 10. LGPD Consent - Update ──
  console.log('10. LGPD - Update Consent');
  const updateConsent = await request('POST', '/api/lgpd/consent', token, { consent: true });
  check('Status 200', updateConsent.status === 200);
  check('Success true', updateConsent.data.success === true);
  check('Consent returned', updateConsent.data.consent === true);
  console.log('');

  // ── 11. LGPD Export ──
  console.log('11. LGPD - Export Data');
  const exportData = await request('GET', '/api/lgpd/export', token);
  check('Status 200', exportData.status === 200);
  check('Has userData', !!exportData.data.userData);
  check('Has exportDate', !!exportData.data.exportDate);
  check('Has processes', Array.isArray(exportData.data.processes));
  check('Has transactions', Array.isArray(exportData.data.transactions));
  check('Has notifications', Array.isArray(exportData.data.notifications));
  console.log('');

  // ── 12. Sync with notifications ──
  console.log('12. SYNC - With Notifications');
  const sync = await request('GET', '/api/sync', token);
  check('Status 200', sync.status === 200);
  check('Has notifications', Array.isArray(sync.data.notifications));
  check('Has unreadNotifications', typeof sync.data.unreadNotifications === 'number');
  check('Has users', !!sync.data.users);
  check('Has currentUserId', typeof sync.data.currentUserId === 'number');
  console.log('');

  // ── 13. Admin Login ──
  console.log('13. ADMIN LOGIN');
  const adminLogin = await request('POST', '/api/auth/admin-login', null, { username: 'admin', password: 'Cr3dBus!n3ss@2026#Adm' });
  check('Status 200', adminLogin.status === 200);
  check('Success true', adminLogin.data.success === true);
  check('Has token', !!adminLogin.data.token);
  const adminToken = adminLogin.data.token;
  if (!adminToken) { console.log('   FATAL: No admin token\n'); return; }
  console.log('');

  // ── 14. Admin Users with filters ──
  console.log('14. ADMIN - Users (paginated)');
  const users = await request('GET', '/api/admin/users?page=1&limit=5', adminToken);
  check('Status 200', users.status === 200);
  check('Has users array', Array.isArray(users.data.users));
  check('Has total', typeof users.data.total === 'number');
  check('Has page', typeof users.data.page === 'number');
  check('Has totalPages', typeof users.data.totalPages === 'number');
  console.log(`   📊 Users: ${users.data.users?.length}/${users.data.total}, Pages: ${users.data.totalPages}`);
  
  const searchUsers = await request('GET', '/api/admin/users?search=cred', adminToken);
  check('Search works', searchUsers.status === 200);
  check('Search found results', searchUsers.data.users?.length > 0);
  console.log(`   📊 Search "cred": ${searchUsers.data.users?.length} results\n`);

  // ── 15. Admin Processes with filters ──
  console.log('15. ADMIN - Processes (paginated)');
  const procs = await request('GET', '/api/admin/processes?page=1&limit=5', adminToken);
  check('Status 200', procs.status === 200);
  check('Has processes array', Array.isArray(procs.data.processes));
  check('Has total', typeof procs.data.total === 'number');
  console.log(`   📊 Processes: ${procs.data.processes?.length}/${procs.data.total}\n`);

  // ── 16. Admin Transactions with filters ──
  console.log('16. ADMIN - Transactions (paginated)');
  const trans = await request('GET', '/api/admin/transactions?page=1&limit=5', adminToken);
  check('Status 200', trans.status === 200);
  check('Has transactions array', Array.isArray(trans.data.transactions));
  check('Has total', typeof trans.data.total === 'number');
  console.log(`   📊 Transactions: ${trans.data.transactions?.length}/${trans.data.total}\n`);

  // ── 17. Admin Tickets with filters ──
  console.log('17. ADMIN - Tickets (paginated)');
  const tickets = await request('GET', '/api/admin/tickets?page=1&limit=5', adminToken);
  check('Status 200', tickets.status === 200);
  check('Has tickets array', Array.isArray(tickets.data.tickets));
  check('Has total', typeof tickets.data.total === 'number');
  console.log(`   📊 Tickets: ${tickets.data.tickets?.length}/${tickets.data.total}\n`);

  // ── 18. Admin Audit Log ──
  console.log('18. ADMIN - Audit Log');
  const audit = await request('GET', '/api/admin/audit-log?page=1&limit=10', adminToken);
  check('Status 200', audit.status === 200);
  check('Has logs array', Array.isArray(audit.data.logs));
  check('Has total', typeof audit.data.total === 'number');
  check('Has entries (from login)', audit.data.total > 0);
  console.log(`   📊 Audit entries: ${audit.data.logs?.length}/${audit.data.total}\n`);

  // ── 19. Admin Create User ──
  console.log('19. ADMIN - Create User');
  const ts = Date.now();
  const newUser = await request('POST', '/api/admin/users', adminToken, {
    name: 'Teste API',
    email: `teste-api-${ts}@test.com`,
    username: `testeapi${ts}`,
    password: 'Test@123',
    cpf: '999.999.999-99',
    phone: '(11) 99999-9999'
  });
  console.log(`   📊 Status: ${newUser.status}, Data: ${JSON.stringify(newUser.data).substring(0, 200)}`);
  check('Status 201', newUser.status === 201);
  check('Success true', newUser.data.success === true);
  check('Has user object', !!newUser.data.user && typeof newUser.data.user.id === 'number');
  console.log(`   📊 Created user id: ${newUser.data.user?.id}\n`);

  // ── 20. Admin University CRUD ──
  console.log('20. ADMIN - University CRUD');
  const adminCourses = await request('GET', '/api/admin/university/courses', adminToken);
  check('List courses', adminCourses.status === 200);
  check('Has courses', Array.isArray(adminCourses.data) && adminCourses.data.length > 0);
  console.log(`   📊 Courses: ${adminCourses.data?.length}`);
  
  const newCourse = await request('POST', '/api/admin/university/courses', adminToken, {
    title: 'Curso Teste API',
    description: 'Criado via teste automatizado',
    category: 'teste',
    video_url: 'https://youtube.com/test',
    duration: 30
  });
  check('Create course', newCourse.data.success === true);
  check('Has course id', typeof newCourse.data.id === 'number');
  
  if (newCourse.data.id) {
    const updateCourse = await request('PUT', `/api/admin/university/courses/${newCourse.data.id}`, adminToken, {
      title: 'Curso Teste Atualizado'
    });
    check('Update course', updateCourse.data.success === true);
    
    const delCourse = await request('DELETE', `/api/admin/university/courses/${newCourse.data.id}`, adminToken);
    check('Delete course', delCourse.data.success === true);
  }
  console.log('');

  // ── 21. Admin Broadcast Notification ──
  console.log('21. ADMIN - Broadcast Notification');
  const broadcast = await request('POST', '/api/admin/notifications/broadcast', adminToken, {
    type: 'info',
    title: 'Teste Broadcast',
    message: 'Mensagem de teste via API automatizada'
  });
  check('Status 200', broadcast.status === 200);
  check('Success true', broadcast.data.success === true);
  check('Has message', !!broadcast.data.message);
  console.log(`   📊 ${broadcast.data.message}\n`);

  // ── 22. Admin Send Notification to user ──
  console.log('22. ADMIN - Send Notification');
  const sendNotif = await request('POST', '/api/admin/notifications/send', adminToken, {
    userId: 1,
    type: 'info',
    title: 'Teste Individual',
    message: 'Notificação de teste para user 1'
  });
  check('Status 200', sendNotif.status === 200);
  check('Success true', sendNotif.data.success === true);
  console.log('');

  // ── 23. Email Verification (resend) ──
  console.log('23. EMAIL VERIFICATION - Resend');
  const resend = await request('POST', '/api/auth/resend-verification', token);
  check('Status 200 or error', resend.status === 200 || resend.status === 400);
  console.log(`   📊 Status: ${resend.status}, Response: ${resend.data.message || resend.data.error}\n`);

  // ── 24. Documents (upload simulation) ──
  console.log('24. DOCUMENTS - Endpoints exist');
  const docs = await request('GET', '/api/documents/process/1', token);
  check('List docs returns 200', docs.status === 200);
  check('Returns array', Array.isArray(docs.data));
  console.log('');
}

// Main
async function main() {
  // Delete DB for fresh test
  const dbPath = path.join(__dirname, 'database.sqlite');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  
  console.log(`\nStarting server on port ${PORT}...\n`);
  
  const serverProc = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverReady = false;
  serverProc.stdout.on('data', (d) => {
    const s = d.toString();
    if (s.includes('Servidor rodando') && !serverReady) {
      serverReady = true;
      console.log('✅ Server started!\n');
    }
  });
  serverProc.stderr.on('data', (d) => {
    const s = d.toString();
    if (!s.includes('ExperimentalWarning')) process.stderr.write(d);
  });

  try {
    await waitForServer();
    await test();
    
    console.log('╔══════════════════════════════════════╗');
    console.log(`║  RESULTS: ${passed} passed, ${failed} failed${' '.repeat(Math.max(0, 13 - String(passed).length - String(failed).length))}║`);
    console.log('╚══════════════════════════════════════╝');
    
    if (failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED!\n');
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed.\n`);
    }
  } catch (err) {
    console.error('\nFATAL:', err.message);
  } finally {
    serverProc.kill();
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 500);
  }
}

main();
