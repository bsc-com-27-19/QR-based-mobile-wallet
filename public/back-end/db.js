const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "qr_db",
  password: "0002",
  port: 5432,
});

module.exports = {
    query: (text, params) => pool.query(text, params),
  };