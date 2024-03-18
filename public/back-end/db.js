const { Pool } = require('pg');
require('dotenv').config();

// Create a new Pool instance with database connection details from environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Attempt to connect to the database
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('PostgreSQL database connected successfully');
  release(); // Release the client back to the pool
});

// Export the pool object for database queries
module.exports = pool;


