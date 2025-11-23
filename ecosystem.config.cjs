/**
 * PM2 Ecosystem Configuration
 * 
 * Manages three processes:
 * 1. API Server - Runs continuously
 * 2. Agent - Runs every 12 minutes (proposes new coins)
 * 3. Executor - Runs every 12 minutes (executes approved proposals)
 */

module.exports = {
  apps: [
    {
      name: 'yaynay-api',
      script: 'server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      time: true,
    },
    {
      name: 'yaynay-agent',
      script: 'scripts/agent.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cron_restart: '*/12 * * * *', // Every 12 minutes
      autorestart: false,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/agent-error.log',
      out_file: './logs/agent-out.log',
      time: true,
    },
    {
      name: 'yaynay-executor',
      script: 'scripts/executeProposals.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cron_restart: '*/12 * * * *', // Every 12 minutes
      autorestart: false,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/executor-error.log',
      out_file: './logs/executor-out.log',
      time: true,
    },
  ],
};
