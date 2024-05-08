const db = require('./db'); // Assuming this file sets up the database connection
const pgp = require('pg-promise')();

// Define the createTables function
async function createTables() {
  try {
    // Create tables if they don't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        profile_picture BYTEA,
        qrcode BYTEA
      );
    `);

    console.log('Tables created successfully.');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    pgp.end();
  }
}

// Export the createTables function
module.exports = { createTables };
