const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query('SELECT * FROM sucursales').then(res => { fs.writeFileSync('sucursales.json', JSON.stringify(res.rows, null, 2)); process.exit(0); });
