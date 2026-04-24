const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log("Añadiendo columna duracion_minutos...");
        await pool.query("ALTER TABLE reservas ADD COLUMN IF NOT EXISTS duracion_minutos INTEGER DEFAULT 30;");
        console.log("¡Columna añadida con éxito!");
        process.exit(0);
    } catch (err) {
        console.error("Error en migración:", err);
        process.exit(1);
    }
}

migrate();
