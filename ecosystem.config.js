module.exports = {
  apps: [
    {
      name: "rentops",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: __dirname,

      // ── Process ──────────────────────────────────────────────────
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",

      // ── Env ──────────────────────────────────────────────────────
      // Placeholders replaced by deploy script with real values from GitHub Secrets
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        NEXT_PUBLIC_SUPABASE_URL: "__NEXT_PUBLIC_SUPABASE_URL__",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "__NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__",
        SUPABASE_SERVICE_ROLE_KEY: "__SUPABASE_SERVICE_ROLE_KEY__",
      },

      // ── Logs ─────────────────────────────────────────────────────
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      merge_logs: true,
      max_size: "10M",
      retain: 7,

      // ── Restart strategy ─────────────────────────────────────────
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      kill_timeout: 5000,
    },
  ],
};
