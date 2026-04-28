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
app.get('/api/health', async (req, res) => {
  try {
    const resSucs = await pool.query('SELECT COUNT(*) FROM sucursales');
    const resRes = await pool.query('SELECT COUNT(*) FROM reservas');
    const resEmps = await pool.query('SELECT COUNT(*) FROM empleados');
    res.json({
      sucursales: resSucs.rows[0].count,
      reservas: resRes.rows[0].count,
      empleados: resEmps.rows[0].count,
      db_url_prefix: (process.env.DATABASE_URL || '').slice(0, 20)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const result = await pool.query(`SELECT c.id, c.razon_social_nombres, c.apellidos, c.telefono, c.email, c.fecha_nacimiento, c.fecha_registro, (SELECT COUNT(*) FROM reservas r WHERE r.cliente_id = c.id AND r.estado = 'INASISTENCIA') as total_inasistencias FROM clientes c ORDER BY c.razon_social_nombres`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// Creación rápida de cliente (Réplica del sistema central)
app.post('/api/clientes', async (req, res) => {
  const { razon_social_nombres, apellidos, telefono, fecha_nacimiento } = req.body;
  const nombre = (razon_social_nombres || '').trim();
  const tel = (telefono || '').trim();

  if (!nombre || !tel) {
    return res.status(400).json({ success: false, message: 'Nombre y Teléfono son obligatorios.' });
  }

  try {
    // Verificar duplicados
    const check = await pool.query('SELECT id FROM clientes WHERE telefono = $1', [tel]);
    if (check.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Ya existe un cliente con ese teléfono.' });
    }

    const result = await pool.query(
      'INSERT INTO clientes (razon_social_nombres, apellidos, telefono, fecha_nacimiento, fecha_registro) VALUES ($1, $2, $3, $4, CURRENT_DATE) RETURNING id',
      [nombre, apellidos || '', tel, fecha_nacimiento || null]
    );

    res.status(201).json({
      success: true,
      cliente: {
        id: result.rows[0].id,
        razon_social_nombres: nombre,
        apellidos: apellidos || '',
        telefono: tel
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al crear el cliente.' });
  }
});

// Actualizar datos de cliente
app.patch('/api/clientes/:id', async (req, res) => {
  const { id } = req.params;
  const { razon_social_nombres, apellidos, telefono, email, fecha_nacimiento } = req.body;
  try {
    const result = await pool.query(
      'UPDATE clientes SET razon_social_nombres = $1, apellidos = $2, telefono = $3, email = $4, fecha_nacimiento = $5 WHERE id = $6 RETURNING *',
      [razon_social_nombres, apellidos, telefono, email, fecha_nacimiento || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

// Obtener empleados que realizan servicios
app.get('/api/empleados/:sucursalId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombres, apellidos, nombre_display FROM empleados WHERE realiza_servicios = true AND activo = true ORDER BY nombres'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

// Crear una reserva
app.post('/api/reservas', async (req, res) => {
  const { cliente_id, empleado_id, servicio_id, sucursal_id, fecha_hora_inicio, fecha_hora_fin, notas_cliente, notas_internas, precio_cobrado, origen } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO reservas (cliente_id, empleado_id, servicio_id, sucursal_id, fecha_hora_inicio, fecha_hora_fin, estado, notas_cliente, notas_internas, precio_cobrado, origen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [cliente_id || 1, empleado_id, servicio_id, sucursal_id, fecha_hora_inicio, fecha_hora_fin, 'RESERVADA', notas_cliente, notas_internas, precio_cobrado || 0, origen || 'PARTNER']
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
    const resReservas = await pool.query(
      `SELECT r.*, s.nombre as servicio_nombre, s.duracion_minutos, s.precio,
              c.razon_social_nombres as cliente_nombre, c.apellidos as cliente_apellidos
       FROM reservas r
       LEFT JOIN servicios s ON r.servicio_id = s.id
       LEFT JOIN clientes c ON r.cliente_id = c.id
       WHERE r.sucursal_id = $1 
         AND r.fecha_hora_inicio::date = $2
       ORDER BY r.fecha_hora_inicio`,
      [sucursalId, fecha]
    );

    const [y, m, d] = fecha.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();

    const resHorarios = await pool.query(
      'SELECT id, empleado_id, hora_inicio, hora_fin FROM horarios_empleados WHERE fecha = $1',
      [fecha]
    );

    // CRÍTICO: Obtener todos los horarios recurrentes de la tabla semanal real
    const resRecurrentes = await pool.query(
      'SELECT id, empleado_id, dia_semana, hora_inicio, hora_fin FROM horarios_recurrentes WHERE dia_semana = $1',
      [dayOfWeek]
    );

    const summary = {};
    resRecurrentes.rows.forEach(r => {
      summary[r.empleado_id] = (summary[r.empleado_id] || 0) + 1;
    });

    res.json({
      reservas: resReservas.rows,
      horarios: resHorarios.rows,
      recurrentes: resRecurrentes.rows,
      debug: {
        sucursalId,
        fecha,
        dayOfWeek,
        dbDayCount: resRecurrentes.rows.length,
        dbPrefix: (process.env.DATABASE_URL || '').substring(0, 20),
        summary
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener datos del día' });
  }
});

// Otros endpoints necesarios
app.patch('/api/reservas/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const fields = Object.keys(updates);
  const values = Object.values(updates);
  if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
  const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
  try {
    const result = await pool.query(`UPDATE reservas SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`, [...values, id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

app.delete('/api/reservas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM reservas WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

app.get('/api/equipo', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM empleados WHERE activo = true ORDER BY nombres');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener equipo' });
  }
});

app.post('/api/equipo/horarios-recurrentes', async (req, res) => {
  const { empleado_id, sucursal_id, horarios } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM horarios_recurrentes WHERE empleado_id = $1 AND sucursal_id = $2', [empleado_id, sucursal_id]);
    for (const h of horarios) {
      await client.query(
        'INSERT INTO horarios_recurrentes (empleado_id, sucursal_id, dia_semana, hora_inicio, hora_fin) VALUES ($1, $2, $3, $4, $5)',
        [empleado_id, sucursal_id, h.dia_semana, h.hora_inicio, h.hora_fin]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al guardar' });
  } finally {
    client.release();
  }
});

app.get('/api/dashboard-stats', async (req, res) => {
  const { sucursalId } = req.query;
  try {
    // 1. Actividad de citas (Últimas 10)
    const recentActivity = await pool.query(`
      SELECT r.*, s.nombre as servicio_nombre, e.nombre_display as empleado_nombre, c.razon_social_nombres as cliente_nombre
      FROM reservas r
      JOIN servicios s ON r.servicio_id = s.id
      JOIN empleados e ON r.empleado_id = e.id
      LEFT JOIN clientes c ON r.cliente_id = c.id
      WHERE r.sucursal_id = $1
      ORDER BY r.id DESC
      LIMIT 10
    `, [sucursalId]);

    res.json({
      recentActivity: recentActivity.rows,
      salesGraph: [],
      upcomingGraph: [],
      topServices: [],
      topStaff: [],
      summary: { totalVentas7d: 0, totalCitas7d: 0, proximasCitas: 0 }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error stats' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});