# Oracle Cloud Free Tier Deployment Guide

## Prerequisites
- Oracle Cloud account (sign up at https://cloud.oracle.com)
- Your backend code ready
- Environment variables (.env.local)

---

## Step 1: Create Oracle Cloud VM

### 1.1 Sign Up
1. Go to https://cloud.oracle.com
2. Click "Sign up for free tier"
3. Complete registration (requires credit card for verification, won't be charged)

### 1.2 Create Compute Instance
1. Login to Oracle Cloud Console
2. Go to **Menu → Compute → Instances**
3. Click **Create Instance**

**Instance Configuration:**
- **Name**: `ai-treasurer-backend`
- **Image**: Ubuntu 22.04 (or latest Ubuntu)
- **Shape**: VM.Standard.E2.1.Micro (Always Free eligible)
  - 1 OCPU, 1 GB RAM
- **VCN**: Create new or use default
- **Subnet**: Public subnet
- **Assign public IP**: Yes ✅
- **SSH Keys**: 
  - Generate new key pair and download
  - Or upload your existing public key

4. Click **Create**
5. Wait 2-3 minutes for instance to provision
6. **Save the Public IP address** (e.g., 129.146.x.x)

---

## Step 2: Configure Firewall

### 2.1 Oracle Cloud Security List
1. Go to **Networking → Virtual Cloud Networks**
2. Click your VCN → **Security Lists** → **Default Security List**
3. Click **Add Ingress Rules**

**Add these rules:**

| Source CIDR | IP Protocol | Source Port | Destination Port | Description |
|-------------|-------------|-------------|------------------|-------------|
| 0.0.0.0/0 | TCP | All | 22 | SSH |
| 0.0.0.0/0 | TCP | All | 3001 | API Server |
| 0.0.0.0/0 | TCP | All | 80 | HTTP (optional) |
| 0.0.0.0/0 | TCP | All | 443 | HTTPS (optional) |

### 2.2 Ubuntu Firewall (UFW)
We'll configure this after SSH'ing in.

---

## Step 3: Connect to Your VPS

### 3.1 Set SSH Key Permissions
```bash
# On your Mac
chmod 400 ~/Downloads/ssh-key-*.key
```

### 3.2 SSH into VPS
```bash
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<YOUR_PUBLIC_IP>
```

**First time connection:**
- Type `yes` when asked about fingerprint
- You should see Ubuntu welcome message

---

## Step 4: Setup VPS Environment

### 4.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 4.2 Install Node.js 20
```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should show v20.x.x
npm --version
```

### 4.3 Install pnpm
```bash
npm install -g pnpm
pnpm --version
```

### 4.4 Install PM2
```bash
npm install -g pm2
pm2 --version
```

### 4.5 Configure UFW Firewall
```bash
# Allow SSH, API port, and optionally HTTP/HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
sudo ufw status
```

---

## Step 5: Deploy Your Backend

### 5.1 Transfer Files to VPS

**Option A: Using SCP (from your Mac)**
```bash
cd /Users/bgr/Work/NextJS/ai-treasurer
scp -i ~/Downloads/ssh-key-*.key -r backend ubuntu@<YOUR_PUBLIC_IP>:~/
```

**Option B: Using Git (recommended)**
```bash
# On VPS
cd ~
git clone <your-repo-url>
cd <repo-name>/backend
```

### 5.2 Install Dependencies
```bash
cd ~/backend
pnpm install
```

### 5.3 Setup Environment Variables
```bash
# Create .env.local file
nano .env.local
```

**Paste your environment variables:**
```bash
# Coinbase CDP
CDP_API_KEY_ID=your-key-id
CDP_API_KEY_SECRET=your-secret
CDP_WALLET_SECRET=your-wallet-secret

# DAO Configuration
DAO_TREASURY_ADDRESS=0x3ed26c1d23Fd4Ea3B5e2077B60B4F1EC80Aba94f
DAO_GOVERNOR_ADDRESS=0x9F530c7bCdb859bB1DcA3cD4EAE644f973A5f505

# API Keys
OPENAI_API_KEY=sk-...
ZORA_API_KEY=zora_api_...

# Agent Wallet
AGENT_EOA_ADDRESS=0x...
AGENT_SMART_ACCOUNT_ADDRESS=0x...

# Server
PORT=3001
NODE_ENV=production
```

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

### 5.4 Create Directories
```bash
mkdir -p data logs
```

### 5.5 Run Tests
```bash
pnpm test
```

Should show: ✅ All tests passed! Backend is ready for deployment.

---

## Step 6: Start Services with PM2

### 6.1 Start Backend
```bash
cd ~/backend
pm2 start ecosystem.config.js
```

### 6.2 Verify Services Running
```bash
pm2 status
```

You should see:
- `ai-treasurer-api` - online
- `ai-treasurer-agent` - online (with cron schedule)

### 6.3 View Logs
```bash
# All logs
pm2 logs

# API server logs only
pm2 logs ai-treasurer-api

# Agent logs only
pm2 logs ai-treasurer-agent
```

### 6.4 Save PM2 Configuration
```bash
pm2 save
```

### 6.5 Setup Auto-Start on Reboot
```bash
pm2 startup
# Copy and run the command it shows (starts with sudo)

# Example output:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

---

## Step 7: Test Your API

### 7.1 Test Locally on VPS
```bash
curl http://localhost:3001/health
```

### 7.2 Test from Your Mac
```bash
curl http://<YOUR_PUBLIC_IP>:3001/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-22T...",
  "uptime": 123.45
}
```

### 7.3 Test Queue Endpoint
```bash
curl http://<YOUR_PUBLIC_IP>:3001/api/queue
```

### 7.4 Test Portfolio Endpoint
```bash
curl http://<YOUR_PUBLIC_IP>:3001/api/portfolio
```

---

## Step 8: Monitor and Maintain

### 8.1 PM2 Commands
```bash
# View status
pm2 status

# View logs (follow mode)
pm2 logs -f

# Restart all
pm2 restart all

# Restart just API
pm2 restart ai-treasurer-api

# Stop all
pm2 stop all

# Delete all processes
pm2 delete all
```

### 8.2 View Queue
```bash
cd ~/backend
pnpm queue:view
```

### 8.3 Manually Trigger Agent
```bash
cd ~/backend
pnpm agent
```

### 8.4 Update Backend Code
```bash
cd ~/backend
git pull  # If using git
pnpm install  # If dependencies changed
pm2 restart all
```

### 8.5 Check System Resources
```bash
# Memory usage
free -h

# Disk space
df -h

# CPU usage
htop  # or: top
```

---

## Step 9: Optional - Setup Nginx Reverse Proxy

If you want to use port 80 instead of 3001 and add SSL:

### 9.1 Install Nginx
```bash
sudo apt install -y nginx
```

### 9.2 Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/ai-treasurer
```

**Paste this configuration:**
```nginx
server {
    listen 80;
    server_name <YOUR_PUBLIC_IP>;

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

### 9.3 Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/ai-treasurer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 9.4 Test
```bash
curl http://<YOUR_PUBLIC_IP>/health
```

---

## Troubleshooting

### API Not Responding
```bash
# Check if services are running
pm2 status

# Check logs for errors
pm2 logs

# Check if port is listening
sudo netstat -tlnp | grep 3001

# Restart services
pm2 restart all
```

### Agent Not Running
```bash
# Check cron schedule
pm2 describe ai-treasurer-agent

# View agent logs
pm2 logs ai-treasurer-agent

# Manually run agent
cd ~/backend && pnpm agent
```

### Out of Memory
```bash
# Check memory
free -h

# Restart services to free memory
pm2 restart all

# Consider adding swap space (Oracle Free Tier has limited RAM)
```

### Firewall Issues
```bash
# Check UFW status
sudo ufw status

# Check Oracle Cloud Security List (in web console)
# Make sure port 3001 is open in both places
```

### SSL Certificate (Optional)
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (requires domain name)
sudo certbot --nginx -d yourdomain.com
```

---

## Environment Variables Reference

Required in `.env.local`:

```bash
CDP_API_KEY_ID=           # Coinbase CDP API key ID
CDP_API_KEY_SECRET=       # Coinbase CDP API secret
CDP_WALLET_SECRET=        # CDP wallet private key
DAO_TREASURY_ADDRESS=     # DAO treasury address
DAO_GOVERNOR_ADDRESS=     # DAO governor contract
OPENAI_API_KEY=          # OpenAI API key
ZORA_API_KEY=            # Zora API key
AGENT_EOA_ADDRESS=       # Agent EOA wallet
AGENT_SMART_ACCOUNT_ADDRESS=  # Agent smart account
PORT=3001                # API server port
NODE_ENV=production      # Environment
```

---

## Estimated Costs

**Oracle Cloud Free Tier:**
- ✅ 2 AMD VMs (1GB RAM, 1 OCPU each) - FREE FOREVER
- ✅ 200 GB Block Storage - FREE FOREVER
- ✅ 10 TB Outbound Data Transfer/month - FREE FOREVER
- ✅ No credit card charges, ever (for Always Free resources)

**Your backend uses minimal resources:**
- API Server: ~100-200 MB RAM
- Agent (runs every 6 min): ~50-100 MB RAM when active
- Total: ~300 MB RAM ✅ (well under 1 GB limit)

---

## Next Steps

1. ✅ Create Oracle Cloud account
2. ✅ Provision VM instance
3. ✅ Configure firewall rules
4. ✅ SSH into VPS and setup environment
5. ✅ Deploy backend code
6. ✅ Start PM2 services
7. ✅ Test API endpoints
8. ✅ Configure your frontend to use: `http://<YOUR_PUBLIC_IP>:3001`

**Your backend will now run 24/7 with the agent executing every 6 minutes!** 🚀

---

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs`
2. Check system resources: `free -h` and `df -h`
3. Verify firewall: `sudo ufw status`
4. Test locally first: `curl http://localhost:3001/health`
5. Check Oracle Cloud Security List in web console
