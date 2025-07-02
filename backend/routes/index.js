const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../config/db'); // Asegúrate de que esta importación sea correcta
const authMiddleware = require('../middleware/auth');
const bcrypt = require('bcrypt');

// Serve HTML files
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Login.html'));
});

router.get('/Dashboard.html', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Dashboard.html'));
});

router.get('/Mi-Perfil.html', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Mi-Perfil.html'));
});

router.get('/Mis-Evaluaciones.html', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Mis-Evaluaciones.html'));
});

router.get('/Gestion-Captacion.html', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/Gestion-Captacion.html'));
});

// CSRF token endpoint
router.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Auth check endpoint
router.get('/auth-check', (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { email, password, _csrf } = req.body;
  try {
    const [users] = await db.query('SELECT id_usuario, correo_usuario, contraseña_usuario FROM Usuario WHERE correo_usuario = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos.' });
    }
    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.contraseña_usuario);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos.' });
    }
    const [personal] = await db.query('SELECT id_personal, id_puesto, nombre_personal, apaterno_personal, amaterno_personal FROM Personal WHERE id_usuario = ?', [user.id_usuario]);
    const [alumno] = await db.query('SELECT id_alumno FROM Alumno WHERE id_usuario = ?', [user.id_usuario]);
    let userType, roles = [], id_personal = null, id_puesto = null, nombre_completo = null;
    if (personal.length > 0) {
      userType = 'personal';
      id_personal = personal[0].id_personal;
      id_puesto = personal[0].id_puesto;
      nombre_completo = `${personal[0].nombre_personal} ${personal[0].apaterno_personal} ${personal[0].amaterno_personal || ''}`.trim();
      const [personalRoles] = await db.query(`
        SELECT r.id_rol, r.nombre_rol
        FROM Personal_Rol pr
        JOIN Rol r ON pr.id_rol = r.id_rol
        WHERE pr.id_personal = ?
      `, [id_personal]);
      roles = personalRoles.map(role => ({ id_rol: role.id_rol, nombre_rol: role.nombre_rol }));
    } else if (alumno.length > 0) {
        userType = 'alumno';
        const [alumnoDatos] = await db.query(`
            SELECT nombre_alumno, apaterno_alumno, amaterno_alumno
            FROM Alumno
            WHERE id_usuario = ?
        `, [user.id_usuario]);

        if (alumnoDatos.length > 0) {
            nombre_completo = `${alumnoDatos[0].nombre_alumno} ${alumnoDatos[0].apaterno_alumno} ${alumnoDatos[0].amaterno_alumno || ''}`.trim();
        }
    } else {
      return res.status(500).json({ success: false, message: 'Usuario no asociado a personal o alumno.' });
    }
    req.session.user = {
      id_usuario: user.id_usuario,
      email: user.correo_usuario,
      userType,
      id_personal,
      id_puesto,
      roles,
      nombre_completo
    };
    res.json({ success: true, userType, redirect: '/Dashboard.html' });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error al cerrar sesión.' });
    }
    res.clearCookie('connect.sid'); // << AÑADE ESTO para borrar cookie de sesión
    res.json({ success: true, redirect: '/' });
  });
});

