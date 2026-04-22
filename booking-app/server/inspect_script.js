const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    const result = await pool.query('SELECT id, nombres, apellidos, nombre_display, sucursal_id, realiza_servicios, activo FROM empleados');
    fs.writeFileSync('empleados_output.json', JSON.stringify(result.rows, null, 2));
    process.exit(0);
}
inspect();
