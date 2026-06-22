#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# RentOps — Alibaba Cloud ECS 服务器初始化脚本
# 首次部署前在服务器上以 root 身份运行:
#   chmod +x setup-server.sh && sudo ./setup-server.sh
# ═══════════════════════════════════════════════════════════════════
set -e

APP_USER="${APP_USER:-www-data}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/rentops}"
NODE_VERSION="${NODE_VERSION:-20}"

echo "╔════════════════════════════════════════════════╗"
echo "║  RentOps — Server Setup (IP Mode)             ║"
echo "╚════════════════════════════════════════════════╝"

# ── 1. Install Node.js ───────────────────────────────────────────
echo ""
echo "━━━ [1/6] Installing Node.js $NODE_VERSION ━━━"

if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi

echo "✅ Node.js $(node -v)"
echo "✅ npm $(npm -v)"

# ── 2. Install PM2 ───────────────────────────────────────────────
echo ""
echo "━━━ [2/6] Installing PM2 ━━━"

if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

echo "✅ PM2 $(pm2 -v)"

# ── 3. Install & configure Nginx ─────────────────────────────────
echo ""
echo "━━━ [3/6] Installing Nginx ━━━"

if ! command -v nginx &>/dev/null; then
  apt-get update
  apt-get install -y nginx
fi

# Nginx 反代 —— server_name _ 匹配所有请求（IP 或域名均可）
cat > /etc/nginx/sites-available/rentops << 'NGINXEOF'
# RentOps — IP-based reverse proxy
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/rentops /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
echo "✅ Nginx configured → :80 → :3000 (反代)"

SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
echo "   访问地址: http://${SERVER_IP}"

# ── 4. Create deploy directory ───────────────────────────────────
echo ""
echo "━━━ [4/6] Creating deploy directory ━━━"

mkdir -p "$DEPLOY_PATH/logs"
chown -R "${APP_USER}:${APP_USER}" "$DEPLOY_PATH"
echo "✅ $DEPLOY_PATH"

# ── 5. Configure PM2 startup ─────────────────────────────────────
echo ""
echo "━━━ [5/6] Configuring PM2 auto-start ━━━"

pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" || true
echo "✅ PM2 will start on boot"

# ── 6. Firewall ──────────────────────────────────────────────────
echo ""
echo "━━━ [6/6] Configuring firewall ━━━"

if command -v ufw &>/dev/null; then
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 22/tcp
  ufw --force enable
  echo "✅ Firewall: 80, 443, 22 allowed"
else
  echo "⚠️  ufw not found — 请确保阿里云安全组已放行 80 端口"
fi

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                           ║"
echo "║                                              ║"
echo "║  访问地址: http://${SERVER_IP}               ║"
echo "║  部署路径: $DEPLOY_PATH                      ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "📋 Next steps:"
echo "   1. 在阿里云安全组放行 80 端口 (如果还没放行)"
echo "   2. 配置 GitHub Secrets 后 push main 触发部署"
