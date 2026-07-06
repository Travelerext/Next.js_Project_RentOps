#!/usr/bin/env bash
set -Eeuo pipefail

# RentOps Alibaba Cloud ECS setup script.
#
# Run on a fresh Ubuntu/Debian server as root:
#   chmod +x scripts/setup-server.sh
#   sudo APP_USER=<your-ssh-user> DEPLOY_PATH=/opt/rentops scripts/setup-server.sh
#
# The script installs runtime dependencies and prepares the deploy directory.
# It does not run database migrations automatically. Use `rentops-migrate`
# after the app files and .env have been deployed.

APP_USER="${APP_USER:-${SUDO_USER:-rentops}}"
if [ "$APP_USER" = "root" ]; then
  APP_USER="rentops"
fi

DEPLOY_PATH="${DEPLOY_PATH:-/opt/rentops}"
NODE_VERSION="${NODE_VERSION:-20}"
SUPABASE_CLI_VERSION="${SUPABASE_CLI_VERSION:-latest}"

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "This script must be run as root. Try: sudo APP_USER=$APP_USER $0"
    exit 1
  fi
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

section() {
  echo ""
  echo "==> $1"
}

require_root

echo "RentOps server setup"
echo "App user:    $APP_USER"
echo "Deploy path: $DEPLOY_PATH"
echo "Node.js:     $NODE_VERSION"

section "Installing base packages"
apt-get update
apt-get install -y ca-certificates curl gnupg nginx ufw

section "Preparing application user"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$APP_USER"
fi

section "Installing Node.js"
if ! command_exists node || ! node -v | grep -q "^v${NODE_VERSION}\\."; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v)"
echo "npm $(npm -v)"

section "Installing PM2"
if ! command_exists pm2; then
  npm install -g pm2
fi
echo "PM2 $(pm2 -v)"

section "Installing Supabase CLI"
if ! command_exists supabase; then
  npm install -g "supabase@${SUPABASE_CLI_VERSION}"
fi
supabase --version

section "Configuring Nginx reverse proxy"
cat > /etc/nginx/sites-available/rentops <<'NGINXEOF'
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

ln -sf /etc/nginx/sites-available/rentops /etc/nginx/sites-enabled/rentops
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

section "Creating deploy directory"
mkdir -p "$DEPLOY_PATH/logs"
chown -R "${APP_USER}:${APP_USER}" "$DEPLOY_PATH"

if [ ! -f "$DEPLOY_PATH/.env.example" ]; then
  cat > "$DEPLOY_PATH/.env.example" <<'ENVEOF'
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DEEPSEEK_API_KEY=
DEEPSEEK_API_URL=https://api.deepseek.com/chat/completions
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_MS=25000
ENVEOF
  chown "${APP_USER}:${APP_USER}" "$DEPLOY_PATH/.env.example"
fi

section "Installing migration helper"
cat > /usr/local/bin/rentops-migrate <<'MIGRATEEOF'
#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/rentops}"
ENV_FILE="${ENV_FILE:-$DEPLOY_PATH/.env}"

if [ ! -d "$DEPLOY_PATH/supabase/migrations" ]; then
  echo "Missing Supabase migrations directory: $DEPLOY_PATH/supabase/migrations"
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-}"
if [ -z "$DATABASE_URL" ] && [ -f "$ENV_FILE" ]; then
  DATABASE_URL="$(awk -F= '$1=="DATABASE_URL"{sub(/^[^=]*=/,""); print; exit}' "$ENV_FILE")"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required. Set it in the environment or in $ENV_FILE."
  exit 1
fi

cd "$DEPLOY_PATH"
supabase db push --db-url "$DATABASE_URL"
MIGRATEEOF
chmod +x /usr/local/bin/rentops-migrate

section "Configuring PM2 startup"
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" || true

section "Configuring firewall"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw --force enable

SERVER_IP="$(curl -fsS ifconfig.me 2>/dev/null || echo YOUR_SERVER_IP)"

cat <<EOF

Setup complete.

Server URL:  http://$SERVER_IP
Deploy path: $DEPLOY_PATH
App user:    $APP_USER

Next steps:
1. Configure GitHub Secrets, including DATABASE_URL.
2. Deploy the app files to $DEPLOY_PATH.
3. Apply database migrations when ready:
   rentops-migrate
4. Start or reload the app with PM2 after deployment.
EOF
