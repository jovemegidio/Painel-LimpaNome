#!/bin/bash
# ═══════════════════════════════════════════
# MI2 — Script de Setup da VPS (Ubuntu 24.04)
# Executar como root na VPS
# ═══════════════════════════════════════════

set -e

echo "╔══════════════════════════════════════════╗"
echo "║  MI2 — Configurando VPS Ubuntu 24.04     ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. Atualizar sistema ──
echo "📦 Atualizando sistema..."
apt update && apt upgrade -y

# ── 2. Instalar Node.js 20 LTS ──
echo "📦 Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"

# ── 3. Instalar ferramentas de build (para better-sqlite3) ──
echo "📦 Instalando build tools..."
apt install -y build-essential python3

# ── 4. Instalar PM2 ──
echo "📦 Instalando PM2..."
npm install -g pm2

# ── 5. Instalar Nginx ──
echo "📦 Instalando Nginx..."
apt install -y nginx

# ── 6. Criar diretório do app ──
echo "📁 Criando diretório do app..."
mkdir -p /var/www/mi2
mkdir -p /var/www/mi2/database

# ── 7. Configurar Nginx ──
echo "⚙️  Configurando Nginx..."
cat > /etc/nginx/sites-available/mi2 << 'NGINX_CONF'
server {
    listen 80;
    server_name mkt-credbusiness.vps-kinghost.net;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # Proxy para Node.js
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

    # Cache para assets estáticos
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Limitar tamanho de upload
    client_max_body_size 10M;
}
NGINX_CONF

# Ativar site
ln -sf /etc/nginx/sites-available/mi2 /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Testar e reiniciar Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

# ── 8. Configurar Firewall ──
echo "🔒 Configurando firewall..."
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

# ── 9. Configurar PM2 para iniciar no boot ──
pm2 startup systemd -u root --hp /root
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ VPS configurada com sucesso!          ║"
echo "║                                            ║"
echo "║  Próximo passo: fazer upload dos arquivos  ║"
echo "║  para /var/www/mi2 e executar:             ║"
echo "║                                            ║"
echo "║  cd /var/www/mi2                           ║"
echo "║  npm install                               ║"
echo "║  pm2 start ecosystem.config.js             ║"
echo "║  pm2 save                                  ║"
echo "╚══════════════════════════════════════════╝"
