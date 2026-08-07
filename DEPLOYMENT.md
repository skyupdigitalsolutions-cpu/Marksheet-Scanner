# Marksheet Scanner — Backend Deployment Guide
## Hetzner VPS + MongoDB

---

## Step 1: Create Hetzner Server

1. Go to hetzner.com → Cloud → Create Server
2. Choose: **Ubuntu 22.04** | **CX21** (2 vCPU, 4GB RAM, €4.51/mo)
3. Add your SSH key
4. Note the server IP: `YOUR_SERVER_IP`

---

## Step 2: Connect and Setup Server

```bash
ssh root@YOUR_SERVER_IP

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install MongoDB 7
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update && apt install -y mongodb-org

# Start MongoDB
systemctl start mongod
systemctl enable mongod

# Install PM2 (process manager)
npm install -g pm2
```

---

## Step 3: Upload Backend Code

On your LOCAL machine (or use git):

```bash
# Option A: SCP
scp -r marksheet-backend/ root@YOUR_SERVER_IP:/opt/marksheet-backend

# Option B: Git (recommended)
# Push to GitHub first, then on server:
cd /opt && git clone https://github.com/YOUR_REPO/marksheet-backend.git
```

---

## Step 4: Configure and Start Backend

```bash
cd /opt/marksheet-backend

# Install dependencies
npm install --production

# Create .env file
cp .env.example .env
nano .env
```

Edit `.env`:
```
MONGO_URI=mongodb://localhost:27017/marksheet_scanner
JWT_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_STRING_AT_LEAST_32_CHARS
JWT_EXPIRES_IN=30d
PORT=3000
NODE_ENV=production
```

```bash
# Start with PM2
pm2 start server.js --name marksheet-backend
pm2 save
pm2 startup  # follow the printed command to auto-start on reboot

# Check it's running
pm2 status
curl http://localhost:3000/health
```

---

## Step 5: Open Firewall Port

```bash
# Allow port 3000 from anywhere (or restrict to your IP range)
ufw allow 22
ufw allow 3000
ufw enable

# Test from your laptop:
curl http://YOUR_SERVER_IP:3000/health
# Should return: {"success":true,"message":"Marksheet Scanner API is running",...}
```

---

## Step 6: Connect Android App

In the app, go to **⚙ Server Settings** and enter:
```
http://YOUR_SERVER_IP:3000
```
Tap **Test Connection** — should show ✓ Connected.

---

## Step 7: Connect MongoDB Compass

1. Download MongoDB Compass: https://www.mongodb.com/products/compass
2. Connection string: `mongodb://YOUR_SERVER_IP:27017/marksheet_scanner`

> If Compass can't connect, open port 27017:
> ```bash
> ufw allow from YOUR_LAPTOP_IP to any port 27017
> ```
> Or use SSH tunnel (more secure):
> ```bash
> ssh -L 27017:localhost:27017 root@YOUR_SERVER_IP
> # Then Compass connects to: mongodb://localhost:27017
> ```

---

## Collections in MongoDB Compass

After first signup, you'll see:

### `users` collection
```json
{
  "_id": "...",
  "name": "Pooja Sharma",
  "email": "pooja@skyup.in",
  "username": "pooja",
  "institution": "Your College Name",
  "role": "Teacher",
  "password": "$2a$12$...",  ← bcrypt hash, never plain text
  "isActive": true,
  "lastLogin": "2025-04-29T...",
  "createdAt": "2025-04-29T..."
}
```

### `scans` collection
```json
{
  "_id": "...",
  "userId": "...",
  "username": "pooja",
  "studentName": "Sha Fahad MD",
  "regNo": "1S122CS158",
  "courseName": "Computer Network",
  "grandTotal": 41,
  "q1a": 8, "q1b": 3, "q1c": 6,
  ...
  "scannedAt": "2025-04-29T..."
}
```

---

## API Endpoints Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/signup | No | Create account |
| POST | /api/auth/login | No | Login |
| GET | /api/auth/me | Yes | Get profile |
| PUT | /api/auth/profile | Yes | Update profile |
| POST | /api/auth/change-password | Yes | Change password |
| POST | /api/scans | Yes | Save scan |
| GET | /api/scans | Yes | Get history |
| GET | /api/scans/stats | Yes | Dashboard stats |
| GET | /api/scans/export/csv | Yes | Download CSV |
| DELETE | /api/scans/:id | Yes | Delete scan |

---

## Optional: HTTPS with Nginx

```bash
apt install -y nginx certbot python3-certbot-nginx

# Create nginx config
cat > /etc/nginx/sites-available/marksheet << 'EOF'
server {
    server_name YOUR_DOMAIN.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

ln -s /etc/nginx/sites-available/marksheet /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d YOUR_DOMAIN.com
```

Then update Android app URL to `https://YOUR_DOMAIN.com`

---

## Monitoring

```bash
pm2 logs marksheet-backend   # live logs
pm2 monit                     # CPU/memory monitor
```
