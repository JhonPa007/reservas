const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function debug() {
  try {
    console.log('--- DEBUG USER & ROLES ---');
    
    // 1. Ver roles disponibles
    const roles = await pool.query('SELECT * FROM roles');
    console.log('Roles en DB:', roles.rows);
    
    // 2. Ver usuario Jhon Casas
    const user = await pool.query("SELECT id, nombres, email, rol_id FROM empleados WHERE nombres ILIKE '%Jhon%'");
    console.log('Usuario encontrado:', user.rows);
    
    if (user.rows.length > 0) {
      const rolId = user.rows[0].rol_id;
      // 3. Ver permisos del rol del usuario
      const permisos = await pool.query(`
        SELECT p.nombre 
        FROM rol_permisos rp 
        JOIN permisos p ON rp.permiso_id = p.id 
        WHERE rp.rol_id = $1
      `, [rolId]);
      console.log('Permisos del usuario:', permisos.rows.map(p => p.nombre));
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debug();
