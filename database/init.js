/* ═══════════════════════════════════════════
   Credbusiness — Database Initialization (SQLite)
   ═══════════════════════════════════════════ */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

let db;

function getDB() {
    if (!db) {
        const dbPath = process.env.DB_PATH || path.join(__dirname, 'credbusiness.db');
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

function initDatabase() {
    const d = getDB();

    d.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT DEFAULT '',
            cpf TEXT DEFAULT '',
            pix_key TEXT DEFAULT '',
            pix_type TEXT DEFAULT 'cpf',
            level TEXT DEFAULT 'start',
            has_package INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            bonus REAL DEFAULT 0,
            balance REAL DEFAULT 0,
            sponsor_id INTEGER,
            plan TEXT DEFAULT 'basico',
            active INTEGER DEFAULT 1,
            avatar TEXT,
            role TEXT DEFAULT 'user',
            last_login TEXT,
            created_at TEXT DEFAULT (date('now')),
            FOREIGN KEY (sponsor_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'superadmin'
        );

        CREATE TABLE IF NOT EXISTS levels (
            key TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            min_points INTEGER DEFAULT 0,
            color TEXT DEFAULT '#9e9e9e',
            icon TEXT DEFAULT '🥈',
            bonus_percent REAL DEFAULT 5,
            commission_percent REAL DEFAULT 5
        );

        CREATE TABLE IF NOT EXISTS plans (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            features TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            points INTEGER DEFAULT 0,
            description TEXT DEFAULT '',
            level_key TEXT DEFAULT '',
            active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS user_packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            package_id INTEGER NOT NULL,
            purchased_at TEXT DEFAULT (date('now')),
            status TEXT DEFAULT 'pendente',
            payment_status TEXT DEFAULT 'pendente',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (package_id) REFERENCES packages(id)
        );

        CREATE TABLE IF NOT EXISTS processes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            cpf TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'pendente',
            type TEXT DEFAULT 'negativacao',
            value REAL DEFAULT 0,
            institution TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (date('now')),
            updated_at TEXT DEFAULT (date('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT DEFAULT '',
            reference_type TEXT DEFAULT '',
            reference_id INTEGER,
            date TEXT DEFAULT (date('now')),
            status TEXT DEFAULT 'creditado',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            date TEXT DEFAULT (date('now')),
            category TEXT DEFAULT 'novidade'
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT DEFAULT '',
            type TEXT DEFAULT 'online',
            location TEXT DEFAULT '',
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'proximo'
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT DEFAULT 'aberto',
            priority TEXT DEFAULT 'media',
            created_at TEXT DEFAULT (date('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ticket_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            from_type TEXT NOT NULL,
            message TEXT NOT NULL,
            date TEXT DEFAULT (date('now')),
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS consultations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            cpf TEXT NOT NULL,
            name TEXT DEFAULT '',
            type TEXT DEFAULT 'cpf',
            result TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS commissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            level INTEGER NOT NULL,
            amount REAL NOT NULL,
            source_type TEXT DEFAULT 'package',
            source_id INTEGER,
            date TEXT DEFAULT (date('now')),
            FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_type TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            entity TEXT DEFAULT '',
            entity_id INTEGER,
            details TEXT DEFAULT '',
            ip TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT DEFAULT 'info',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            link TEXT DEFAULT '',
            read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS email_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at TEXT NOT NULL,
            verified INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            process_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            mimetype TEXT DEFAULT '',
            size INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS university_courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            category TEXT DEFAULT 'geral',
            thumbnail TEXT DEFAULT '',
            video_url TEXT DEFAULT '',
            duration TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS university_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            completed INTEGER DEFAULT 0,
            completed_at TEXT,
            UNIQUE(user_id, course_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES university_courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            asaas_payment_id TEXT DEFAULT '',
            asaas_customer_id TEXT DEFAULT '',
            type TEXT NOT NULL DEFAULT 'package',
            reference_id INTEGER DEFAULT 0,
            amount REAL NOT NULL DEFAULT 0,
            method TEXT DEFAULT 'pix',
            status TEXT DEFAULT 'pendente',
            invoice_url TEXT DEFAULT '',
            pix_qr_code TEXT DEFAULT '',
            pix_copy_paste TEXT DEFAULT '',
            external_reference TEXT DEFAULT '',
            due_date TEXT DEFAULT '',
            paid_at TEXT,
            updated_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // ── Índices para performance ──
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_users_sponsor ON users(sponsor_id)',
        'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
        'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
        'CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)',
        'CREATE INDEX IF NOT EXISTS idx_processes_user ON processes(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_processes_status ON processes(status)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)',
        'CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)',
        'CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket ON ticket_responses(ticket_id)',
        'CREATE INDEX IF NOT EXISTS idx_consultations_user ON consultations(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_user_packages_user ON user_packages(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_commissions_to ON commissions(to_user_id)',
        'CREATE INDEX IF NOT EXISTS idx_commissions_from ON commissions(from_user_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_type, user_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)',
        'CREATE INDEX IF NOT EXISTS idx_password_reset ON password_reset_tokens(token, used)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token, verified)',
        'CREATE INDEX IF NOT EXISTS idx_documents_process ON documents(process_id)',
        'CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_university_progress_user ON university_progress(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_payments_asaas_id ON payments(asaas_payment_id)',
        'CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)',
        'CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type)',
        'CREATE INDEX IF NOT EXISTS idx_payments_external_ref ON payments(external_reference)'
    ];
    indexes.forEach(sql => d.exec(sql));

    // ── Migração: adicionar colunas novas se não existirem ──
    const addCol = (table, col, def) => {
        try { d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch {}
    };
    addCol('users', 'pix_key', "TEXT DEFAULT ''");
    addCol('users', 'pix_type', "TEXT DEFAULT 'cpf'");
    addCol('users', 'last_login', 'TEXT');
    addCol('users', 'totp_secret', 'TEXT');
    addCol('users', 'totp_enabled', 'INTEGER DEFAULT 0');
    addCol('users', 'totp_temp_token', 'TEXT');
    addCol('users', 'totp_temp_expires', 'TEXT');
    addCol('users', 'lgpd_consent', 'INTEGER DEFAULT 0');
    addCol('users', 'lgpd_consent_date', 'TEXT');
    addCol('processes', 'notes', "TEXT DEFAULT ''");
    addCol('transactions', 'reference_type', "TEXT DEFAULT ''");
    addCol('transactions', 'reference_id', 'INTEGER');
    addCol('user_packages', 'payment_status', "TEXT DEFAULT 'pendente'");
    addCol('user_packages', 'payment_method', "TEXT DEFAULT ''");
    addCol('users', 'email_verified', 'INTEGER DEFAULT 0');
    addCol('users', 'email_verified_at', 'TEXT');
    addCol('users', 'asaas_customer_id', "TEXT DEFAULT ''");
    addCol('users', 'financial_password', 'TEXT');
    addCol('events', 'price', 'REAL DEFAULT 0');
    addCol('events', 'max_tickets', 'INTEGER DEFAULT 0');
    addCol('events', 'image', "TEXT DEFAULT ''");

    // v5 — MLM restructure: has_package gate + level_key on packages
    addCol('users', 'has_package', 'INTEGER DEFAULT 0');
    addCol('packages', 'level_key', "TEXT DEFAULT ''");
    addCol('packages', 'names_count', 'INTEGER DEFAULT 0');

    // v6 — Créditos de nomes disponíveis para usar em processos
    addCol('users', 'names_available', 'INTEGER DEFAULT 0');

    // v4 — Profile enrichment
    addCol('users', 'nickname', "TEXT DEFAULT ''");
    addCol('users', 'birth_date', "TEXT DEFAULT ''");
    addCol('users', 'gender', "TEXT DEFAULT ''");
    addCol('users', 'bio', "TEXT DEFAULT ''");
    addCol('users', 'person_type', "TEXT DEFAULT 'pf'");
    addCol('users', 'cnpj', "TEXT DEFAULT ''");
    addCol('users', 'company_name', "TEXT DEFAULT ''");
    addCol('processes', 'person_type', "TEXT DEFAULT 'pf'");
    addCol('processes', 'cnpj', "TEXT DEFAULT ''");
    addCol('processes', 'company_name', "TEXT DEFAULT ''");

    // v3 — Address fields
    addCol('users', 'address_street', "TEXT DEFAULT ''");
    addCol('users', 'address_number', "TEXT DEFAULT ''");
    addCol('users', 'address_complement', "TEXT DEFAULT ''");
    addCol('users', 'address_neighborhood', "TEXT DEFAULT ''");
    addCol('users', 'address_city', "TEXT DEFAULT ''");
    addCol('users', 'address_state', "TEXT DEFAULT ''");
    addCol('users', 'address_zip', "TEXT DEFAULT ''");
    addCol('users', 'address_country', "TEXT DEFAULT 'BR'");

    // v6 — Dados bancários para repasse de bônus
    addCol('users', 'bank_name', "TEXT DEFAULT ''");
    addCol('users', 'bank_agency', "TEXT DEFAULT ''");
    addCol('users', 'bank_account', "TEXT DEFAULT ''");
    addCol('users', 'bank_type', "TEXT DEFAULT 'corrente'");

    // v7 — Mensalidade e controle de saques
    addCol('users', 'monthly_fee_paid_until', 'TEXT');
    addCol('users', 'access_blocked', 'INTEGER DEFAULT 0');
    addCol('users', 'last_withdraw_date', 'TEXT');

    // ── Novas tabelas (v2 — features AgilCred) ──
    d.exec(`
        CREATE TABLE IF NOT EXISTS event_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            event_id INTEGER NOT NULL,
            quantity INTEGER DEFAULT 1,
            total REAL DEFAULT 0,
            status TEXT DEFAULT 'pendente',
            payment_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS event_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            event_id INTEGER NOT NULL,
            ticket_code TEXT UNIQUE NOT NULL,
            attendee_name TEXT DEFAULT '',
            status TEXT DEFAULT 'ativo',
            used_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (order_id) REFERENCES event_orders(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            category TEXT DEFAULT 'geral',
            file_url TEXT NOT NULL,
            file_type TEXT DEFAULT '',
            file_size TEXT DEFAULT '',
            thumbnail TEXT DEFAULT '',
            active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS level_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            from_level TEXT,
            to_level TEXT NOT NULL,
            points_at_change INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_event_orders_user ON event_orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_event_orders_event ON event_orders(event_id);
        CREATE INDEX IF NOT EXISTS idx_event_tickets_user ON event_tickets(user_id);
        CREATE INDEX IF NOT EXISTS idx_event_tickets_order ON event_tickets(order_id);
        CREATE INDEX IF NOT EXISTS idx_downloads_active ON downloads(active);
        CREATE INDEX IF NOT EXISTS idx_level_history_user ON level_history(user_id);
    `);

    // ── v3 — User Documents (KYC), Contracts, Subscriptions ──
    d.exec(`
        CREATE TABLE IF NOT EXISTS user_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL DEFAULT 'rg',
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            mimetype TEXT DEFAULT '',
            size INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pendente',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            reviewed_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            version TEXT DEFAULT '1.0',
            required INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            contract_id INTEGER NOT NULL,
            accepted INTEGER DEFAULT 0,
            accepted_at TEXT,
            ip TEXT DEFAULT '',
            UNIQUE(user_id, contract_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            plan_id TEXT NOT NULL,
            status TEXT DEFAULT 'ativa',
            asaas_subscription_id TEXT DEFAULT '',
            start_date TEXT DEFAULT (date('now')),
            next_billing TEXT,
            canceled_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (plan_id) REFERENCES plans(id)
        );

        CREATE INDEX IF NOT EXISTS idx_user_documents_user ON user_documents(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_contracts_user ON user_contracts(user_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    `);

    // ── v4 — Custom Pages (admin-managed dynamic pages) ──
    d.exec(`
        CREATE TABLE IF NOT EXISTS custom_pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            icon TEXT DEFAULT 'fa-file-alt',
            content TEXT DEFAULT '',
            section TEXT DEFAULT 'Personalizado',
            sort_order INTEGER DEFAULT 0,
            visible INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_custom_pages_slug ON custom_pages(slug);
        CREATE INDEX IF NOT EXISTS idx_custom_pages_visible ON custom_pages(visible);
    `);

    // Seed if empty
    const count = d.prepare('SELECT COUNT(*) as c FROM users').get();
    if (count.c === 0) {
        seedData(d);
        console.log('✅ Banco de dados populado com dados iniciais');
    }

    // Downloads and contracts seeds (run independently of users)
    seedDownloadsAndContracts(d);

    console.log('✅ Banco de dados inicializado');
    return d;
}

function seedData(d) {
    const h = (pw) => bcrypt.hashSync(pw, 10);

    // Admin
    d.prepare('INSERT OR IGNORE INTO admins (username, password, name, role) VALUES (?,?,?,?)')
        .run('ADM-CREDBUSINESS', h('credadmin'), 'Administrador', 'superadmin');

    // Root user (primeiro patrocinador da rede — necessário para registros)
    const rootExists = d.prepare('SELECT id FROM users WHERE username = ?').get('credbusiness');
    if (!rootExists) {
        d.prepare(`
            INSERT INTO users (username, password, name, email, phone, cpf, sponsor_id, plan, level, points, bonus, balance, active, role, lgpd_consent, lgpd_consent_date, email_verified, has_package, created_at)
            VALUES (?, ?, ?, ?, '', '', NULL, 'premium', 'diamante', 0, 0, 0, 1, 'user', 1, datetime('now'), 1, 1, date('now'))
        `).run('credbusiness', h('Cred@2026Biz'), 'Credbusiness', 'contato@credbusinessconsultoria.com.br');
    }

    // Levels (5 níveis — patrocínio em decadência: Diamante→Ouro→Prata→Bronze→Start)
    const iL = d.prepare('INSERT OR IGNORE INTO levels (key,name,min_points,color,icon,bonus_percent,commission_percent) VALUES (?,?,?,?,?,?,?)');
    iL.run('start', 'Start', 0, '#78909c', 'fa-rocket', 3, 3);
    iL.run('bronze', 'Bronze', 200, '#cd7f32', 'fa-medal', 5, 5);
    iL.run('prata', 'Prata', 500, '#9e9e9e', 'fa-award', 8, 8);
    iL.run('ouro', 'Ouro', 1000, '#ffc107', 'fa-crown', 12, 10);
    iL.run('diamante', 'Diamante', 2000, '#00bcd4', 'fa-gem', 15, 12);

    // Plans
    const iP = d.prepare('INSERT OR IGNORE INTO plans (id,name,price,features) VALUES (?,?,?,?)');
    iP.run('basico', 'Básico', 49.90, JSON.stringify(['Limpa Nome básico', '1 consulta/mês', 'Suporte email']));
    iP.run('plus', 'Plus', 99.90, JSON.stringify(['Limpa Nome completo', '5 consultas/mês', 'Suporte prioritário', 'Relatórios']));
    iP.run('premium', 'Premium', 199.90, JSON.stringify(['Limpa Nome VIP', 'Consultas ilimitadas', 'Suporte 24h', 'Relatórios avançados', 'Bacen completo']));

    // (Sem dados mock — usuários, processos, transações etc. são criados em produção)

    // Settings
    const iS = d.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)');
    iS.run('siteName', 'Credbusiness');
    iS.run('siteTitle', 'Credbusiness — Escritório Virtual');
    iS.run('logoText', 'Credbusiness');
    iS.run('faviconEmoji', '💎');
    iS.run('primaryColor', '#6366f1');
    iS.run('accentColor', '#10b981');
    iS.run('footerText', '© 2026 Credbusiness');
    iS.run('loginBg', 'css/Fundo/Fundo.jpg');
    iS.run('commissionType', 'percentage');
    iS.run('commissionLevel1', '10');
    iS.run('commissionLevel2', '5');
    iS.run('commissionLevel3', '2');
    iS.run('commissionFixedAmount', '30');
    iS.run('maxSponsoredPerUser', '12');
    iS.run('minWithdraw', '100');
    iS.run('withdrawFee', '2.50');
    iS.run('monthlyFee', '95');
    iS.run('maintenanceMode', 'false');
}

function seedDownloadsAndContracts(d) {
    // Packages — preços por nível × quantidade de nomes
    // Diamante: R$130/nome | Ouro: R$160 | Prata: R$190 | Bronze: R$220 | Start: R$250
    const pkgCount = d.prepare('SELECT COUNT(*) as c FROM packages WHERE names_count > 0').get().c;
    if (pkgCount === 0) {
    // Remove old-format packages (names_count = 0) if any
    d.prepare('DELETE FROM packages WHERE names_count = 0 OR names_count IS NULL').run();
    const iPk = d.prepare('INSERT INTO packages (name,price,points,description,level_key,names_count) VALUES (?,?,?,?,?,?)');
    // Diamante (R$130/nome)
    iPk.run('3 Nomes', 390, 150, 'Pacote 3 nomes — Nível Diamante', 'diamante', 3);
    iPk.run('5 Nomes', 650, 300, 'Pacote 5 nomes — Nível Diamante', 'diamante', 5);
    iPk.run('10 Nomes', 1300, 650, 'Pacote 10 nomes — Nível Diamante', 'diamante', 10);
    // Ouro (R$160/nome)
    iPk.run('3 Nomes', 480, 150, 'Pacote 3 nomes — Nível Ouro', 'ouro', 3);
    iPk.run('5 Nomes', 800, 300, 'Pacote 5 nomes — Nível Ouro', 'ouro', 5);
    iPk.run('10 Nomes', 1600, 650, 'Pacote 10 nomes — Nível Ouro', 'ouro', 10);
    // Prata (R$190/nome)
    iPk.run('3 Nomes', 570, 150, 'Pacote 3 nomes — Nível Prata', 'prata', 3);
    iPk.run('5 Nomes', 950, 300, 'Pacote 5 nomes — Nível Prata', 'prata', 5);
    iPk.run('10 Nomes', 1900, 650, 'Pacote 10 nomes — Nível Prata', 'prata', 10);
    // Bronze (R$220/nome)
    iPk.run('3 Nomes', 660, 150, 'Pacote 3 nomes — Nível Bronze', 'bronze', 3);
    iPk.run('5 Nomes', 1100, 300, 'Pacote 5 nomes — Nível Bronze', 'bronze', 5);
    iPk.run('10 Nomes', 2200, 650, 'Pacote 10 nomes — Nível Bronze', 'bronze', 10);
    // Start (R$250/nome)
    iPk.run('3 Nomes', 750, 150, 'Pacote 3 nomes — Nível Start', 'start', 3);
    iPk.run('5 Nomes', 1250, 300, 'Pacote 5 nomes — Nível Start', 'start', 5);
    iPk.run('10 Nomes', 2500, 650, 'Pacote 10 nomes — Nível Start', 'start', 10);
    }

    // Downloads (materiais de marketing — URLs serão configuradas pelo admin)
    const dlCount = d.prepare('SELECT COUNT(*) as c FROM downloads').get().c;
    if (dlCount === 0) {
    const iDl = d.prepare('INSERT INTO downloads (title, description, category, file_url, file_type, file_size, sort_order) VALUES (?,?,?,?,?,?,?)');
    iDl.run('Logo Credbusiness (PNG)', 'Logo oficial para uso em materiais de divulgação', 'marca', '/css/logo.png', 'image/png', '45 KB', 1);
    iDl.run('Apresentação Institucional', 'Slides para apresentar a oportunidade Credbusiness', 'apresentacoes', '#', 'application/pdf', '2.3 MB', 2);
    iDl.run('Banner para Redes Sociais', 'Banner otimizado para Facebook e Instagram', 'redes-sociais', '#', 'image/png', '320 KB', 3);
    iDl.run('Cartão de Visita Digital', 'Template de cartão de visita editável', 'marca', '#', 'application/pdf', '1.1 MB', 4);
    iDl.run('Plano de Compensação', 'PDF detalhado com o plano de compensação completo', 'documentos', '#', 'application/pdf', '850 KB', 5);
    }

    // Contracts seeds
    const ctCount = d.prepare('SELECT COUNT(*) as c FROM contracts').get().c;
    if (ctCount === 0) {
    const iCt = d.prepare('INSERT INTO contracts (title, description, content, version, required, active) VALUES (?,?,?,?,?,?)');
    iCt.run('Ficha Associativa - Contrato de Prestação de Serviços', 'Contrato de prestação de serviços de consultoria e assessoria jurídica para limpeza de nome', `
<div style="text-align:center;border-bottom:2px solid #1a1a2e;padding-bottom:20px;margin-bottom:28px">
<h2 style="margin:0;font-size:1.4rem;letter-spacing:1px;color:#1a1a2e">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h2>
<p style="margin:6px 0 0;font-size:.85rem;color:#64748b">Ficha Associativa — Consultoria e Assessoria Jurídica</p>
<p style="margin:4px 0 0;font-size:.8rem;color:#94a3b8">Versão 1.0 — Vigência a partir do aceite eletrônico</p>
</div>

<h3 style="color:#1a1a2e;border-left:3px solid #f59e0b;padding-left:12px;margin-top:24px">DAS PARTES</h3>
<p><strong>CONTRATADA:</strong> Credbusiness, pessoa jurídica de direito privado, doravante denominada <strong>"CONTRATADA"</strong>.</p>
<p><strong>CONTRATANTE:</strong> Pessoa física ou jurídica devidamente cadastrada na Plataforma, identificada pelos dados fornecidos no ato do registro e aceite eletrônico, doravante denominada <strong>"CONTRATANTE"</strong>.</p>
<p>Decidem as partes, na melhor forma de direito, celebrar o presente <strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</strong>, que reger-se-á mediante às cláusulas e condições adiante estipuladas.</p>

<h3 style="color:#1a1a2e;border-left:3px solid #f59e0b;padding-left:12px;margin-top:24px">CLÁUSULA PRIMEIRA — DO OBJETO</h3>
<p>O presente contrato tem como objeto a prestação de serviços de consultoria e assessoria jurídica em favor da CONTRATANTE pela CONTRATADA, sendo esta última a responsável pela retirada das restrições que constam perante os órgãos de proteção ao crédito, restauração de score e acompanhamento de processo administrativo ou judicial em face dos órgãos de controle de crédito.</p>

<h3 style="color:#1a1a2e;border-left:3px solid #f59e0b;padding-left:12px;margin-top:24px">CLÁUSULA SEGUNDA — DAS OBRIGAÇÕES DA CONTRATADA</h3>
<p><strong>2.1.</strong> A CONTRATADA compromete-se a prestar os serviços solicitados pela CONTRATANTE conforme descrito na Cláusula Primeira — Do Objeto.</p>
<p><strong>2.2.</strong> O prazo para efetiva execução do serviço do objeto deste contrato é de 30 (trinta) a 60 (sessenta) dias úteis, a contar do pagamento e da entrega da documentação necessária para a propositura da ação.</p>
<p><strong>2.3.</strong> Até o final do prazo, a CONTRATADA deverá entregar o NADA CONSTA dos birôs de consulta dos órgãos de proteção ao crédito à CONTRATANTE.</p>
<p><strong>2.4.</strong> Na prestação de serviços, a CONTRATADA deverá manter sigilo total de todas as informações fornecidas pela CONTRATANTE, utilizando-se delas unicamente para fins de cumprimento do objeto do presente contrato.</p>
<p><strong>2.5.</strong> Não há garantia de crédito, mas a CONTRATADA compromete-se a diligenciar para que aumentem as chances do êxito.</p>
<p><strong>2.6.</strong> A CONTRATADA não garante a extensão dos efeitos da execução do serviço objeto do presente contrato às eventuais novas dívidas que a CONTRATANTE venha a incorrer, apenas as existentes no ato da contratação do serviço.</p>
<p><strong>2.7.</strong> A CONTRATADA não garante pontuação mínima ou máxima na retomada do score.</p>
<p><strong>2.8.</strong> Vale ressaltar que dentro da ação não serão feitas negociações, quitações, compras ou parcelamentos das dívidas. O serviço é baseado nos art. 42 e 43 do Código de Defesa do Consumidor (Lei n. 8.078/90).</p>
<p><strong>2.9.</strong> Salienta-se que a dívida ainda aparecerá internamente dentro da instituição credora e de visualização interna (cliente) no aplicativo do Serasa e/ou outros.</p>

<h3 style="color:#1a1a2e;border-left:3px solid #f59e0b;padding-left:12px;margin-top:24px">CLÁUSULA TERCEIRA — DAS OBRIGAÇÕES DA CONTRATANTE</h3>
<p><strong>3.1.</strong> A CONTRATANTE se obriga a cumprir fielmente o pagamento dos honorários aqui acordados, sob pena de, em caso de mora, extinguir-se a relação contratual e ser levado o presente contrato à execução judicial.</p>
<p><strong>3.2.</strong> A CONTRATANTE desde já se declara ciente de que a ação em questão obedece a procedimento previsto no Código de Processo Civil, Código Civil e Código de Defesa do Consumidor, não possuindo a CONTRATADA, poder para abreviar a prestação jurisdicional.</p>
<p><strong>3.3.</strong> A CONTRATANTE fornecerá à CONTRATADA os documentos e meios necessários à comprovação processual do seu pretendido direito, sob pena de exclusão da responsabilidade causídica, inclusive dentro dos prazos legais.</p>

<h3 style="color:#1a1a2e;border-left:3px solid #f59e0b;padding-left:12px;margin-top:24px">CLÁUSULA QUARTA — DO PAGAMENTO</h3>
<p><strong>4.1.</strong> Pelo serviço objeto do presente contrato, a CONTRATANTE deverá pagar à CONTRATADA o valor conforme o plano contratado na Plataforma, de forma irrevogável e irretratável.</p>
<p><strong>4.2.</strong> O pagamento é devido pela CONTRATANTE em favor da CONTRATADA por ação protocolada, ou seja, cada ação gera uma obrigação de pagamento nos valores constantes na Plataforma.</p>
<p><strong>4.3.</strong> O não cumprimento do pagamento fará a ação ser revogada, sem direito à devolução de qualquer quantia paga, incorrendo em multa contratual de 2% (dois por cento) sobre os valores devidos, atualização monetária pelo INPC e juros monetário de 1% ao mês.</p>

<h3 style="color:#1a1a2e;border-left:3px solid #f59e0b;padding-left:12px;margin-top:24px">CLÁUSULA QUINTA — DA RESCISÃO CONTRATUAL</h3>
<p><strong>5.1.</strong> Em caso de desistência da ação por parte da CONTRATANTE, se a ação já estiver em andamento, não haverá devolução de qualquer quantia paga.</p>
<p><strong>5.2.</strong> A parte que descumprir qualquer das cláusulas deste contrato dará à outra o direito de rescindir o presente instrumento, cientificando-a com aviso prévio de 15 (quinze) dias, ficando desobrigada a parte inocente a dar continuidade a este contrato.</p>

<h3 style="color:#1a1a2e;border-left:3px solid #f59e0b;padding-left:12px;margin-top:24px">CLÁUSULA SEXTA — DISPOSIÇÕES GERAIS</h3>
<p><strong>6.1.</strong> A retomada de relacionamento com o mercado financeiro é de 45 (quarenta e cinco) dias após a entrega do NADA CONSTA, ressaltando que não há a garantia de crédito conforme a cláusula segunda (2.5).</p>
<p><strong>6.2.</strong> A CONTRATANTE se responsabiliza por toda ou quaisquer tentativas frustradas de retomada no mercado antes do prazo de 45 (quarenta e cinco) dias, ciente de que esse ato poderá prejudicar a pontuação do Score.</p>
<p><strong>6.3.</strong> O principal PROPÓSITO da CONTRATADA ao prestar esse serviço é a reestruturação da vida financeira da CONTRATANTE, para que esta tenha novos hábitos financeiros a fim de sair da inadimplência e se tornar uma boa consumidora. Sendo assim, a CONTRATANTE se compromete a ter uma boa conduta perante o mercado financeiro.</p>
<p><strong>6.4.</strong> O presente contrato é um título executivo extrajudicial conforme previsão legal e, em caso de inadimplemento da CONTRATANTE, permite a propositura de ação de execução autônoma para o recebimento dos honorários devidos e não pagos.</p>
<p><strong>6.5.</strong> Fica pactuada a total inexistência de vínculo trabalhista entre as partes, excluindo as obrigações previdenciárias e os encargos sociais, não havendo entre as partes qualquer tipo de relação de subordinação.</p>
<p><strong>6.6.</strong> Este contrato, cumpridas todas as formalidades legais, afasta a qualidade de empregado prevista no art. 3º da CLT, nos termos do art. 442-B da CLT.</p>
<p><strong>6.7.</strong> A tolerância, por qualquer das partes, com relação ao descumprimento de qualquer termo ou condição aqui ajustado, não será considerada como desistência em exigir o cumprimento de disposição nele contida, nem representará novação com relação à obrigação passada, presente ou futura.</p>
<p><strong>6.8.</strong> Fica eleito o foro do município de Ribeirão Preto, Estado de São Paulo, com exclusão de qualquer outro, por mais privilegiado que seja, para dirimir eventuais conflitos oriundos do presente contrato.</p>

<p style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:.82rem">Documento eletrônico com validade jurídica — Credbusiness © ${new Date().getFullYear()}</p>
`, '1.0', 1, 1);
    }

}

module.exports = { getDB, initDatabase };
