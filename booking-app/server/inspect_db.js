const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    try {
        console.log('--- TABLES ---');
        const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log(tables.rows.map(r => r.table_name));

        for (const table of tables.rows) {
            console.log(`\n--- COLUMNS FOR ${table.table_name} ---`);
            const columns = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table.table_name}'`);
            console.log(columns.rows.map(c => `${c.column_name} (${c.data_type})`));
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

inspect();
