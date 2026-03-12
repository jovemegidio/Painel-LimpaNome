const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const VPS = {
    host: process.env.VPS_HOST || '177.153.58.152',
    port: Number(process.env.VPS_PORT) || 22,
    username: process.env.VPS_USER || 'root',
    password: process.env.VPS_PASSWORD
};
if (!VPS.password) { console.error('❌ VPS_PASSWORD não definida no .env'); process.exit(1); }

const NGINX_CONFIG = `server {
    listen 80;
    server_name mkt-credbusiness.vps-kinghost.net credbusinessconsultoria.com.br www.credbusinessconsultoria.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name mkt-credbusiness.vps-kinghost.net credbusinessconsultoria.com.br www.credbusinessconsultoria.com.br;

    ssl_certificate /etc/letsencrypt/live/mkt-credbusiness.vps-kinghost.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mkt-credbusiness.vps-kinghost.net/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
        proxy_cache_bypass \\$http_upgrade;
        proxy_read_timeout 90;
    }

    location ~* \\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \\$host;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    client_max_body_size 10M;
}
`;

function exec(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let out = '';
            stream.on('data', d => out += d.toString());
            stream.stderr.on('data', d => out += d.toString());
            stream.on('close', () => resolve(out.trim()));
        });
    });
}

async function main() {
    const conn = new Client();
    
    await new Promise((resolve, reject) => {
        conn.on('ready', resolve);
        conn.on('error', reject);
        conn.connect(VPS);
    });
    
    console.log('Connected to VPS');

    // Backup current config
    console.log('\n=== Backing up current config ===');
    await exec(conn, 'cp /etc/nginx/sites-available/credbusiness /etc/nginx/sites-available/credbusiness.bak');
    console.log('Backup created');

    // Write new config
    console.log('\n=== Writing new Nginx config ===');
    const escaped = NGINX_CONFIG.replace(/'/g, "'\\''");
    await exec(conn, `echo '${escaped}' > /etc/nginx/sites-available/credbusiness`);
    console.log('Config written');

    // Test config
    console.log('\n=== Testing Nginx config ===');
    const test = await exec(conn, 'nginx -t 2>&1');
    console.log(test);

    if (test.includes('successful')) {
        // Reload
        console.log('\n=== Reloading Nginx ===');
        const reload = await exec(conn, 'systemctl reload nginx 2>&1');
        console.log(reload || 'Nginx reloaded successfully');

        // Verify ports
        console.log('\n=== Verifying ports ===');
        const ports = await exec(conn, 'ss -tlnp | grep -E ":80|:443"');
        console.log(ports);

        // Test HTTPS
        console.log('\n=== Testing HTTPS ===');
        const https = await exec(conn, 'curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1/ -H "Host: mkt-credbusiness.vps-kinghost.net"');
        console.log('HTTPS status:', https);
    } else {
        console.log('\n!!! Config test FAILED - restoring backup !!!');
        await exec(conn, 'cp /etc/nginx/sites-available/credbusiness.bak /etc/nginx/sites-available/credbusiness');
        console.log('Backup restored');
    }

    conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
