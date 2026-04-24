const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
const fs = require('fs');
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'empleados' ORDER BY ordinal_position")
    .then(r => {
        fs.writeFileSync('empleados_output.json', JSON.stringify(r.rows, null, 2));
        console.log('Done');
    })
    .catch(e => console.error(e.message))
    .finally(() => pool.end());
