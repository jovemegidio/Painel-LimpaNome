/* ═══════════════════════════════════════════
   Credbusiness — Deploy Script para VPS KingHost
   Conecta via SSH, configura e faz deploy
   ═══════════════════════════════════════════ */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ── Configuração VPS (credenciais via .env) ──
const VPS = {
    host: process.env.VPS_HOST || '177.153.58.152',
    port: Number(process.env.VPS_PORT) || 22,
    username: process.env.VPS_USER || 'root',
    password: process.env.VPS_PASSWORD,
    readyTimeout: 30000
};
if (!VPS.password) { console.error('❌ VPS_PASSWORD não definida no .env'); process.exit(1); }

const APP_DIR = '/var/www/credbusiness';
const LOCAL_DIR = path.join(__dirname, '..');

// Arquivos para enviar (sem node_modules, .git, .db)
const filesToUpload = [];

function collectFiles(dir, base = '') {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = base ? `${base}/${item}` : item;
        const stat = fs.statSync(fullPath);

        // Skip
        if (['node_modules', '.git', 'deploy', 'server.old.js', 'js/data.old.js', '.env'].some(s => relativePath.startsWith(s))) continue;
        if (item.endsWith('.db') || item.endsWith('.old.js')) continue;

        if (stat.isDirectory()) {
            collectFiles(fullPath, relativePath);
        } else {
            filesToUpload.push({ local: fullPath, remote: `${APP_DIR}/${relativePath}` });
        }
    }
}

function exec(conn, cmd) {
    return new Promise((resolve, reject) => {
        console.log(`  $ ${cmd}`);
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let output = '';
            stream.on('data', (data) => {
                output += data.toString();
                process.stdout.write(data);
            });
            stream.stderr.on('data', (data) => {
                output += data.toString();
                process.stderr.write(data);
            });
            stream.on('close', (code) => {
                resolve({ code, output });
            });
        });
    });
}

