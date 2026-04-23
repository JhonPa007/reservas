const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
pool.query("SELECT id, nombres, apellidos, nombre_display FROM empleados")
    .then(r => {
        r.rows.forEach(e => {
            console.log(`ID: ${e.id} | Nombres: "${e.nombres}" | Display: "${e.nombre_display}"`);
        });
    })
    .catch(e => console.error(e.message))
    .finally(() => pool.end());
