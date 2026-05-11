const express = require('express');
const { Pool, types } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

// Forzar a pg a retornar TIMESTAMP como string para evitar conversiones UTC automáticas
types.setTypeParser(1114, val => val);

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

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

// Middleware de Autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error(`ERROR JWT (${err.name}): ${err.message}`);
      return res.status(403).json({ error: `Sesión inválida: ${err.message}` });
    }
    req.user = user;
    next();
  });
};

// Middleware de Autorización para Reservas
const checkReservaPermiso = (requireWrite = false) => {
  return async (req, res, next) => {
    try {
      const { id: userId, rol_id, rol_nombre: rolTokenNombre } = req.user;
      
      let rolNombre = rolTokenNombre ? rolTokenNombre.trim().toLowerCase() : null;

      // Si no viene en el token, lo buscamos en la DB (compatibilidad con tokens viejos)
      if (!rolNombre) {
        const rolRes = await pool.query('SELECT nombre FROM roles WHERE id = $1', [rol_id]);
        if (rolRes.rows.length > 0) {
          rolNombre = rolRes.rows[0].nombre.trim().toLowerCase();
        }
      }

      console.log(`Usuario ${userId} (${rolNombre}) verificando ${requireWrite ? 'escritura' : 'lectura'}`);
      
      if (!rolNombre) {
        return res.status(403).json({ error: 'Rol no identificado' });
      }
      
      // Administrador y Cajero tienen acceso total
      if (rolNombre === 'administrador' || rolNombre === 'cajero' || rolNombre === 'admin') {
        return next();
      }
      
      if (requireWrite) {
        return res.status(403).json({ error: 'No tiene permisos para modificar reservas' });
      }
      
      // Para lectura, verificar si tiene el permiso reservas_lectura
      const permisoRes = await pool.query(`
        SELECT p.nombre 
        FROM rol_permisos rp 
        JOIN permisos p ON rp.permiso_id = p.id 
        WHERE rp.rol_id = $1 AND p.nombre = 'reservas_lectura'
      `, [rol_id]);
      
      if (permisoRes.rows.length > 0) {
        return next();
      }
      
      res.status(403).json({ error: 'No tiene permisos para ver reservas' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al verificar permisos' });
    }
  };
};

// --- AUTH ROUTES ---

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const result = await pool.query(`
      SELECT e.*, r.nombre as rol_nombre 
      FROM empleados e 
      JOIN roles r ON e.rol_id = r.id 
      WHERE e.email = $1 AND e.activo = true
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    
    // NOTA: Aquí se debería usar bcrypt.compare. 
    // Dado que hay hashes previos de Python (scrypt), esta validación fallará.
    // Como medida temporal para que el usuario pueda entrar, permitiré login directo si la pass coincide
    // O si es un hash que no conocemos, devolvemos error pero avisamos.
    
    let isValid = false;
    if (user.password.startsWith('scrypt:')) {
      try {
        // Formato: scrypt:N:r:p$salt$hash
        const parts = user.password.split(':');
        const n = parseInt(parts[1]);
        const r = parseInt(parts[2]);
        const remaining = parts[3].split('$');
        const p = parseInt(remaining[0]);
        const salt = remaining[1];
        const hash = remaining[2];

        // Aumentamos maxmem porque scrypt con N=32768 requiere más de lo predeterminado
        const derived = crypto.scryptSync(password, salt, 64, { 
          N: n, 
          r: r, 
          p: p, 
          maxmem: 128 * 1024 * 1024 
        });
        isValid = derived.toString('hex') === hash;
      } catch (err) {
        console.error('Error verificando hash scrypt:', err);
        isValid = false;
      }
    } else {
      isValid = await bcrypt.compare(password, user.password);
    }

    // SI LA CONTRASEÑA ES EXACTAMENTE IGUAL AL HASH (para desarrollo inicial si no se han hasheado)
    if (!isValid && password === user.password) isValid = true;

    if (!isValid) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, rol_id: user.rol_id, rol_nombre: user.rol_nombre, sucursal_id: user.sucursal_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nombres: user.nombres,
        apellidos: user.apellidos,
        nombre_display: user.nombre_display,
        email: user.email,
        rol_id: user.rol_id,
        rol_nombre: user.rol_nombre,
        sucursal_id: user.sucursal_id
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id, e.nombres, e.apellidos, e.nombre_display, e.email, e.rol_id, e.sucursal_id, r.nombre as rol_nombre 
      FROM empleados e 
      JOIN roles r ON e.rol_id = r.id 
      WHERE e.id = $1
    `, [req.user.id]);
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    
    const user = result.rows[0];
    
    // Obtener permisos
    const permisos = await pool.query(`
      SELECT p.nombre 
      FROM rol_permisos rp 
      JOIN permisos p ON rp.permiso_id = p.id 
      WHERE rp.rol_id = $1
    `, [user.rol_id]);
    
    res.json({
      ...user,
      permisos: permisos.rows.map(p => p.nombre)
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener datos de usuario' });
  }
});

app.get('/api/auth/debug', authenticateToken, async (req, res) => {
  try {
    const { id: userId, rol_id, rol_nombre: rolTokenNombre } = req.user;
    
    // Consultar DB para ver el estado actual real
    const userRes = await pool.query('SELECT nombres, rol_id FROM empleados WHERE id = $1', [userId]);
    const rolRes = await pool.query('SELECT nombre FROM roles WHERE id = $1', [rol_id]);
    const permisosRes = await pool.query(`
      SELECT p.nombre 
      FROM rol_permisos rp 
      JOIN permisos p ON rp.permiso_id = p.id 
      WHERE rp.rol_id = $1
    `, [rol_id]);

    res.json({
      token_data: req.user,
      db_user: userRes.rows[0],
      db_rol: rolRes.rows[0],
      db_permisos: permisosRes.rows.map(p => p.nombre),
      server_time: new Date().toISOString(),
      node_version: process.version
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener todas las sucursales activas
app.get('/api/health', async (req, res) => {
  try {
    const resSucs = await pool.query('SELECT COUNT(*) FROM sucursales');
    const resRes = await pool.query('SELECT COUNT(*) FROM reservas');
    const resEmps = await pool.query('SELECT COUNT(*) FROM empleados');
    const resRoles = await pool.query('SELECT id, nombre FROM roles');
    res.json({
      sucursales: resSucs.rows[0].count,
      reservas: resRes.rows[0].count,
      empleados: resEmps.rows[0].count,
      roles: resRoles.rows,
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

// Crear una reserva o bloqueo
app.post('/api/reservas', authenticateToken, checkReservaPermiso(true), async (req, res) => {
  const { cliente_id, empleado_id, servicio_id, sucursal_id, fecha_hora_inicio, fecha_hora_fin, notas_cliente, notas_internas, precio_cobrado, origen, tipo, subtipo_bloqueo, reserva_online_permitida } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO reservas (cliente_id, empleado_id, servicio_id, sucursal_id, fecha_hora_inicio, fecha_hora_fin, estado, notas_cliente, notas_internas, precio_cobrado, origen, tipo, subtipo_bloqueo, reserva_online_permitida) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
      [cliente_id || null, empleado_id, servicio_id, sucursal_id, fecha_hora_inicio, fecha_hora_fin, 'RESERVADA', notas_cliente, notas_internas, precio_cobrado || 0, origen || 'PARTNER', tipo || 'CITA', subtipo_bloqueo, reserva_online_permitida || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el registro' });
  }
});

// Obtener todas las reservas de una sucursal para un día específico
app.get('/api/reservas/sucursal/:sucursalId/:fecha', authenticateToken, checkReservaPermiso(false), async (req, res) => {
  const { sucursalId, fecha } = req.params;
  try {
    const resReservas = await pool.query(
      `SELECT r.*, s.nombre as servicio_nombre, s.duracion_minutos, s.precio,
              c.razon_social_nombres as cliente_nombre, c.apellidos as cliente_apellidos, c.telefono as cliente_telefono
       FROM reservas r
       LEFT JOIN servicios s ON r.servicio_id = s.id
       LEFT JOIN clientes c ON r.cliente_id = c.id
       WHERE r.sucursal_id = $1 
         AND r.fecha_hora_inicio::date <= $2 AND r.fecha_hora_fin::date >= $2
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
app.patch('/api/reservas/:id', authenticateToken, checkReservaPermiso(true), async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  console.log('PATCH reserva:', id, updates);
  const fields = Object.keys(updates);
  const values = Object.values(updates);
  if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
  const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
  try {
    const result = await pool.query(`UPDATE reservas SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`, [...values, id]);
    console.log('Reserva actualizada OK:', id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error PATCH reserva:', err.message);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

app.delete('/api/reservas/:id', authenticateToken, checkReservaPermiso(true), async (req, res) => {
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