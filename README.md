## PaymentApp – Playing Around with APIs

PaymentApp is a small payment platform that demonstrates **real‑world API integration**, **data persistence**, and **deployment behind an Nginx load balancer**.

- **Collect payments** via Flutterwave Checkout
- **Convert currencies** using a public exchange‑rate API
- **View and manage payments** from an admin dashboard (filter/search/approve)
- **Run in production** on two web servers behind an Nginx load balancer

---

## Live deployment

- **Website URL**: `http://32.193.244.84/`
- **Dashboard**: `http://32.193.244.84/dashboard`
- **Demo video**: _add your video link here_

---

## APIs and external services

- **Flutterwave Checkout** (payments)  
  - Docs: https://developer.flutterwave.com/docs/flutterwave-checkout  
  - This project uses **Flutterwave TEST keys** only (no real charges).

- **Exchange rates via open.er-api.com** (currency conversion)  
  - Docs: https://www.exchangerate-api.com/docs/free  
  - Backend endpoint used: `GET /api/exchange-rate?from=USD&to=RWF`

---

## Security and environment variables

Never commit secrets to GitHub. Configure them via a local `.env` file.

- Copy the example file:

```bash
cp .env.example .env
```

- Required variables:
  - `FLUTTERWAVE_PUBLIC_KEY`
  - `FLUTTERWAVE_SECRET_KEY` (for possible server‑side verification)
  - `ADMIN_TOKEN` (for dashboard admin actions)
  - `PORT` (defaults to `8080`)
  - `BASE_CURRENCY` (defaults to `RWF`)

> `.env` must **not** be committed to the repository.

---

## Project structure

- `server.js` – Express backend, API routes, middleware, and integration with external APIs
- `database.js` – SQLite schema + queries
- `public/` – frontend pages and JavaScript
  - `index.html` + `payment.js` – payment form + currency converter
  - `dashboard.html` + `dashboard.js` – dashboard table, filtering, search, and approval UI
- `deploy/` – Nginx + systemd configs for web servers and load balancer

---

## Local development

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

```bash
cp .env.example .env
nano .env   # fill in keys and tokens
```

### 3) Run the app locally

```bash
npm run dev
```

Open in your browser:

- Payment page: `http://localhost:8080/`
- Dashboard: `http://localhost:8080/dashboard`

### 4) Try the external API

On the payment page:

1. Choose a currency (USD/EUR/GBP/KES/TZS/UGX)
2. Enter an amount
3. Click **Convert to RWF**

The frontend calls `GET /api/exchange-rate` on the backend, which in turn calls **open.er-api.com** and fills the **Amount (RWF)** field.

---

## Deployment to the provided servers

You have:

- **web01**: `3.95.194.118`
- **web02**: `44.211.81.121`
- **load balancer (lb01)**: `32.193.244.84`

### A) Deploy on `web01` and `web02` (Node.js + systemd + Nginx)

Do these steps on **both web servers**.

#### 1) Install dependencies

```bash
sudo apt update
sudo apt install -y git nginx nodejs npm
```

#### 2) Clone the project to `/opt/paymentapp`

```bash
sudo rm -rf /opt/paymentapp
sudo git clone https://github.com/Pascali-ne/PaymentApp_Project.git /opt/paymentapp
sudo chown -R "$USER":"$USER" /opt/paymentapp
```

#### 3) Install Node dependencies

```bash
cd /opt/paymentapp
npm ci --omit=dev
```

#### 4) Configure `.env` on each web server

```bash
cd /opt/paymentapp
sudo cp .env.example .env
sudo nano .env
```

Set at least:

- `FLUTTERWAVE_PUBLIC_KEY`
- `ADMIN_TOKEN`
- `PORT=8080`
- `BASE_CURRENCY=RWF`

#### 5) Create a persistent SQLite directory

The systemd service uses `DB_PATH=/var/lib/paymentapp/payments.db` so data is stored outside the repo.

```bash
sudo mkdir -p /var/lib/paymentapp
sudo chown -R www-data:www-data /var/lib/paymentapp
```

#### 6) Install and enable the systemd service

```bash
sudo cp /opt/paymentapp/deploy/paymentapp.service /etc/systemd/system/paymentapp.service
sudo systemctl daemon-reload
sudo systemctl enable --now paymentapp
sudo systemctl status paymentapp --no-pager
```

#### 7) Configure Nginx reverse proxy

```bash
sudo cp /opt/paymentapp/deploy/nginx-web01-web02.conf /etc/nginx/sites-available/paymentapp
sudo ln -sf /etc/nginx/sites-available/paymentapp /etc/nginx/sites-enabled/paymentapp
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Nginx forwards `http://<web-server-ip>/` to `http://127.0.0.1:8080/` where the Node app is running.

#### 8) Quick health checks (on each web server)

```bash
curl -sS -I http://127.0.0.1:8080/ | head
curl -sS -I http://127.0.0.1/ | head
```

You should see `HTTP/1.1 200 OK` and `X-Served-By` from that server.

---

### B) Configure the load balancer (`lb01`)

#### 1) Install Nginx

```bash
sudo apt update
sudo apt install -y nginx git
```

#### 2) Clone the project and install the LB config

```bash
sudo rm -rf /opt/paymentapp
sudo git clone https://github.com/Pascali-ne/PaymentApp_Project.git /opt/paymentapp

sudo cp /opt/paymentapp/deploy/nginx-lb01.conf /etc/nginx/sites-available/paymentapp-lb
sudo ln -sf /etc/nginx/sites-available/paymentapp-lb /etc/nginx/sites-enabled/paymentapp-lb
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

This config defines `upstream paymentapp_backend` with both web server IPs and proxies requests from `lb01` to them.

#### 3) Confirm the LB can reach both web servers

```bash
curl -sS -I http://3.95.194.118/ | head
curl -sS -I http://44.211.81.121/ | head
curl -sS -I http://127.0.0.1/ | head
```

---

## Load balancer testing (for the rubric)

### 1) Confirm requests hit different backends

Each web server adds a header:

- `X-Served-By: <hostname>`

From `lb01` (or your laptop), run multiple times:

```bash
curl -sSI http://32.193.244.84/ | grep -i x-served-by
```

You should see it alternate between `6908-web-01` and `6908-web-02`.

### 2) Confirm application works through the LB

Using a browser:

1. Open `http://32.193.244.84/`
2. Fill the payment form and run the currency conversion
3. Optionally start the Flutterwave checkout flow
4. Open `http://32.193.244.84/dashboard`
5. Verify that payments load and filtering/search work

---

## Error handling

- The backend validates input (email, phone, amount, `tx_ref`) and returns clear JSON error messages.
- External API failures (exchange‑rate API) return user‑friendly error messages instead of crashing.
- The frontend surfaces errors for:
  - Missing/misconfigured Flutterwave keys
  - Failed currency conversion
  - Dashboard API failures

---

## Demo video checklist

To match the rubric and keep the video under **2 minutes**:

1. Show the payment page loading via the LB URL (`http://32.193.244.84/`).
2. Demonstrate currency conversion using the external exchange‑rate API.
3. Trigger the Flutterwave checkout window.
4. Open the dashboard, show payments, and use search/filter.
5. In a terminal, run `curl -sSI http://32.193.244.84/ | grep -i x-served-by` a few times to prove that the load balancer distributes traffic across `web01` and `web02`.
