const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log("Añadiendo columna 'orden' a la tabla 'empleados'...");
        await pool.query("ALTER TABLE empleados ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0;");
        console.log("¡Columna 'orden' añadida con éxito!");
        process.exit(0);
    } catch (err) {
        console.error("Error en migración:", err);
        process.exit(1);
    }
}

migrate();
