const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        // Create database file in the data directory
        const dbPath = process.env.DB_PATH || path.join(__dirname, 'payments.db');
        this.db = new sqlite3.Database(dbPath);
        this.init();
    }

    // Initialize database tables
    init() {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                amount REAL NOT NULL,
                tx_ref TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'pending',
                transaction_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                verified_at DATETIME
            )
        `;

        this.db.run(createTableQuery, (err) => {
            if (err) {
                console.error('Error creating payments table:', err);
            } else {
                console.log('Database initialized successfully');
            }
        });
    }

    // Save new payment to database
    savePayment(paymentData) {
        return new Promise((resolve, reject) => {
            const { name, email, phone, amount, tx_ref, status } = paymentData;
            
            const query = `
                INSERT INTO payments (name, email, phone, amount, tx_ref, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [name, email, phone, amount, tx_ref, status], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // Update payment status after verification
    updatePaymentStatus(tx_ref, updateData) {
        return new Promise((resolve, reject) => {
            const { status, transaction_id, verified_at } = updateData;
            
            const query = `
                UPDATE payments 
                SET status = ?, transaction_id = ?, verified_at = ?
                WHERE tx_ref = ?
            `;

            this.db.run(query, [status, transaction_id, verified_at, tx_ref], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // Admin/manual approval by id (dashboard action)
    updatePaymentStatusById(id, updateData) {
        return new Promise((resolve, reject) => {
            const { status, transaction_id, verified_at } = updateData;

            const query = `
                UPDATE payments
                SET status = ?, transaction_id = ?, verified_at = ?
                WHERE id = ?
            `;

            this.db.run(query, [status, transaction_id, verified_at, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // Get all payments (for dashboard)
    getAllPayments() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM payments 
                ORDER BY created_at DESC
            `;

            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get payment statistics
    getPaymentStats() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total_payments,
                    COUNT(CASE WHEN status = 'successful' THEN 1 END) as successful_payments,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
                    SUM(CASE WHEN status = 'successful' THEN amount ELSE 0 END) as total_successful_amount,
                    SUM(amount) as total_amount
                FROM payments
            `;

            this.db.get(query, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Close database connection
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Database connection closed');
            }
        });
    }
}

module.exports = Database;
