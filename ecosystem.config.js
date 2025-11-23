module.exports = {
  apps: [
    {
      name: 'ai-treasurer-api',
      script: 'server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: process.cwd(),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'ai-treasurer-agent',
      script: 'scripts/agent.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: process.cwd(),
      instances: 1,
      autorestart: false,
      cron_restart: '*/12 * * * *', // Every 12 minutes
      watch: false,
      error_file: './logs/agent-error.log',
      out_file: './logs/agent-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
