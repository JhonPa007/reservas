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
      db_url_prefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0, 20) : 'not defined'
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
    const result = await pool.query('SELECT id, razon_social_nombres, apellidos, telefono, email FROM clientes ORDER BY razon_social_nombres');
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
  const { razon_social_nombres, apellidos, telefono, email } = req.body;
  try {
    const result = await pool.query(
      'UPDATE clientes SET razon_social_nombres = $1, apellidos = $2, telefono = $3, email = $4 WHERE id = $5 RETURNING *',
      [razon_social_nombres, apellidos, telefono, email, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

// Obtener empleados que realizan servicios en una sucursal específica
app.get('/api/empleados/:sucursalId', async (req, res) => {
  const { sucursalId } = req.params;
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

// Obtener horarios/turnos de un empleado para un día
app.get('/api/horarios/:empleadoId/:fecha', async (req, res) => {
  const { empleadoId, fecha } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, hora_inicio, hora_fin FROM horarios_empleados WHERE empleado_id = $1 AND fecha = $2 ORDER BY hora_inicio',
      [empleadoId, fecha]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener horarios' });
  }
});

// Guardar turnos (Elimina anteriores y guarda nuevos para ese día)
app.post('/api/horarios', async (req, res) => {
  const { empleado_id, sucursal_id, fecha, intervalos } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Eliminar turnos existentes para ese día
    await client.query(
      'DELETE FROM horarios_empleados WHERE empleado_id = $1 AND fecha = $2 AND sucursal_id = $3',
      [empleado_id, fecha, sucursal_id]
    );

    // Insertar nuevos intervalos
    for (const interval of intervalos) {
      await client.query(
        'INSERT INTO horarios_empleados (empleado_id, sucursal_id, fecha, hora_inicio, hora_fin) VALUES ($1, $2, $3, $4, $5)',
        [empleado_id, sucursal_id, fecha, interval.hora_inicio, interval.hora_fin]
      );
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'Turnos actualizados' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al guardar turnos' });
  } finally {
    client.release();
  }
});

// Obtener todas las reservas de una sucursal para un día específico
app.get('/api/reservas/sucursal/:sucursalId/:fecha', async (req, res) => {
  const { sucursalId, fecha } = req.params;
  try {
    // También obtenemos los horarios para saber qué zonas bloquear
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

    console.log(`[GET /api/reservas] Sucursal: ${sucursalId}, Fecha: ${fecha}, Encontradas: ${resReservas.rows.length}`);

    // Extraemos el día de la semana de forma manual para evitar líos de UTC (YYYY-MM-DD -> 0=Dom)
    const [y, m, d] = fecha.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();

    const resHorarios = await pool.query(
      'SELECT id, empleado_id, hora_inicio, hora_fin FROM horarios_empleados WHERE fecha = $1',
      [fecha]
    );

    const resRecurrentes = await pool.query(
      'SELECT id, empleado_id, hora_inicio, hora_fin FROM horarios_empleado WHERE dia_semana = $1',
      [dayOfWeek]
    );

    res.json({
      reservas: resReservas.rows,
      horarios: resHorarios.rows,
      recurrentes: resRecurrentes.rows,
      debug: {
        sucursalId,
        fecha,
        count: resReservas.rows.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener datos del día' });
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

// Obtener estadísticas para el Dashboard
// Gestión de Miembros del Equipo
app.get('/api/equipo', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM empleados WHERE activo = true ORDER BY nombres');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener equipo' });
  }
});

app.post('/api/equipo/miembros', async (req, res) => {
  const { nombres, apellidos, nombre_display, email, telefono, dni, sucursal_id, realizar_servicios } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO empleados (nombres, apellidos, nombre_display, email, telefono, dni, sucursal_id, realiza_servicios, activo) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING *`,
      [nombres, apellidos, nombre_display || `${nombres} ${apellidos}`, email, telefono, dni, sucursal_id || 1, realizar_servicios !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear miembro' });
  }
});

// Guardar Horarios Recurrentes (Semanal)
app.post('/api/equipo/horarios-recurrentes', async (req, res) => {
  const { empleado_id, sucursal_id, horarios } = req.body; // horarios: [{dia_semana, hora_inicio, hora_fin}]
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
    console.error(err);
    res.status(500).json({ error: 'Error al guardar horarios recurrentes' });
  } finally {
    client.release();
  }
});

app.get('/api/equipo/horarios-recurrentes/:empleadoId', async (req, res) => {
  const { empleadoId } = req.params;
  try {
    const result = await pool.query('SELECT * FROM horarios_recurrentes WHERE empleado_id = $1 ORDER BY dia_semana, hora_inicio', [empleadoId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener horarios' });
  }
});

app.get('/api/dashboard-stats', async (req, res) => {
  const { sucursalId } = req.query;
  try {
    // 1. Ventas recientes (Últimos 7 días) y gráfico
    const sales7Days = await pool.query(`
      SELECT 
        TO_CHAR(d, 'YYYY-MM-DD') as fecha,
        COALESCE(SUM(r.precio_cobrado), 0) as ventas,
        COUNT(r.id) as citas
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
      LEFT JOIN reservas r ON r.fecha_hora_inicio::date = d::date AND r.sucursal_id = $1 AND r.estado != 'CANCELADA'
      GROUP BY d
      ORDER BY d
    `, [sucursalId]);

    // 2. Próximas citas (Próximos 7 días)
    const upcoming7Days = await pool.query(`
      SELECT 
        TO_CHAR(d, 'YYYY-MM-DD') as fecha,
        COUNT(CASE WHEN r.estado != 'CANCELADA' THEN 1 END) as confirmado,
        COUNT(CASE WHEN r.estado = 'CANCELADA' THEN 1 END) as cancelada
      FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '6 days', '1 day') d
      LEFT JOIN reservas r ON r.fecha_hora_inicio::date = d::date AND r.sucursal_id = $1
      GROUP BY d
      ORDER BY d
    `, [sucursalId]);

    // 3. Actividad de citas (Últimas 10)
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

    // 4. Mejores servicios (Este mes vs Anterior)
    const topServices = await pool.query(`
      WITH current_month AS (
        SELECT servicio_id, SUM(precio_cobrado) as total
        FROM reservas 
        WHERE sucursal_id = $1 AND fecha_hora_inicio >= date_trunc('month', CURRENT_DATE)
        GROUP BY servicio_id
      ), last_month AS (
        SELECT servicio_id, SUM(precio_cobrado) as total
        FROM reservas 
        WHERE sucursal_id = $1 AND fecha_hora_inicio >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
          AND fecha_hora_inicio < date_trunc('month', CURRENT_DATE)
        GROUP BY servicio_id
      )
      SELECT s.nombre, COALESCE(cm.total, 0) as este_mes, COALESCE(lm.total, 0) as ultimo_mes
      FROM servicios s
      LEFT JOIN current_month cm ON s.id = cm.servicio_id
      LEFT JOIN last_month lm ON s.id = lm.servicio_id
      WHERE cm.total > 0 OR lm.total > 0
      ORDER BY este_mes DESC
      LIMIT 5
    `, [sucursalId]);

    // 5. Mejor miembro del equipo (Este mes vs Anterior)
    const topStaff = await pool.query(`
      WITH current_month AS (
        SELECT empleado_id, SUM(precio_cobrado) as total
        FROM reservas 
        WHERE sucursal_id = $1 AND fecha_hora_inicio >= date_trunc('month', CURRENT_DATE)
        GROUP BY empleado_id
      ), last_month AS (
        SELECT empleado_id, SUM(precio_cobrado) as total
        FROM reservas 
        WHERE sucursal_id = $1 AND fecha_hora_inicio >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
          AND fecha_hora_inicio < date_trunc('month', CURRENT_DATE)
        GROUP BY empleado_id
      )
      SELECT e.nombre_display as nombre, COALESCE(cm.total, 0) as este_mes, COALESCE(lm.total, 0) as ultimo_mes
      FROM empleados e
      LEFT JOIN current_month cm ON e.id = cm.empleado_id
      LEFT JOIN last_month lm ON e.id = lm.empleado_id
      WHERE (cm.total > 0 OR lm.total > 0) AND e.activo = true
      ORDER BY este_mes DESC
    `, [sucursalId]);

    res.json({
      salesGraph: sales7Days.rows,
      upcomingGraph: upcoming7Days.rows,
      recentActivity: recentActivity.rows,
      topServices: topServices.rows,
      topStaff: topStaff.rows,
      summary: {
        totalVentas7d: sales7Days.rows.reduce((a, b) => a + parseFloat(b.ventas), 0),
        totalCitas7d: sales7Days.rows.reduce((a, b) => a + parseInt(b.citas), 0),
        proximasCitas: upcoming7Days.rows.reduce((a, b) => a + parseInt(b.confirmado), 0)
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
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
