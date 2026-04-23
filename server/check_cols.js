const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE column_name LIKE '%nacimiento%'")
    .then(r => console.log(r.rows))
    .catch(e => console.error(e.message))
    .finally(() => pool.end());
