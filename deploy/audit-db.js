const { Client } = require('ssh2');
const fs = require('fs');

// Script Node.js que roda no VPS
const remoteScript = `
const { getDB, initDatabase } = require('./database/init');
initDatabase();
const db = getDB();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('TABELAS ENCONTRADAS: ' + tables.length);
console.log('');
tables.forEach(t => {
  const cols = db.prepare('PRAGMA table_info(' + JSON.stringify(t.name) + ')').all();
  const count = db.prepare('SELECT COUNT(*) as c FROM ' + JSON.stringify(t.name)).get().c;
  console.log('TABLE: ' + t.name + ' | ROWS: ' + count);
  cols.forEach(col => {
    console.log('  COL: ' + col.name + ' | ' + col.type + (col.pk ? ' | PK' : '') + (col.notnull ? ' | NOT NULL' : '') + (col.dflt_value !== null ? ' | DEFAULT=' + col.dflt_value : ''));
  });
  console.log('');
});

// Verificar índices
const indexes = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all();
console.log('INDICES: ' + indexes.length);
indexes.forEach(ix => console.log('  IDX: ' + ix.name + ' ON ' + ix.tbl_name));

// Verificar dados de seed
console.log('');
console.log('=== DADOS SEED ===');
const users = db.prepare('SELECT id, username, name, level, plan, active FROM users').all();
console.log('USERS: ' + JSON.stringify(users));

const admins = db.prepare('SELECT id, username, name, role FROM admins').all();
console.log('ADMINS: ' + JSON.stringify(admins));

const levels = db.prepare('SELECT * FROM levels').all();
console.log('LEVELS: ' + levels.length + ' -> ' + levels.map(l => l.name).join(', '));

const plans = db.prepare('SELECT * FROM plans').all();
console.log('PLANS: ' + plans.length + ' -> ' + plans.map(p => p.name).join(', '));

const packages = db.prepare('SELECT * FROM packages').all();
console.log('PACKAGES: ' + packages.length + ' -> ' + packages.map(p => p.name).join(', '));

const news = db.prepare('SELECT id, title FROM news').all();
console.log('NEWS: ' + news.length);

const events = db.prepare('SELECT id, title FROM events').all();
console.log('EVENTS: ' + events.length);

const settings = db.prepare('SELECT key, value FROM settings').all();
console.log('SETTINGS: ' + settings.length + ' keys');

const processes = db.prepare('SELECT id, cpf, status, type FROM processes').all();
console.log('PROCESSES: ' + processes.length);

const transactions = db.prepare('SELECT id, type, amount, status FROM transactions').all();
console.log('TRANSACTIONS: ' + transactions.length);
`;

// Salvar script temporariamente, enviar via SFTP, executar, deletar
const c = new Client();
c.on('ready', () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream('/tmp/audit_db.js');
    ws.on('close', () => {
      c.exec('cp /tmp/audit_db.js /var/www/credbusiness/audit_db.js && cd /var/www/credbusiness && node audit_db.js && rm audit_db.js /tmp/audit_db.js', (err, stream) => {
        let out = '';
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => out += '[ERR] ' + d);
        stream.on('close', () => { console.log(out); c.end(); });
      });
    });
    ws.end(remoteScript);
  });
}).connect({ host: '177.153.58.152', port: 22, username: 'root', password: 'Credbusiness2504A@' });