function uploadFile(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function mkdirRecursive(sftp, dirPath) {
    return new Promise((resolve) => {
        sftp.mkdir(dirPath, (err) => {
            resolve(); // Ignore errors (dir may exist)
        });
    });
}

async function deploy() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  Credbusiness — Deploy para VPS KingHost          ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');

    const conn = new Client();

    conn.on('ready', async () => {
        try {
            // ═══ ETAPA 1: Configurar servidor ═══
            console.log('📦 ETAPA 1: Configurando servidor...\n');

            await exec(conn, 'apt update -y && apt upgrade -y');
            console.log('');

            // Node.js
            console.log('📦 Instalando Node.js 20...');
            await exec(conn, 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -');
            await exec(conn, 'apt install -y nodejs');
            const nodeV = await exec(conn, 'node -v');
            console.log(`  Node.js: ${nodeV.output.trim()}`);

            // Build tools
            console.log('📦 Instalando build tools...');
            await exec(conn, 'apt install -y build-essential python3');

            // PM2
            console.log('📦 Instalando PM2...');
            await exec(conn, 'npm install -g pm2');

            // Nginx
            console.log('📦 Instalando Nginx...');
            await exec(conn, 'apt install -y nginx');

            // ═══ ETAPA 2: Criar diretórios ═══
            console.log('\n📁 ETAPA 2: Criando diretórios...');
            await exec(conn, `mkdir -p ${APP_DIR}/{database,logs,css/Fundo,js,pages,admin,middleware,routes,deploy}`);

            // ═══ ETAPA 3: Upload arquivos ═══
            console.log('\n📤 ETAPA 3: Enviando arquivos...\n');

            collectFiles(LOCAL_DIR);
            console.log(`  ${filesToUpload.length} arquivos para enviar\n`);

            const sftp = await new Promise((resolve, reject) => {
                conn.sftp((err, sftp) => {
                    if (err) reject(err);
                    else resolve(sftp);
                });
            });

            // Create directories first
            const dirs = new Set();
            filesToUpload.forEach(f => {
                const dir = path.dirname(f.remote).replace(/\\/g, '/');
                dirs.add(dir);
            });
            for (const dir of dirs) {
                await mkdirRecursive(sftp, dir);
            }

            // Upload files
            let uploaded = 0;
            for (const file of filesToUpload) {
                try {
                    const remoteDir = path.dirname(file.remote).replace(/\\/g, '/');
                    await mkdirRecursive(sftp, remoteDir);
                    await uploadFile(sftp, file.local, file.remote);
                    uploaded++;
                    process.stdout.write(`\r  Enviando: ${uploaded}/${filesToUpload.length}`);
                } catch (e) {
                    console.error(`\n  ❌ Erro enviando ${file.local}: ${e.message}`);
                }
            }
            console.log(`\n  ✅ ${uploaded} arquivos enviados\n`);

            // ═══ ETAPA 4: Criar .env na VPS ═══
            console.log('⚙️  ETAPA 4: Configurando .env...');
            // Preservar JWT_SECRET existente para não invalidar tokens dos usuários
            let existingJwtSecret = '';
            try {
                const existingEnv = await new Promise((resolve, reject) => {
                    sftp.readFile(`${APP_DIR}/.env`, 'utf8', (err, data) => {
                        if (err) resolve(''); else resolve(data);
                    });
                });
                const match = existingEnv.match(/^JWT_SECRET=(.+)$/m);
                if (match && match[1]) existingJwtSecret = match[1];
            } catch {}
            const jwtSecret = existingJwtSecret || `credbusiness_jwt_PROD_${require('crypto').randomBytes(32).toString('hex')}`;

            // Preservar variáveis Asaas existentes para não perder a chave em redeploys
            let existingAsaasKey = '', existingAsaasEnv = '', existingAsaasWebhook = '';
            try {
                const existingEnvFull = await new Promise((resolve, reject) => {
                    sftp.readFile(`${APP_DIR}/.env`, 'utf8', (err, data) => {
                        if (err) resolve(''); else resolve(data);
                    });
                });
                const matchKey = existingEnvFull.match(/^ASAAS_API_KEY=(.+)$/m);
                const matchEnv = existingEnvFull.match(/^ASAAS_ENV=(.+)$/m);
                const matchWebhook = existingEnvFull.match(/^ASAAS_WEBHOOK_TOKEN=(.+)$/m);
                if (matchKey && matchKey[1]) existingAsaasKey = matchKey[1];
                if (matchEnv && matchEnv[1]) existingAsaasEnv = matchEnv[1];
                if (matchWebhook && matchWebhook[1]) existingAsaasWebhook = matchWebhook[1];
            } catch {}

            const envContent = `PORT=3001
NODE_ENV=production
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=7d
DB_PATH=./database/credbusiness.db
DOMAIN=mkt-credbusiness.vps-kinghost.net
ASAAS_API_KEY=${existingAsaasKey}
ASAAS_ENV=${existingAsaasEnv || 'production'}
ASAAS_WEBHOOK_TOKEN=${existingAsaasWebhook}
API_CPF_URL=
API_CPF_KEY=
API_BACEN_URL=
API_BACEN_KEY=
`;
            await new Promise((resolve, reject) => {
                sftp.writeFile(`${APP_DIR}/.env`, envContent, (err) => {
                    if (err) reject(err); else resolve();
                });
            });
            console.log('  ✅ .env criado\n');

            // ═══ ETAPA 5: Instalar dependências ═══
            console.log('📦 ETAPA 5: Instalando dependências (npm install)...');
            await exec(conn, `cd ${APP_DIR} && npm install --production`);
            console.log('  ✅ Dependências instaladas\n');

            // ═══ ETAPA 6: Configurar Nginx ═══
            console.log('⚙️  ETAPA 6: Configurando Nginx...');
            const nginxConf = `server {
    listen 80;
    server_name mkt-credbusiness.vps-kinghost.net;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }

    location ~* \\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    client_max_body_size 10M;
}`;
            await new Promise((resolve, reject) => {
                sftp.writeFile('/etc/nginx/sites-available/credbusiness', nginxConf, (err) => {
                    if (err) reject(err); else resolve();
                });
            });

            await exec(conn, 'ln -sf /etc/nginx/sites-available/credbusiness /etc/nginx/sites-enabled/');
            await exec(conn, 'rm -f /etc/nginx/sites-enabled/default');
            await exec(conn, 'nginx -t && systemctl restart nginx && systemctl enable nginx');
            console.log('  ✅ Nginx configurado\n');

            // ═══ ETAPA 7: Configurar Firewall ═══
            console.log('🔒 ETAPA 7: Configurando firewall...');
            await exec(conn, 'ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable');
            console.log('  ✅ Firewall configurado\n');

            // ═══ ETAPA 8: Iniciar app com PM2 ═══
            console.log('🚀 ETAPA 8: Iniciando aplicação com PM2...');
            await exec(conn, `cd ${APP_DIR} && pm2 delete credbusiness 2>/dev/null; pm2 start ecosystem.config.js`);
            await exec(conn, 'pm2 save');
            await exec(conn, 'pm2 startup systemd -u root --hp /root 2>/dev/null || true');
            console.log('  ✅ Aplicação iniciada\n');

            // ═══ ETAPA 9: Verificar ═══
            console.log('🔍 ETAPA 9: Verificando...');
            await new Promise(r => setTimeout(r, 3000));
            const check = await exec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/content/settings');
            console.log(`  Status HTTP: ${check.output.trim()}`);

            const pm2Status = await exec(conn, 'pm2 status');

            sftp.end();

            console.log('\n╔══════════════════════════════════════════════════════════╗');
            console.log('║  ✅ DEPLOY COMPLETO!                                      ║');
            console.log('║                                                            ║');
            console.log('║  🌐 http://mkt-credbusiness.vps-kinghost.net               ║');
            console.log('║                                                            ║');
            console.log('║  Login: credbusiness / Service                              ║');
            console.log('║  Admin: admin / admin123                                    ║');
            console.log('╚══════════════════════════════════════════════════════════╝');

            conn.end();
            process.exit(0);

        } catch (error) {
            console.error('\n❌ Erro durante deploy:', error.message);
            conn.end();
            process.exit(1);
        }
    });

    conn.on('error', (err) => {
        console.error('❌ Erro de conexão SSH:', err.message);
        if (err.message.includes('authentication')) {
            console.error('   Verifique a senha da VPS');
        }
        process.exit(1);
    });

    console.log(`🔗 Conectando a ${VPS.host}...`);
    conn.connect(VPS);
}

deploy();