// Evaluaciones pendientes endpoint
router.get('/evaluaciones-pendientes', authMiddleware, async (req, res) => {
  if (!req.session.user || req.session.user.userType !== 'personal') {
    return res.status(403).json({ success: false, message: 'No tienes permiso para acceder a esta información.' });
  }
  const id_personal = req.session.user.id_personal;
  try {
    const [evaluaciones] = await db.query(`
      SELECT 
        p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal,
        pu.id_puesto, pu.nombre_puesto,
        k.id_kpi, k.nombre_kpi,
        c.id_categoria_kpi, c.nombre_categoria_kpi,
        pc.porcentaje_categoria, k.meta_kpi, k.tipo_kpi,
        pk.resultado_kpi
        FROM Kpi k
        JOIN Categoria_Kpi c ON k.id_categoria_kpi = c.id_categoria_kpi
        JOIN Puesto_Categoria pc ON c.id_categoria_kpi = pc.id_categoria_kpi
        JOIN Puesto pu ON pu.id_puesto = pc.id_puesto
        JOIN Personal p ON pu.id_puesto = p.id_puesto
        JOIN Personal_Rol pr ON pr.id_rol = k.id_rol
        LEFT JOIN Puesto_Kpi pk ON pk.id_kpi = k.id_kpi AND pk.id_personal = p.id_personal AND pk.id_puesto = pu.id_puesto
        WHERE pr.id_personal = ?
 `, [id_personal]);
    const [evaluador] = await db.query(`
      SELECT nombre_personal, apaterno_personal, amaterno_personal FROM Personal WHERE id_personal = ?`, [id_personal]);
    const groupedEvaluations = evaluaciones.reduce((acc, row) => {
      const key = `${row.id_personal}_${row.id_puesto}`;
      if (!acc[key]) {
        acc[key] = { id_personal: row.id_personal,  id_puesto: row.id_puesto, nombre_completo: `${row.nombre_personal} ${row.apaterno_personal} ${row.amaterno_personal}`, nombre_puesto: row.nombre_puesto, categorias: {} };
      }
      if (!acc[key].categorias[row.id_categoria_kpi]) {
        acc[key].categorias[row.id_categoria_kpi] = { nombre_categoria: row.nombre_categoria_kpi, porcentaje_categoria: row.porcentaje_categoria, kpis: [] };
      }
      acc[key].categorias[row.id_categoria_kpi].kpis.push({ id_kpi: row.id_kpi, nombre_kpi: row.nombre_kpi, meta_kpi: row.meta_kpi, tipo_kpi: row.tipo_kpi, resultado_kpi: row.resultado_kpi });
      return acc;
    }, {});
    const evaluadorNombre = `${evaluador[0].nombre_personal} ${evaluador[0].apaterno_personal} ${evaluador[0].amaterno_personal || ''}`;
    res.json({ success: true, evaluaciones: Object.values(groupedEvaluations), userName: evaluadorNombre });
  } catch (error) {
    console.error('Error al obtener evaluaciones:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});


// Guardar múltiples resultados de KPIs
router.post('/guardar-multiples-resultados', authMiddleware, async (req, res) => {
  if (!req.session.user || req.session.user.userType !== 'personal') {
    return res.status(403).json({ success: false, message: 'No tienes permiso para guardar resultados.' });
  }

  const { id_puesto, resultados } = req.body;
  const id_personal_evaluador = req.session.user.id_personal;

  if (!Array.isArray(resultados) || resultados.length === 0) {
    return res.status(400).json({ success: false, message: 'No se enviaron resultados.' });
  }

  try {
    const id_personal_evaluado = req.body.id_personal; // 👈 envíalo desde el frontend

    let [evaluador] = await db.query('SELECT id_evaluador FROM Evaluador WHERE id_personal = ?', [id_personal_evaluador]);
    if (evaluador.length === 0) {
      await db.query('INSERT INTO Evaluador (id_personal) VALUES (?)', [id_personal_evaluador]);
      [evaluador] = await db.query('SELECT id_evaluador FROM Evaluador WHERE id_personal = ?', [id_personal_evaluado]);
    }
    const id_evaluador = evaluador[0].id_evaluador;

    for (const item of resultados) {
      const { id_kpi, resultado } = item;
      const [kpi] = await db.query('SELECT tipo_kpi, id_rol FROM Kpi WHERE id_kpi = ?', [id_kpi]);
      if (kpi.length === 0) continue;

      const tipo_kpi = kpi[0].tipo_kpi;
      const id_rol_kpi = kpi[0].id_rol;
      const parsedResultado = parseInt(resultado);

      if (isNaN(parsedResultado) || (tipo_kpi === 'Porcentaje' && (parsedResultado < 0 || parsedResultado > 100))) {
        continue;
      }

      const [rolValido] = await db.query('SELECT id_rol FROM Personal_Rol WHERE id_personal = ? AND id_rol = ?', [id_personal_evaluador, id_rol_kpi]);
      if (rolValido.length === 0) continue;

      await db.query(`
        INSERT INTO Puesto_Kpi (id_puesto, id_personal, id_kpi, resultado_kpi, id_evaluador)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE resultado_kpi = VALUES(resultado_kpi), id_evaluador = VALUES(id_evaluador)
        `, [id_puesto, id_personal_evaluado, id_kpi, parsedResultado, id_evaluador]);

    }

    res.json({ success: true, message: 'Todos los resultados se guardaron correctamente.' });
  } catch (error) {
    console.error('Error al guardar múltiples resultados:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor al guardar resultados.' });
  }
});


// NUEVAS RUTAS PARA GESTIÓN DE CAPTACIÓN

// Obtener grupos
router.get('/grupos', authMiddleware, async (req, res) => {
  try {
    const [grupos] = await db.query('SELECT id_grado_grupo, grado, grupo FROM Grado_grupo ORDER BY grado, grupo');
    res.json({ success: true, grupos });
  } catch (error) {
    console.error('Error al obtener grupos:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// Obtener alumnos por grupo
router.get('/alumnos-por-grupo/:id_grado_grupo', authMiddleware, async (req, res) => {
  const id_grado_grupo = req.params.id_grado_grupo;
  try {
    const [alumnos] = await db.query(`
      SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno,
       p.nombre_personal AS nombre_counselor, p.apaterno_personal AS apaterno_counselor
        FROM Alumno a
        LEFT JOIN Personal p ON a.id_personal = p.id_personal
        WHERE a.id_grado_grupo = ?
        ORDER BY a.apaterno_alumno, a.nombre_alumno

    `, [id_grado_grupo]);

    res.json({ success: true, alumnos });
  } catch (error) {
    console.error('Error al obtener alumnos por grupo:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});


// Obtener counselors por grupo
router.get('/counselors-por-grupo/:id_grado_grupo', authMiddleware, async (req, res) => {
  const id_grado_grupo = req.params.id_grado_grupo;
  try {
    // Obtener counselors (personal) asignados a alumnos de ese grupo sin repetir
    const [counselors] = await db.query(`
      SELECT DISTINCT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal
      FROM Alumno a
      JOIN Personal p ON a.id_personal = p.id_personal
      WHERE a.id_grado_grupo = ?
      ORDER BY p.apaterno_personal, p.nombre_personal
    `, [id_grado_grupo]);

    res.json({ success: true, counselors });
  } catch (error) {
    console.error('Error al obtener counselors por grupo:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});


// Obtener todos los talleres
router.get('/talleres', authMiddleware, async (req, res) => {
  try {
    const [talleres] = await db.query('SELECT id_taller, nombre_taller FROM Taller ORDER BY nombre_taller');
    res.json({ success: true, talleres });
  } catch (error) {
    console.error('Error al obtener talleres:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// Asignar taller a alumno
router.post('/asignar-taller', authMiddleware, async (req, res) => {
  const { id_alumno, id_taller } = req.body;
  try {
    await db.query(`
      INSERT INTO Personal_taller (id_personal, id_taller)
      SELECT a.id_personal, ? FROM Alumno a WHERE a.id_alumno = ?
      ON DUPLICATE KEY UPDATE id_taller = VALUES(id_taller)
    `, [id_taller, id_alumno]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al asignar taller:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// Obtener datos individuales de un alumno
router.get('/alumno/:id_alumno', authMiddleware, async (req, res) => {
  const { id_alumno } = req.params;
  try {
    const [alumno] = await db.query(`
      SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, a.telefono_alumno,
             g.grado, g.grupo,
             t.nombre_taller,
             p.nombre_personal AS nombre_counselor, p.apaterno_personal AS apaterno_counselor
      FROM Alumno a
      JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
      LEFT JOIN Personal_taller pt ON a.id_personal = pt.id_personal
      LEFT JOIN Taller t ON pt.id_taller = t.id_taller
      LEFT JOIN Personal p ON a.id_personal = p.id_personal
      WHERE a.id_alumno = ?`, [id_alumno]);

    res.json({ success: true, alumno: alumno[0] });
  } catch (error) {
    console.error('Error al obtener alumno:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

router.get('/debug', (req, res) => {
  res.send('Rutas funcionando');
});


module.exports = router;

