const db = require('./db'); // Assuming this file sets up the database connection

// Define the createTables function
async function createTables() {
    try {
        // Create tables if they don't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL, -- User's email
                username VARCHAR(255) UNIQUE NOT NULL, -- User's username
                password TEXT NOT NULL, -- Hashed password
                client_id VARCHAR(255) NOT NULL, -- PayPal client ID
                secret_key TEXT NOT NULL, -- PayPal secret key
                card_name VARCHAR(255), -- Name on the card
                card_number VARCHAR(19), -- Card number (PAN)
                card_security_code VARCHAR(4), -- Card security code (CVV or CVC)
                card_expiry VARCHAR(7), -- Card expiration date in format YYYY-MM
                session_id VARCHAR(255), -- Session ID to track user sessions
                balance DECIMAL(10, 2) DEFAULT 50.00 -- User balance with default value of 50
            );
        `);
        
        console.log('Tables created successfully.');
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}

// Export the createTables function
module.exports = { createTables };
