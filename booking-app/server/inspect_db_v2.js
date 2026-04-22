const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    let output = '';
    try {
        output += '--- TABLES ---\n';
        const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        output += tables.rows.map(r => r.table_name).join(', ') + '\n';

        for (const table of tables.rows) {
            output += `\n--- COLUMNS FOR ${table.table_name} ---\n`;
            const columns = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table.table_name}'`);
            output += columns.rows.map(c => `${c.column_name} (${c.data_type})`).join('\n') + '\n';
        }
        fs.writeFileSync('schema_full.txt', output);
        console.log('Schema saved to schema_full.txt');
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

inspect();
