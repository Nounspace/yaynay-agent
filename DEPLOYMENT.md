# Deployment Guide - AI Treasurer Backend

This guide covers deploying the AI Treasurer backend API and autonomous agent on a VPS.

## Architecture

- **Backend API** (Express server): Handles user submissions, queue management, portfolio queries
- **Autonomous Agent** (Cron job): Runs every X minutes to process queue and suggest new coins
- **Data Storage**: JSON file (`data/suggestions-queue.json`) persisted on VPS

## Requirements

- Ubuntu 20.04+ (or similar Linux distro)
- Node.js 20+
- PM2 (for process management)
- Nginx (for reverse proxy, optional)

---

## 1. Server Setup

### Install Node.js

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version

# Install pnpm
npm install -g pnpm
```

### Install PM2

```bash
npm install -g pm2

# Setup PM2 to start on boot
pm2 startup
```

---

## 2. Deploy Application

### Clone Repository

```bash
cd /home/your-user
git clone https://github.com/Nounspace/yaynay-agent.git
cd yaynay-agent
```

### Install Dependencies

```bash
pnpm install
```

### Configure Environment

```bash
cp .env.local.example .env.local
nano .env.local
```

Fill in all required environment variables:
- CDP API keys
- OpenAI API key
- Zora API key
- DAO addresses
- Agent wallet addresses

### Create Data Directory

```bash
mkdir -p data
```

---

## 3. Run Backend API with PM2

### Create PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'ai-treasurer-api',
      script: 'tsx',
      args: 'server.ts',
      cwd: '/home/your-user/ai-treasurer',
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
  ],
};
```

### Start API Server

```bash
# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# View logs
pm2 logs ai-treasurer-api
```

### Verify API is Running

```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"...","service":"ai-treasurer-api"}
```

---

## 4. Setup Agent Cron Job

### Option A: Using PM2 Cron

Add to `ecosystem.config.js`:

```javascript
{
  name: 'ai-treasurer-agent',
  script: 'tsx',
  args: 'scripts/agent.ts',
  cwd: '/home/your-user/ai-treasurer',
  instances: 1,
  autorestart: false,
  cron_restart: '*/5 * * * *', // Every 5 minutes
  watch: false,
  error_file: './logs/agent-error.log',
  out_file: './logs/agent-out.log',
}
```

Then restart PM2:
```bash
pm2 reload ecosystem.config.js
pm2 save
```

### Option B: Using System Cron

```bash
# Edit crontab
crontab -e

# Add line (runs every 5 minutes)
*/5 * * * * cd /home/your-user/ai-treasurer && /usr/local/bin/pnpm agent >> /home/your-user/ai-treasurer/logs/agent.log 2>&1
```

---

## 5. Setup Nginx Reverse Proxy (Optional)

If you want to expose the API on port 80/443:

```bash
sudo apt-get install nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/ai-treasurer
```

Add configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/ai-treasurer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. SSL with Let's Encrypt (Optional)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 7. Monitoring & Maintenance

### View Logs

```bash
# API logs
pm2 logs ai-treasurer-api

# Agent logs (if using PM2)
pm2 logs ai-treasurer-agent

# Or tail log files
tail -f logs/api-out.log
tail -f logs/agent.log
```

### Monitor Processes

```bash
pm2 status
pm2 monit
```

### View Queue

```bash
cd /home/your-user/ai-treasurer
pnpm queue:view
```

### Restart Services

```bash
# Restart API
pm2 restart ai-treasurer-api

# Restart all
pm2 restart all
```

### Update Application

```bash
cd /home/your-user/ai-treasurer
git pull
pnpm install
pm2 restart all
```

---

## 8. Firewall Configuration

```bash
# Allow SSH
sudo ufw allow 22

# Allow HTTP/HTTPS (if using Nginx)
sudo ufw allow 80
sudo ufw allow 443

# Or allow API port directly
sudo ufw allow 3001

# Enable firewall
sudo ufw enable
```

---

## 9. Backup Strategy

### Backup Queue Data

```bash
# Create backup script
nano /home/your-user/backup-queue.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/your-user/backups"
mkdir -p $BACKUP_DIR
cp /home/your-user/ai-treasurer/data/suggestions-queue.json \
   $BACKUP_DIR/queue-backup-$(date +%Y%m%d-%H%M%S).json

# Keep only last 30 days
find $BACKUP_DIR -name "queue-backup-*.json" -mtime +30 -delete
```

```bash
chmod +x /home/your-user/backup-queue.sh

# Add to crontab (daily at 2 AM)
crontab -e
0 2 * * * /home/your-user/backup-queue.sh
```

---

## 10. Environment Variables on VPS

Make sure `.env.local` has all required variables:

```bash
# Required for API
CDP_API_KEY_ID=your-key
CDP_API_KEY_SECRET=your-secret
CDP_WALLET_SECRET=your-wallet-secret
DAO_TREASURY_ADDRESS=0x...
DAO_GOVERNOR_ADDRESS=0x...
OPENAI_API_KEY=sk-...
ZORA_API_KEY=zora_api_...

# Required for Agent
AGENT_EOA_ADDRESS=0x...
AGENT_SMART_ACCOUNT_ADDRESS=0x...
```

---

## 11. Testing Deployment

### Test API Health

```bash
curl http://your-domain.com/health
```

### Test Queue Endpoint

```bash
curl http://your-domain.com/api/queue
```

### Test Creator Analysis

```bash
curl -X POST http://your-domain.com/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"username": "jessepollak"}'
```

### Test Portfolio

```bash
curl http://your-domain.com/api/portfolio
```

### Manually Run Agent

```bash
cd /home/your-user/ai-treasurer
pnpm agent
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3001
sudo lsof -i :3001

# Kill process
sudo kill -9 <PID>
```

### Permission Issues

```bash
# Fix ownership
sudo chown -R your-user:your-user /home/your-user/ai-treasurer

# Fix data directory
chmod 755 data
```

### Agent Not Running

```bash
# Check cron logs
grep CRON /var/log/syslog

# Test agent manually
cd /home/your-user/ai-treasurer
pnpm agent
```

---

## Production Checklist

- [ ] Environment variables configured
- [ ] PM2 ecosystem file created
- [ ] API server running (pm2 list)
- [ ] Agent cron job configured
- [ ] Nginx reverse proxy setup (optional)
- [ ] SSL certificate installed (optional)
- [ ] Firewall configured
- [ ] Backup cron job setup
- [ ] Logs directory created
- [ ] Test all API endpoints
- [ ] Monitor logs for errors
- [ ] Document API URL for frontend team
