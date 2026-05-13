const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkRoles() {
  try {
    const res = await pool.query('SELECT * FROM roles');
    console.log('ROLES EN DB:');
    console.table(res.rows);
    
    const resEmps = await pool.query('SELECT e.nombre_display, e.rol_id, r.nombre as rol_nombre FROM empleados e JOIN roles r ON e.rol_id = r.id WHERE e.nombre_display LIKE $1', ['%Jhon%']);
    console.log('\nUSUARIO JHON:');
    console.table(resEmps.rows);
    
    await pool.end();
  } catch (err) {
    console.error(err);
  }
}

checkRoles();
