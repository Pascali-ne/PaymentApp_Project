# PaymentApp - Playing Around with APIs

Simple payment platform with:
- Flutterwave checkout payments
- Payment dashboard (admin can approve pending payments)
- External exchange-rate API + in-app currency conversion (converts to RWF)
- Deployed behind an Nginx load balancer across `web01` and `web02`

## Live / Submission
- Website URL: _(add your deployed LB URL here)_
- Demo video: _(add your < 2 minute video link here)_

## What APIs are used
1. **Flutterwave Checkout** (payments)
   - Docs: https://developer.flutterwave.com/docs/flutterwave-checkout
   - This project uses **Flutterwave TEST keys** (no production charges) so you can safely demo the flow.
2. **Exchange rates via open.er-api.com** (currency conversion)
   - Docs: https://www.exchangerate-api.com/docs/free
   - Backend endpoint used in this app: `GET /api/exchange-rate?from=USD&to=RWF`

## Security / Secrets
Never commit secrets to GitHub.
Set required values via environment variables in `.env` on each server.

## Project Structure
- `server.js` - Express backend + SQLite + API routes
- `database.js` - SQLite schema + DB operations
- `public/` - frontend pages and JS
  - `index.html` + `payment.js`: payment form + currency converter
  - `dashboard.html` + `dashboard.js`: payment dashboard + filtering/search UI

## Local Development (Part One)
### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment variables
Copy and edit:
```bash
cp .env.example .env
```
Required:
- `FLUTTERWAVE_PUBLIC_KEY`
- `FLUTTERWAVE_SECRET_KEY` (used for Flutterwave server-side usage if you extend verification)
- `ADMIN_TOKEN`
- `PORT` (defaults to `8080`)
- `BASE_CURRENCY` (defaults to `RWF`)

> Note: `.env` must not be committed.

### 3) Run the app
```bash
npm run dev
```

Open in browser:
- Payment page: `http://localhost:8080/`
- Dashboard: `http://localhost:8080/dashboard`

### 4) Currency conversion (API interaction)
On the payment page:
- Choose a currency (USD/EUR/GBP/KES/TZS/UGX)
- Enter an amount
- Click `Convert to RWF`
The app calls your backend `GET /api/exchange-rate` and fills the payment `Amount (RWF)` field.

## Deployment (Part Two)
You have:
- `web01` = `3.95.194.118`
- `web02` = `44.211.81.121`
- Load balancer `Lb01` = `32.193.244.84`

### A) Deploy on `web01` and `web02` (Node.js + systemd + Nginx)
Do these steps on **both** servers.

#### 1) Install packages
```bash
sudo apt update
sudo apt install -y git nginx nodejs npm
```

#### 2) Copy the project to `/opt/paymentapp`
```bash
sudo rm -rf /opt/paymentapp
sudo git clone <YOUR_REPO_URL> /opt/paymentapp
sudo chown -R "$USER":"$USER" /opt/paymentapp
```

#### 3) Install Node dependencies
```bash
cd /opt/paymentapp
npm ci --omit=dev
```

#### 4) Create the server `.env`
```bash
sudo cp .env.example /opt/paymentapp/.env
sudo nano /opt/paymentapp/.env
```
Set at least:
- `FLUTTERWAVE_PUBLIC_KEY`
- `ADMIN_TOKEN`
- `PORT=8080`
- `BASE_CURRENCY=RWF`

#### 5) Create a persistent SQLite directory (important)
This service writes to `DB_PATH=/var/lib/paymentapp/payments.db`.
```bash
sudo mkdir -p /var/lib/paymentapp
sudo chown -R www-data:www-data /var/lib/paymentapp
```

#### 6) Install and enable the systemd service
Copy the included unit file:
```bash
sudo cp /opt/paymentapp/deploy/paymentapp.service /etc/systemd/system/paymentapp.service
sudo systemctl daemon-reload
sudo systemctl enable --now paymentapp
sudo systemctl status paymentapp --no-pager
```

#### 7) Configure Nginx reverse proxy on each web server
Use the included config:
```bash
sudo cp /opt/paymentapp/deploy/nginx-web01-web02.conf /etc/nginx/sites-available/paymentapp
sudo ln -sf /etc/nginx/sites-available/paymentapp /etc/nginx/sites-enabled/paymentapp
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

#### 8) Quick health checks (run on each web server)
```bash
curl -sS -I http://127.0.0.1:8080/ | head
curl -sS -I http://127.0.0.1/ | head
```

### B) Configure the load balancer on `Lb01` (Nginx)
#### 1) Install Nginx
```bash
sudo apt update
sudo apt install -y nginx
```

#### 2) Install the LB config
Use the included config:
```bash
sudo cp /opt/paymentapp/deploy/nginx-lb01.conf /etc/nginx/sites-available/paymentapp-lb
sudo ln -sf /etc/nginx/sites-available/paymentapp-lb /etc/nginx/sites-enabled/paymentapp-lb
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

#### 3) Confirm the LB can reach both web servers
From `Lb01`:
```bash
curl -sS -I http://3.95.194.118/ | head
curl -sS -I http://44.211.81.121/ | head
curl -sS -I http://127.0.0.1/ | head
```

## Load Balancer Testing (must do for rubric)
### 1) Confirm requests reach different backends
Your backend sets a header so you can verify which server served the request:
- `X-Served-By: Payment-Server-<hostname>:<port>`

Run repeatedly:
```bash
curl -s -I http://32.193.244.84/ | rg -i "x-served-by"
```
You should see values change between the `web01` and `web02` hostnames.

### 2) Confirm application works through the LB
1. Load: `http://32.193.244.84/`
2. Fill the payment form and run the currency conversion
3. Open: `http://32.193.244.84/dashboard`
4. Ensure dashboard data loads and filtering/search works.

### 3) Important note about SQLite + “seamless regardless of server”
SQLite data is stored in a DB file. For the dashboard to show the same payments no matter which backend serves the request, **both servers must use the same database file**.

Recommended (best): set the same shared path using `DB_PATH` on both servers (NFS/shared mount).

Fallback (if shared DB is not available): enable load balancer “sticky sessions” so one client usually hits the same backend.

## Error Handling
- Backend returns clear JSON errors for validation failures and API failures.
- Frontend shows user-friendly messages when:
  - Flutterwave key/config is missing
  - exchange-rate conversion fails
  - dashboard API calls fail

## Demo Video Checklist (keep under 2 minutes)
1. Show payment page loads (via LB URL)
2. Use currency converter and show Amount (RWF) being filled
3. Show dashboard loads and filter/search works
4. Show `X-Served-By` via `curl -I` (or browser dev tools) to prove load balancing

