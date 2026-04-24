
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: "postgresql://postgres:JbCjfwFkrmmbuQdkFpCWGvNEbmqCUldc@gondola.proxy.rlwy.net:19958/railway",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});

async function check(retry = 3) {
    try {
        const today = '2026-04-24';
        console.log('--- SUCURSALES ---');
        const sucs = await pool.query('SELECT id, nombre FROM sucursales');
        console.table(sucs.rows);

        console.log('--- EMPLEADOS ---');
        const emps = await pool.query('SELECT id, nombres, sucursal_id FROM empleados WHERE activo = true');
        console.table(emps.rows);

        console.log('--- RESERVAS HOY ---');
        const res = await pool.query('SELECT id, cliente_id, empleado_id, sucursal_id, fecha_hora_inicio FROM reservas WHERE fecha_hora_inicio::date = $1', [today]);
        console.table(res.rows);

        await pool.end();
    } catch (err) {
        console.error('Error:', err.message);
        if (retry > 0) {
            console.log(`Reintentando... (${retry} restantes)`);
            setTimeout(() => check(retry - 1), 2000);
        } else {
            process.exit(1);
        }
    }
}

check();
