const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Obtener todas las sucursales activas
app.get('/api/sucursales', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sucursales WHERE activo = true ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener sucursales' });
  }
});

// Obtener servicios activos
app.get('/api/servicios', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM servicios WHERE activo = true ORDER BY orden ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// Obtener clientes para el buscador del partner
app.get('/api/clientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, razon_social_nombres, apellidos, telefono, email FROM clientes ORDER BY razon_social_nombres');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// Obtener empleados que realizan servicios en una sucursal específica
app.get('/api/empleados/:sucursalId', async (req, res) => {
  const { sucursalId } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, nombres, apellidos, nombre_display FROM empleados WHERE (sucursal_id = $1 OR sucursal_id IS NULL) AND realiza_servicios = true AND activo = true ORDER BY nombres',
      [sucursalId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

// Obtener disponibilidad (Lógica simplificada para empezar)
app.get('/api/disponibilidad', async (req, res) => {
  const { sucursalId, empleadoId, fecha, duracion } = req.query;
  // TODO: Implementar lógica de slots reales basada en reservas existentes y horarios
  // Por ahora devolvemos slots de prueba cada 30 min entre 9am y 6pm
  const slots = [];
  const startHour = 9;
  const endHour = 18;

  for (let i = startHour; i < endHour; i++) {
    slots.push(`${i}:00`);
    slots.push(`${i}:30`);
  }

  res.json(slots);
});

// Crear una reserva
app.post('/api/reservas', async (req, res) => {
  const { cliente_id, empleado_id, servicio_id, sucursal_id, fecha_hora_inicio, fecha_hora_fin, notas_cliente } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO reservas (cliente_id, empleado_id, servicio_id, sucursal_id, fecha_hora_inicio, fecha_hora_fin, estado, notas_cliente, origen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [cliente_id || 1, empleado_id, servicio_id, sucursal_id, fecha_hora_inicio, fecha_hora_fin, 'PENDIENTE', notas_cliente, 'WEB_APP']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la reserva' });
  }
});

// Obtener todas las reservas de una sucursal para un día específico
app.get('/api/reservas/sucursal/:sucursalId/:fecha', async (req, res) => {
  const { sucursalId, fecha } = req.params;
  try {
    const result = await pool.query(
      `SELECT r.*, s.nombre as servicio_nombre, s.duracion_minutos, s.precio,
              c.razon_social_nombres as cliente_nombre, c.apellidos as cliente_apellidos
       FROM reservas r
       JOIN servicios s ON r.servicio_id = s.id
       LEFT JOIN clientes c ON r.cliente_id = c.id
       WHERE r.sucursal_id = $1 AND r.fecha_hora_inicio::date = $2
       ORDER BY r.fecha_hora_inicio`,
      [sucursalId, fecha]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener reservas del día' });
  }
});

// Actualizar una reserva (drag & drop, re-schedule, cambiar empleado o estado)
app.patch('/api/reservas/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const fields = Object.keys(updates);
  const values = Object.values(updates);

  if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

  const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

  try {
    const result = await pool.query(
      `UPDATE reservas SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la reserva' });
  }
});

// Eliminar/Anular una reserva
app.delete('/api/reservas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM reservas WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({ message: 'Reserva eliminada con éxito', deleted: result.rows[0] });
  } catch (err) {
    console.error('SERVER ERROR:', err.message, err.stack);
    res.status(500).json({ error: `Internal Server Error: ${err.message}` });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});
