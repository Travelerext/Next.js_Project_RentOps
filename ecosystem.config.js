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
      env: {
        NODE_ENV: "production",
        PORT: 3000,
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
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
