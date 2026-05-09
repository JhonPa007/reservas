const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    // 1. Crear el nuevo permiso de lectura
    await pool.query("INSERT INTO permisos (nombre, descripcion) VALUES ('reservas_lectura', 'Acceso de solo lectura a las reservas') ON CONFLICT DO NOTHING");
    
    // 2. Obtener el ID del permiso de lectura
    const permisoRes = await pool.query("SELECT id FROM permisos WHERE nombre = 'reservas_lectura'");
    if (permisoRes.rows.length === 0) {
        console.log("No se pudo crear o encontrar el permiso 'reservas_lectura'");
        return;
    }
    const permisoLecturaId = permisoRes.rows[0].id;
    
    // 3. Obtener roles
    const rolesRes = await pool.query("SELECT id, nombre FROM roles");
    const roles = rolesRes.rows;
    
    const colaborador = roles.find(r => r.nombre.toLowerCase() === 'colaborador');
    
    // 4. Asignar permiso al colaborador
    if (colaborador) {
      await pool.query("INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [colaborador.id, permisoLecturaId]);
      console.log('Permiso asignado a Colaborador');
    }

    console.log('Base de datos actualizada con éxito');
  } catch (e) {
    console.error('Error actualizando DB:', e);
  } finally {
    await pool.end();
  }
}

run();
