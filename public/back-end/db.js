const { Pool } = require("pg");

const pool = new Pool({
  user: "izepay_x9n8_user",
  host: "dpg-cpl9efn109ks73dofj1g-a",
  database: "izepay_x9n8",
  password: "1oNyWd4iFwvnfzy4W09lxM3sFdeppeBT",
  port: 5432,
  
});

module.exports = {
    query: (text, params) => pool.query(text, params),
  };