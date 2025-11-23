# Docker Deployment Guide

## Quick Start

### 1. Build and Run

```bash
cd backend

# Build and start container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

### 2. Deploy to VPS

```bash
# On your local machine, copy backend to VPS
scp -r backend/ user@your-vps:/home/user/ai-treasurer

# SSH into VPS
ssh user@your-vps

# Navigate to directory
cd /home/user/ai-treasurer

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f ai-treasurer
```

## Docker Commands

### Basic Operations

```bash
# Start container
docker-compose up -d

# Stop container
docker-compose down

# Restart container
docker-compose restart

# View logs (live)
docker-compose logs -f

# View logs (last 100 lines)
docker-compose logs --tail=100

# Check container status
docker-compose ps

# Execute command in container
docker-compose exec ai-treasurer pnpm queue:view
```

### Rebuild After Code Changes

```bash
# Rebuild and restart
docker-compose up -d --build

# Or
docker-compose build
docker-compose up -d
```

### View Queue

```bash
# From host machine
docker-compose exec ai-treasurer pnpm queue:view

# Or check the JSON file directly
cat data/suggestions-queue.json | jq
```

## Data Persistence

The following directories are mounted as volumes:
- `./data` - Queue data (suggestions-queue.json)
- `./logs` - Application logs

These persist even if you recreate the container.

## Environment Variables

Make sure `.env.local` exists with all required variables:

```bash
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
CDP_WALLET_SECRET=...
DAO_TREASURY_ADDRESS=...
DAO_GOVERNOR_ADDRESS=...
OPENAI_API_KEY=...
ZORA_API_KEY=...
AGENT_EOA_ADDRESS=...
AGENT_SMART_ACCOUNT_ADDRESS=...
```

## Health Check

```bash
# From host
curl http://localhost:3001/health

# Check Docker health status
docker-compose ps
```

## Production Best Practices

### 1. Use Docker Compose in Production

```bash
# Start with restart policy
docker-compose up -d
```

The `restart: unless-stopped` policy ensures:
- Container restarts automatically on failure
- Container starts on server reboot
- Manual stops are respected

### 2. Monitor Logs

```bash
# Set up log rotation in docker-compose.yml
services:
  ai-treasurer:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 3. Backup Queue Data

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
tar -czf backup-$(date +%Y%m%d).tar.gz data/ logs/
EOF

chmod +x backup.sh

# Add to crontab (daily at 2 AM)
0 2 * * * /home/user/ai-treasurer/backup.sh
```

## Nginx Reverse Proxy (Optional)

If you want to expose the API on port 80/443:

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
    }
}
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs ai-treasurer

# Check if port 3001 is already in use
sudo lsof -i :3001

# Kill process using the port
sudo kill -9 <PID>
```

### View Container Details

```bash
# Get container info
docker inspect ai-treasurer-backend

# Access container shell
docker-compose exec ai-treasurer sh

# Check running processes inside container
docker-compose exec ai-treasurer ps aux
```

### Queue Not Updating

```bash
# Check agent logs
docker-compose logs ai-treasurer | grep agent

# Manually run agent once
docker-compose exec ai-treasurer pnpm agent
```

### Reset Everything

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: deletes queue data)
docker-compose down -v

# Rebuild from scratch
docker-compose up -d --build
```

## What Runs in Container

- **API Server**: Express app on port 3001 (runs continuously)
- **Agent**: Runs every 6 minutes (360 seconds) in background loop
- **Data**: Queue persisted in mounted `/app/data` volume
- **Logs**: Stored in mounted `/app/logs` volume

## Testing

### Test API Endpoints

```bash
# Health check
curl http://localhost:3001/health

# Get queue
curl http://localhost:3001/api/queue

# Submit coin for analysis
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"username": "jessepollak"}'

# Get portfolio
curl http://localhost:3001/api/portfolio
```

## Advantages of Docker

✅ **Easy deployment** - Single `docker-compose up -d` command  
✅ **Consistent environment** - Same on local and production  
✅ **Automatic restarts** - Container restarts on failure  
✅ **Data persistence** - Volumes for queue and logs  
✅ **Easy updates** - Rebuild and redeploy quickly  
✅ **No PM2 needed** - Docker handles process management  
✅ **Isolated** - Doesn't interfere with other services  

## Deployment Checklist

- [ ] `.env.local` configured with all keys
- [ ] `docker` and `docker-compose` installed on VPS
- [ ] Port 3001 open in firewall
- [ ] Nginx reverse proxy configured (optional)
- [ ] SSL certificate installed (optional)
- [ ] Backup cron job setup
- [ ] Test all API endpoints
- [ ] Monitor logs for errors
