require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    try {
        console.log('Iniciando migración...');
        await pool.query("ALTER TABLE reservas ADD COLUMN tipo VARCHAR(50) DEFAULT 'CITA';");
        console.log('Columna tipo agregada.');
    } catch (e) { console.log('tipo ya existe o error:', e.message); }

    try {
        await pool.query("ALTER TABLE reservas ADD COLUMN subtipo_bloqueo VARCHAR(100);");
        console.log('Columna subtipo_bloqueo agregada.');
    } catch (e) { console.log('subtipo_bloqueo ya existe o error:', e.message); }

    pool.end();
}

migrate();
