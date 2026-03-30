require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const os = require('os');
const Database = require('./database');

const app = express();
const PORT = process.env.PORT || 8080;
const FLUTTERWAVE_PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const BASE_CURRENCY = process.env.BASE_CURRENCY || 'RWF';

// Initialize database
const db = new Database();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Add custom header to identify server instance
app.use((req, res, next) => {
    const host = os.hostname();
    res.setHeader('X-Served-By', `Payment-Server-${host}:${PORT}`);
    next();
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API Routes
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: {
            baseCurrency: BASE_CURRENCY,
            flutterwavePublicKey: FLUTTERWAVE_PUBLIC_KEY ? 'set' : 'missing',
            // Public key is safe to expose to browser at runtime.
            flutterwavePublicKeyValue: FLUTTERWAVE_PUBLIC_KEY || '',
        }
    });
});

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(email) {
    if (!isNonEmptyString(email)) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
    if (!isNonEmptyString(phone)) return false;
    const cleanPhone = phone.replace(/[\s-+]/g, '');
    return /^(\+?25)?07[2389]\d{7}$/.test(cleanPhone);
}

function isValidAmount(amount) {
    return typeof amount === 'number' && Number.isFinite(amount) && amount >= 100;
}

app.post('/api/payments', async (req, res) => {
    try {
        const { name, email, phone, amount, tx_ref } = req.body;

        if (!isNonEmptyString(name) || name.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Invalid name' });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email' });
        }
        if (!isValidPhone(phone)) {
            return res.status(400).json({ success: false, message: 'Invalid phone number' });
        }
        if (!isValidAmount(amount)) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        if (!isNonEmptyString(tx_ref)) {
            return res.status(400).json({ success: false, message: 'Missing tx_ref' });
        }
        
        // Save payment to database with pending status
        const paymentId = await db.savePayment({
            name,
            email,
            phone,
            amount,
            tx_ref,
            status: 'pending'
        });

        res.json({ 
            success: true, 
            paymentId,
            message: 'Payment initiated successfully' 
        });
    } catch (error) {
        console.error('Error saving payment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to initiate payment' 
        });
    }
});

// Update payment status after Flutterwave callback
app.post('/api/payments/verify', async (req, res) => {
    try {
        const { tx_ref, transaction_id, status } = req.body;

        if (!isNonEmptyString(tx_ref)) {
            return res.status(400).json({ success: false, message: 'Missing tx_ref' });
        }
        if (!isNonEmptyString(status)) {
            return res.status(400).json({ success: false, message: 'Missing status' });
        }
        
        // Update payment status in database
        await db.updatePaymentStatus(tx_ref, {
            status,
            transaction_id,
            verified_at: new Date().toISOString()
        });

        res.json({ 
            success: true, 
            message: 'Payment status updated successfully' 
        });
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update payment status' 
        });
    }
});

// Manual approval endpoint (for dashboard admin)
app.post('/api/payments/:id/approve', async (req, res) => {
    try {
        if (!ADMIN_TOKEN) {
            return res.status(500).json({ success: false, message: 'Server admin token is not set.' });
        }
        const token = String(req.headers['x-admin-token'] || '');
        if (token !== ADMIN_TOKEN) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const id = Number(req.params.id);
        const status = String(req.body.status || '').toLowerCase();
        const transaction_id = String(req.body.transaction_id || '');

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid payment id' });
        }
        if (!['successful', 'failed'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status (use successful or failed)' });
        }

        const changes = await db.updatePaymentStatusById(id, {
            status,
            transaction_id,
            verified_at: new Date().toISOString()
        });

        if (!changes) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }

        return res.json({ success: true, message: 'Payment updated' });
    } catch (error) {
        console.error('Error approving payment:', error);
        return res.status(500).json({ success: false, message: 'Failed to update payment' });
    }
});

// Get all payments for dashboard
app.get('/api/payments', async (req, res) => {
    try {
        const payments = await db.getAllPayments();
        res.json({ success: true, payments });
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch payments' 
        });
    }
});

// Get payment statistics
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getPaymentStats();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch statistics' 
        });
    }
});

// External API: exchange rates (cached)
const exchangeRateCache = new Map();
const EXCHANGE_RATE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(from, to) {
    return `${from}->${to}`;
}

app.get('/api/exchange-rate', async (req, res) => {
    try {
        const from = String(req.query.from || '').toUpperCase();
        const to = String(req.query.to || '').toUpperCase();

        if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
            return res.status(400).json({ success: false, message: 'Invalid currency code(s). Use 3-letter codes like RWF, USD.' });
        }
        if (from === to) {
            return res.json({ success: true, from, to, rate: 1, cached: true });
        }

        const key = cacheKey(from, to);
        const now = Date.now();
        const cached = exchangeRateCache.get(key);
        if (cached && now - cached.savedAt < EXCHANGE_RATE_TTL_MS) {
            return res.json({ success: true, from, to, rate: cached.rate, cached: true });
        }

        // Free external API (no key): open.er-api.com
        // Docs: https://www.exchangerate-api.com/docs/free
        const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`;
        const response = await axios.get(url, { timeout: 8000 });

        const rate = response?.data?.rates?.[to];
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
            return res.status(502).json({ success: false, message: 'Exchange rate service returned an invalid response.' });
        }

        exchangeRateCache.set(key, { rate, savedAt: now });
        return res.json({ success: true, from, to, rate, cached: false });
    } catch (error) {
        console.error('Error fetching exchange rate:', error?.message || error);
        return res.status(502).json({ success: false, message: 'Failed to fetch exchange rate. Please try again.' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Payment page: http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
});
