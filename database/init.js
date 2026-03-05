/* ═══════════════════════════════════════════
   Credbusiness — Database Initialization (SQLite)
   ═══════════════════════════════════════════ */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

let db;

function getDB() {
    if (!db) {
        const dbPath = process.env.DB_PATH || path.join(__dirname, 'mi2.db');
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
            level TEXT DEFAULT 'prata',
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
        'CREATE INDEX IF NOT EXISTS idx_university_progress_user ON university_progress(user_id)'
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
    addCol('users', 'email_verified', 'INTEGER DEFAULT 0');
    addCol('users', 'email_verified_at', 'TEXT');

    // Seed if empty
    const count = d.prepare('SELECT COUNT(*) as c FROM users').get();
    if (count.c === 0) {
        seedData(d);
        console.log('✅ Banco de dados populado com dados iniciais');
    }

    console.log('✅ Banco de dados inicializado');
    return d;
}

function seedData(d) {
    const h = (pw) => bcrypt.hashSync(pw, 10);

    // Admin (senha forte — trocar em produção via painel)
    d.prepare('INSERT INTO admins (username, password, name, role) VALUES (?,?,?,?)')
        .run('admin', h('Cr3dBus!n3ss@2026#Adm'), 'Administrador', 'superadmin');

    // Levels
    const iL = d.prepare('INSERT INTO levels (key,name,min_points,color,icon,bonus_percent,commission_percent) VALUES (?,?,?,?,?,?,?)');
    iL.run('prata', 'Prata', 0, '#9e9e9e', '🥈', 5, 5);
    iL.run('ouro', 'Ouro', 1000, '#ffc107', '🥇', 10, 8);
    iL.run('diamante', 'Diamante', 2000, '#00bcd4', '💎', 15, 12);

    // Plans
    const iP = d.prepare('INSERT INTO plans (id,name,price,features) VALUES (?,?,?,?)');
    iP.run('basico', 'Básico', 49.90, JSON.stringify(['Limpa Nome básico', '1 consulta/mês', 'Suporte email']));
    iP.run('plus', 'Plus', 99.90, JSON.stringify(['Limpa Nome completo', '5 consultas/mês', 'Suporte prioritário', 'Relatórios']));
    iP.run('premium', 'Premium', 199.90, JSON.stringify(['Limpa Nome VIP', 'Consultas ilimitadas', 'Suporte 24h', 'Relatórios avançados', 'Bacen completo']));

    // Packages
    const iPk = d.prepare('INSERT INTO packages (name,price,points,description) VALUES (?,?,?,?)');
    iPk.run('Pacote Starter', 149.90, 100, 'Ideal para começar');
    iPk.run('Pacote Business', 349.90, 300, 'Para crescimento acelerado');
    iPk.run('Pacote Enterprise', 699.90, 700, 'Máximo desempenho');
    iPk.run('Pacote Diamond', 1499.90, 1500, 'Exclusivo para líderes');

    // Users
    const iU = d.prepare('INSERT INTO users (username,password,name,email,phone,cpf,level,points,bonus,balance,sponsor_id,plan,active,role,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    iU.run('credbusiness', h('Service'), 'CredBusiness', 'cred@business.com', '(11) 99999-0001', '123.456.789-00', 'diamante', 2450, 2080, 120, null, 'premium', 1, 'user', '2025-06-15');
    iU.run('maria.silva', h('123456'), 'Maria Silva', 'maria@email.com', '(11) 98888-0002', '234.567.890-01', 'ouro', 1200, 980, 50, 1, 'basico', 1, 'user', '2025-08-20');
    iU.run('joao.santos', h('123456'), 'João Santos', 'joao@email.com', '(21) 97777-0003', '345.678.901-02', 'prata', 600, 420, 30, 1, 'basico', 1, 'user', '2025-09-10');
    iU.run('ana.oliveira', h('123456'), 'Ana Oliveira', 'ana@email.com', '(31) 96666-0004', '456.789.012-03', 'prata', 450, 300, 20, 1, 'basico', 1, 'user', '2025-10-05');
    iU.run('pedro.lima', h('123456'), 'Pedro Lima', 'pedro@email.com', '(41) 95555-0005', '567.890.123-04', 'prata', 300, 200, 15, 1, 'basico', 1, 'user', '2025-11-12');
    iU.run('carla.souza', h('123456'), 'Carla Souza', 'carla@email.com', '(51) 94444-0006', '678.901.234-05', 'prata', 200, 150, 10, 1, 'basico', 0, 'user', '2025-12-01');
    iU.run('lucas.ferr', h('123456'), 'Lucas Ferreira', 'lucas@email.com', '(61) 93333-0007', '789.012.345-06', 'prata', 150, 100, 5, 1, 'basico', 1, 'user', '2026-01-15');
    iU.run('julia.costa', h('123456'), 'Julia Costa', 'julia@email.com', '(71) 92222-0008', '890.123.456-07', 'prata', 100, 80, 0, 1, 'basico', 1, 'user', '2026-02-01');
    iU.run('rafael.mend', h('123456'), 'Rafael Mendes', 'rafael@email.com', '(81) 91111-0009', '901.234.567-08', 'prata', 80, 50, 0, 2, 'basico', 1, 'user', '2026-01-20');
    iU.run('fernanda.r', h('123456'), 'Fernanda Rocha', 'fernanda@email.com', '(91) 90000-0010', '012.345.678-09', 'prata', 60, 30, 0, 2, 'basico', 1, 'user', '2026-02-10');
    iU.run('gabriel.alm', h('123456'), 'Gabriel Almeida', 'gabriel@email.com', '(11) 99900-0011', '111.222.333-44', 'prata', 40, 20, 0, 3, 'basico', 1, 'user', '2026-02-15');
    iU.run('camila.dias', h('123456'), 'Camila Dias', 'camila@email.com', '(21) 98800-0012', '222.333.444-55', 'prata', 30, 10, 0, 5, 'basico', 1, 'user', '2026-02-20');

    // Processes
    const iPr = d.prepare('INSERT INTO processes (user_id,cpf,name,status,type,value,institution,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
    iPr.run(1, '123.456.789-00', 'CredBusiness', 'concluido', 'negativacao', 5200, 'Serasa', '2025-12-10', '2026-01-15');
    iPr.run(2, '234.567.890-01', 'Maria Silva', 'em_andamento', 'negativacao', 3400, 'SPC', '2026-01-20', '2026-02-28');
    iPr.run(3, '345.678.901-02', 'João Santos', 'pendente', 'divida', 8900, 'Boa Vista', '2026-02-15', '2026-02-15');
    iPr.run(1, '123.456.789-00', 'CredBusiness', 'em_andamento', 'divida', 12000, 'Serasa', '2026-02-01', '2026-03-01');

    // Transactions
    const iT = d.prepare('INSERT INTO transactions (user_id,type,amount,description,date,status) VALUES (?,?,?,?,?,?)');
    iT.run(1, 'bonus', 80, 'Bônus indicação - Maria Silva', '2026-03-04', 'creditado');
    iT.run(1, 'bonus', 60, 'Bônus indicação - João Santos', '2026-03-03', 'creditado');
    iT.run(1, 'comissao', 120, 'Comissão rede - Nível 2', '2026-03-02', 'creditado');
    iT.run(1, 'saque', -200, 'Saque via PIX', '2026-02-28', 'concluido');
    iT.run(1, 'bonus', 150, 'Bônus pacote - Pedro Lima', '2026-02-25', 'creditado');
    iT.run(2, 'bonus', 50, 'Bônus indicação - Rafael Mendes', '2026-03-01', 'creditado');

    // News
    const iN = d.prepare('INSERT INTO news (title,content,date,category) VALUES (?,?,?,?)');
    iN.run('Nova funcionalidade Limpa Nome Pro', 'Agora você pode acompanhar seus processos em tempo real com notificações automáticas.', '2026-03-04', 'novidade');
    iN.run('Evento Online - Março 2026', 'Participe do nosso webinar exclusivo sobre estratégias de crescimento de rede. Data: 15/03/2026 às 20h.', '2026-03-02', 'evento');
    iN.run('Atualização do sistema de pontos', 'O sistema de pontuação foi atualizado. Agora cada indicação ativa gera mais pontos para sua graduação.', '2026-02-28', 'sistema');
    iN.run('Promoção Pacote Diamond', 'Adquira o Pacote Diamond com 20% de desconto até o final de março!', '2026-02-25', 'promocao');

    // Events
    const iE = d.prepare('INSERT INTO events (title,date,time,type,location,description,status) VALUES (?,?,?,?,?,?,?)');
    iE.run('Webinar: Crescimento de Rede', '2026-03-15', '20:00', 'online', 'Zoom', 'Estratégias avançadas para crescer sua rede de indicações.', 'proximo');
    iE.run('Encontro Regional SP', '2026-03-22', '14:00', 'presencial', 'São Paulo - SP', 'Encontro presencial para networking e treinamento.', 'proximo');
    iE.run('Live: Novidades Credbusiness', '2026-02-20', '19:00', 'online', 'YouTube', 'Apresentação das novidades da plataforma.', 'passado');

    // Tickets
    const iTk = d.prepare('INSERT INTO tickets (user_id,subject,message,status,priority,created_at) VALUES (?,?,?,?,?,?)');
    iTk.run(1, 'Dúvida sobre comissões', 'Gostaria de entender melhor como funcionam as comissões de rede.', 'respondido', 'media', '2026-03-01');
    iTk.run(2, 'Problema no processo Limpa Nome', 'Meu processo está parado há mais de 15 dias.', 'aberto', 'alta', '2026-03-03');

    // Ticket responses
    d.prepare('INSERT INTO ticket_responses (ticket_id,from_type,message,date) VALUES (?,?,?,?)')
        .run(1, 'admin', 'As comissões são calculadas com base no nível e volume da sua rede.', '2026-03-02');

    // Notifications
    const iNotif = d.prepare('INSERT INTO notifications (user_id, type, title, message, link, read, created_at) VALUES (?,?,?,?,?,?,?)');
    iNotif.run(1, 'success', 'Bem-vindo!', 'Sua conta foi criada com sucesso. Explore o painel!', '/pages/dashboard.html', 0, '2026-03-04');
    iNotif.run(1, 'info', 'Novo informativo', 'Confira as novidades da plataforma.', '/pages/informativos.html', 0, '2026-03-03');
    iNotif.run(1, 'warning', 'Processo atualizado', 'Seu processo #1 foi concluído.', '/pages/limpa-nome-processos.html', 1, '2026-02-28');
    iNotif.run(2, 'info', 'Bem-vindo!', 'Sua conta foi criada com sucesso.', '/pages/dashboard.html', 0, '2026-03-01');
    iNotif.run(2, 'alert', 'Ticket respondido', 'O suporte respondeu ao seu ticket #2.', '/pages/suporte-tickets.html', 0, '2026-03-04');

    // University Courses
    const iCourse = d.prepare('INSERT INTO university_courses (title, description, category, video_url, duration, sort_order) VALUES (?,?,?,?,?,?)');
    iCourse.run('Primeiros Passos na Plataforma', 'Aprenda a navegar pelo painel e configurar sua conta.', 'primeiros-passos', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '15:00', 1);
    iCourse.run('Como Funciona o Limpa Nome', 'Entenda o processo de limpeza de nome e como acompanhar.', 'servicos', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '20:00', 2);
    iCourse.run('Construindo sua Rede de Indicações', 'Estratégias para crescer sua rede MLM de forma sustentável.', 'vendas', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '25:00', 3);
    iCourse.run('Consultas CPF e Bacen', 'Como realizar consultas e interpretar os resultados.', 'servicos', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '12:00', 4);
    iCourse.run('Entendendo Comissões e Bônus', 'Saiba como são calculadas as comissões e bônus da sua rede.', 'financeiro', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '18:00', 5);
    iCourse.run('Técnicas de Vendas Online', 'Melhore suas conversões com estratégias comprovadas.', 'vendas', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '22:00', 6);
    iCourse.run('Usando o Suporte e FAQ', 'Saiba como abrir tickets e encontrar respostas rápidas.', 'primeiros-passos', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '10:00', 7);
    iCourse.run('Saques e Gestão Financeira', 'Aprenda a solicitar saques e gerenciar seu saldo.', 'financeiro', 'https://www.youtube.com/embed/dQw4w9WgXcQ', '14:00', 8);

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
    iS.run('commissionLevel1', '10');
    iS.run('commissionLevel2', '5');
    iS.run('commissionLevel3', '3');
    iS.run('minWithdraw', '50');
    iS.run('maintenanceMode', 'false');
}

module.exports = { getDB, initDatabase };
