const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
pool.query("SELECT * FROM empleados")
    .then(r => {
        console.log(JSON.stringify(r.rows));
    })
    .catch(e => console.error(e.message))
    .finally(() => pool.end());
