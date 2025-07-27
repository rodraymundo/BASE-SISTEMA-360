const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../config/db'); // Asegúrate de que esta importación sea correcta
const authMiddleware = require('../middleware/auth');
const bcrypt = require('bcrypt');

//PRUEBA RECUPERACIÓN CONTRASEÑA
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

//CONFIGURAR TRANSPORTE DE BREVO
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  auth: {
    user: '92b4c2001@smtp-brevo.com',   //CORREO REGISTRADO EN BREVO
    pass: 'sXFxQYBmP73VJ1jc'
  }
});

//SOLICITUD DE RECUPERACIÓN
router.post('/solicitar-recuperacion', async (req, res) => {
  const { email } = req.body;

  try {
    const [users] = await db.query('SELECT * FROM Usuario WHERE correo_usuario = ?', [email]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Correo no registrado' });
    }

    const token = uuidv4();
    const expiracion = new Date(Date.now() + 3600000); // 1 hora

    await db.query(
      'UPDATE Usuario SET token_recuperacion = ?, expiracion_token = ? WHERE correo_usuario = ?',
      [token, expiracion, email]
    );

    const link = `http://localhost:3000/Restablecer-contrasena?token=${token}`; //CAMBIAR CUANDO SE TENGA SERVIDOR

    await transporter.sendMail({
      from: '"Prepa Balmoral Escocés" <raymundo7personal@gmail.com>',
      to: email,
      subject: 'Recuperación de contraseña',
      html: `
        <p>Solicitaste recuperar tu contraseña.</p>
        <p><a href="${link}">Haz clic aquí para restablecerla</a></p>
        <p>Este enlace expirará en 1 hora.</p>
      `
    });

    res.json({ success: true, message: 'Correo enviado' });

  } catch (error) {
    console.error('Error al enviar correo:', error);
    res.status(500).json({ success: false, message: 'Error interno' });
  }
});

//EVITA QUE CSURF LO BLOEQUEE PORQUE NO TIENE SESIÓN EN SI
router.post('/cambiar-contrasena', (req, res, next) => {
  next();
}, async (req, res) => {
  const { token, password } = req.body;
  try {
    const [users] = await db.query(
      'SELECT * FROM Usuario WHERE token_recuperacion = ? AND expiracion_token > NOW()',
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ success: false, message: 'Token inválido o expirado' });
    }

    const hashed = await bcrypt.hash(password, 10);
    console.log('Usuario a actualizar:', users[0].id_usuario);
    console.log('Contraseña hasheada:', hashed);

    await db.query(
      'UPDATE Usuario SET contraseña_usuario = ?, token_recuperacion = NULL, expiracion_token = NULL WHERE id_usuario = ?',
      [hashed, users[0].id_usuario]
    );

    res.json({ success: true, message: 'Contraseña actualizada con éxito' });

  } catch (error) {
    console.error('Error al actualizar contraseña:', error);
    res.status(500).json({ success: false, message: 'Error interno' });
  }
});

//CAMBIAR CONTRASEÑA DESDE PERFIL
router.post('/cambiar-contrasena-perfil', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.session.user?.id_usuario; //GUARDA ID EN SESIÓN

  if (!userId) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }

  try {
    //OBTENER USUARIO 
    const [users] = await db.query('SELECT contraseña_usuario FROM Usuario WHERE id_usuario = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const user = users[0];

    //VERIFICA LA CONTRASEÑA ACTUAL
    const validPassword = await bcrypt.compare(currentPassword, user.contraseña_usuario);
    if (!validPassword) {
      return res.status(400).json({ success: false, message: 'Contraseña actual incorrecta' });
    }

    //HASHEA LA NUEVA Y ACTUALIZA
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE Usuario SET contraseña_usuario = ? WHERE id_usuario = ?', [hashed, userId]);

    res.json({ success: true, message: 'Contraseña actualizada correctamente' });

  } catch (error) {
    console.error('Error al cambiar contraseña de perfil:', error);
    res.status(500).json({ success: false, message: 'Error interno' });
  }
});


//SERVIR LOS ARCHIVOS HTML
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Login.html'));
});

router.get('/Dashboard', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Dashboard.html'));
});

router.get('/Mis-KPIs-Pendientes', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Mis-KPIs-Pendientes.html'));
});

router.get('/Gestion-Alumnos', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/Gestion-Alumnos.html'));
});

//RUTA INTERMEDIA PARA REDIRECCIONAR A RECUPERACIÓN
router.get('/redirigir-a-recuperar', (req, res) => {
  req.session.puedeRecuperar = true;
  res.redirect('/Recuperar-enviar-email');
});

//RUTA PROTEGIDA: SOLO SI VIENE DESDE LOGIN
router.get('/Recuperar-enviar-email', (req, res) => {
  if (req.session.puedeRecuperar) {
    req.session.puedeRecuperar = false; //BORRA PERMISO TRAS USO
    res.sendFile(path.join(__dirname, '../../public/html/Recuperar-enviar-email.html'));
  } else {
    res.redirect('/'); 
  }
});

router.get('/Restablecer-contrasena', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Restablecer-contrasena.html'));
});


//CSRF TOKEN 
router.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

//VERIFICAR SESIÓN DE USUARIO
router.get('/auth-check', (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

//INICIAR SESIÓN
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
    const [alumno] = await db.query('SELECT id_alumno, nombre_alumno, apaterno_alumno, amaterno_alumno FROM Alumno WHERE id_usuario = ?', [user.id_usuario]);
    let userType, roles = [], id_personal = null, id_puesto = null, nombre_completo = null, id_alumno = null;
    if (personal.length > 0) {
      userType = 'personal';
      id_personal = personal[0].id_personal;
      id_puesto = personal[0].id_puesto;
      nombre_completo = `${personal[0].nombre_personal} ${personal[0].apaterno_personal} ${personal[0].amaterno_personal || ''}`.trim();
      const [personalRoles] = await db.query(`
        SELECT r.id_rol, r.nombre_rol
        FROM Personal p
        JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
        JOIN Rol r ON pr.id_rol = r.id_rol
        WHERE p.id_personal = ?
      `, [id_personal]);
      roles = personalRoles.map(role => ({ id_rol: role.id_rol, nombre_rol: role.nombre_rol }));

      req.session.user = {
        id_usuario: user.id_usuario,
        email: user.correo_usuario,
        userType,
        id_personal,
        id_puesto,
        roles,
        nombre_completo
      };
      res.json({ success: true , userType, redirect: '/Dashboard' });
    } else if (alumno.length > 0) {
        userType = 'alumno'; 
        id_alumno = alumno[0].id_alumno; 
        nombre_completo = `${alumno[0].nombre_alumno} ${alumno[0].apaterno_alumno} ${alumno[0].amaterno_alumno || ''}`.trim();

        req.session.user = {
          id_usuario: user.id_usuario,
          email: user.correo_usuario,
          userType,
          id_alumno,
          nombre_completo
        };
        res.json({ success: true , userType, redirect: '/DashboardAlumno' });
    } else {
      return res.status(500).json({ success: false, message: 'Usuario no asociado a personal o alumno.' });
    }
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

//CERRAR SESIÓN
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error al cerrar sesión.' });
    }
    res.clearCookie('connect.sid'); // << AÑADE ESTO para borrar cookie de sesión
    res.json({ success: true, redirect: '/' });
  });
});

//TRAER EVALUACIONES PENDIENTES PARA PERSONAL
router.get('/evaluaciones-pendientes', authMiddleware, async (req, res) => {
  if (!req.session.user || req.session.user.userType !== 'personal') {
    return res.status(403).json({ success: false, message: 'No tienes permiso para acceder a esta información.' });
  }
  const id_personal = req.session.user.id_personal;
  try {
    const [evaluaciones] = await db.query(`
      SELECT 
        p_evaluado.id_personal, p_evaluado.nombre_personal, p_evaluado.apaterno_personal, p_evaluado.amaterno_personal,
        pu_eval.id_puesto, pu_eval.nombre_puesto,
        k.id_kpi, k.nombre_kpi,
        c.id_categoria_kpi, c.nombre_categoria_kpi,
        pc.porcentaje_categoria, k.meta_kpi, k.tipo_kpi,
        rk.resultado_kpi -- Agregamos el resultado_kpi
      FROM Personal pevaluador
      JOIN Puesto_Rol pr ON pr.id_puesto = pevaluador.id_puesto
      JOIN Kpi k ON k.id_rol = pr.id_rol
      JOIN Categoria_Kpi c ON c.id_categoria_kpi = k.id_categoria_kpi
      JOIN Puesto_Kpi pk ON pk.id_kpi = k.id_kpi
      JOIN Puesto pu_eval ON pu_eval.id_puesto = pk.id_puesto
      JOIN Personal p_evaluado ON p_evaluado.id_puesto = pu_eval.id_puesto
      JOIN Puesto_Categoria pc ON pc.id_puesto = pu_eval.id_puesto AND pc.id_categoria_kpi = c.id_categoria_kpi
      LEFT JOIN Resultado_Kpi rk ON rk.id_personal = p_evaluado.id_personal AND rk.id_kpi = k.id_kpi AND rk.id_evaluador = (SELECT id_evaluador FROM Evaluador WHERE id_personal = ?)
      WHERE pevaluador.id_personal = ?
      AND p_evaluado.id_personal <> pevaluador.id_personal
      ORDER BY p_evaluado.nombre_personal, c.id_categoria_kpi, k.id_kpi;
    `, [id_personal, id_personal]);

    const [evaluador] = await db.query(
      `SELECT nombre_personal, apaterno_personal, amaterno_personal FROM Personal WHERE id_personal = ?`,
      [id_personal]
    );

    const groupedEvaluations = evaluaciones.reduce((acc, row) => {
      const key = `${row.id_personal}_${row.id_puesto}`;
      if (!acc[key]) {
        acc[key] = {
          id_personal: row.id_personal,
          id_puesto: row.id_puesto,
          nombre_completo: `${row.nombre_personal} ${row.apaterno_personal} ${row.amaterno_personal || ''}`.trim(),
          nombre_puesto: row.nombre_puesto,
          categorias: {}
        };
      }
      if (!acc[key].categorias[row.id_categoria_kpi]) {
        acc[key].categorias[row.id_categoria_kpi] = {
          nombre_categoria: row.nombre_categoria_kpi,
          porcentaje_categoria: row.porcentaje_categoria,
          kpis: []
        };
      }
      acc[key].categorias[row.id_categoria_kpi].kpis.push({
        id_kpi: row.id_kpi,
        nombre_kpi: row.nombre_kpi,
        meta_kpi: row.meta_kpi,
        tipo_kpi: row.tipo_kpi,
        resultado_kpi: row.resultado_kpi //AGREGAMOS EL RESULTADO DEL KPI
      });
      return acc;
    }, {});

    const evaluadorNombre = `${evaluador[0].nombre_personal} ${evaluador[0].apaterno_personal} ${evaluador[0].amaterno_personal || ''}`.trim();

    res.json({ success: true, evaluaciones: Object.values(groupedEvaluations), userName: evaluadorNombre });
  } catch (error) {
    console.error('Error al obtener evaluaciones:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

//GUARDAR RESULTADOS DE KPIS PARA PERSONAL
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
    const id_personal_evaluado = req.body.id_personal; 

    let [evaluador] = await db.query('SELECT id_evaluador FROM Evaluador WHERE id_personal = ?', [id_personal_evaluador]);
    if (evaluador.length === 0) {
      await db.query('INSERT INTO Evaluador (id_personal) VALUES (?)', [id_personal_evaluador]);
      [evaluador] = await db.query('SELECT id_evaluador FROM Evaluador WHERE id_personal = ?', [id_personal_evaluador]);
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

      const [rolValido] = await db.query('SELECT pr.id_rol FROM Puesto_Rol pr JOIN Personal p ON p.id_puesto = pr.id_puesto WHERE p.id_personal = ? AND pr.id_rol = ?;', [id_personal_evaluador, id_rol_kpi]);
      if (rolValido.length === 0) continue;

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

  const [rolValido] = await db.query(
    'SELECT pr.id_rol FROM Puesto_Rol pr JOIN Personal p ON p.id_puesto = pr.id_puesto WHERE p.id_personal = ? AND pr.id_rol = ?;',
    [id_personal_evaluador, id_rol_kpi]
  );
  if (rolValido.length === 0) continue;

  //VERIFICAR SI YA EXISTE ESE RESULTADO
  const [existe] = await db.query(`
    SELECT id_resultado_kpi FROM Resultado_Kpi
    WHERE id_personal = ? AND id_kpi = ? AND id_evaluador = ?
  `, [id_personal_evaluado, id_kpi, id_evaluador]);

  if (existe.length > 0) {
    // Si ya existe, actualiza
    await db.query(`
      UPDATE Resultado_Kpi
      SET resultado_kpi = ?
      WHERE id_personal = ? AND id_kpi = ? AND id_evaluador = ?
    `, [parsedResultado, id_personal_evaluado, id_kpi, id_evaluador]);
  } else {
    // Si no existe, inserta
    await db.query(`
      INSERT INTO Resultado_Kpi (id_personal, id_kpi, id_evaluador, resultado_kpi)
      VALUES (?, ?, ?, ?)
    `, [id_personal_evaluado, id_kpi, id_evaluador, parsedResultado]);
  }
}
    }

    res.json({ success: true, message: 'Todos los resultados se guardaron correctamente.' });
  } catch (error) {
    console.error('Error al guardar múltiples resultados:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor al guardar resultados.' });
  }
});

//VER SI TIENE EVALUACIONES PENDIENTES PARA VER SI MUESTRA O NO EL BOTÓN
router.get('/tiene-evaluaciones-pendientes', authMiddleware, async (req, res) => {
  if (!req.session.user || req.session.user.userType !== 'personal') {
    return res.json({ success: true, tieneEvaluaciones: false });
  }

  const id_personal = req.session.user.id_personal;

  try {
    const [rows] = await db.query(`
      SELECT 1
      FROM Personal p_evaluado
      JOIN Puesto pu ON pu.id_puesto = p_evaluado.id_puesto
      JOIN Puesto_Kpi pk ON pk.id_puesto = pu.id_puesto
      JOIN Kpi k ON k.id_kpi = pk.id_kpi
      JOIN Puesto_Rol pr ON pr.id_rol = k.id_rol
      JOIN Personal p_eval ON p_eval.id_personal = ?
      JOIN Puesto_Rol pr_eval ON pr_eval.id_puesto = p_eval.id_puesto AND pr_eval.id_rol = pr.id_rol
      LIMIT 1;
    `, [id_personal]);

    const tieneEvaluaciones = rows.length > 0;
    res.json({ success: true, tieneEvaluaciones });
  } catch (error) {
    console.error('Error verificando evaluaciones:', error);
    res.status(500).json({ success: false, message: 'Error al verificar evaluaciones' });
  }
});

//RUTAS PARA GESTIÓN DE ALUMNOS

//OBTENER LOS GRUPOS
router.get('/grupos', authMiddleware, async (req, res) => {
  try {
    const [grupos] = await db.query('SELECT id_grado_grupo, grado, grupo FROM Grado_grupo ORDER BY grado, grupo');
    res.json({ success: true, grupos });
  } catch (error) {
    console.error('Error al obtener grupos:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

//OBTENER ALUMNOS POR GRUPO
router.get('/alumnos-por-grupo/:id_grado_grupo', authMiddleware, async (req, res) => {
  const id_grado_grupo = req.params.id_grado_grupo;
  try {
    const [alumnos] = await db.query(`
      SELECT 
        a.id_alumno,
        a.nombre_alumno,
        a.apaterno_alumno,
        a.amaterno_alumno,
        p.id_personal,
        u.correo_usuario AS correo_alumno,
        p.nombre_personal AS nombre_counselor,
        p.apaterno_personal AS apaterno_counselor,
        GROUP_CONCAT(t.nombre_taller SEPARATOR ', ') AS talleres
      FROM Alumno a
      LEFT JOIN Usuario u ON a.id_usuario = u.id_usuario
      LEFT JOIN Personal p ON a.id_personal = p.id_personal
      LEFT JOIN Alumno_Taller at ON a.id_alumno = at.id_alumno
      LEFT JOIN Taller t ON at.id_taller = t.id_taller
      WHERE a.id_grado_grupo = ? AND a.estado_alumno = 1
      GROUP BY a.id_alumno
      ORDER BY a.apaterno_alumno, a.nombre_alumno;
    `, [id_grado_grupo]);

    res.json({ success: true, alumnos });
  } catch (error) {
    console.error('Error al obtener alumnos por grupo:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

//OBTENER PERSONAL QUE ES COUNSELOR
router.get('/counselors-disponibles', authMiddleware, async (req, res) => {
  try {
    const [counselors] = await db.query(`
      SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal
    FROM Personal p
    JOIN Puesto pu ON p.id_puesto = pu.id_puesto
    JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
    JOIN Rol r ON pr.id_rol = r.id_rol
    WHERE LOWER(r.nombre_rol) LIKE '%counselor%'
    ORDER BY p.apaterno_personal, p.nombre_personal;
    `);

    res.json({ success: true, counselors });
  } catch (error) {
    console.error('Error al obtener counselors disponibles:', error);
    res.status(500).json({ success: false });
  }
});

//OBTENER TODOS LOS TALLERES
router.get('/talleres', authMiddleware, async (req, res) => {
  try {
    const [talleres] = await db.query('SELECT id_taller, nombre_taller FROM Taller ORDER BY nombre_taller');
    res.json({ success: true, talleres });
  } catch (error) {
    console.error('Error al obtener talleres:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

//ASIGNAR TALLER AL ALUMNO
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

//OBTENER DATOS DE CADA ALUMNO
router.get('/alumno/:id_alumno', authMiddleware, async (req, res) => {
  const { id_alumno } = req.params;
  try {
    const [alumno] = await db.query(`
      SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, a.telefono_alumno,
             a.id_personal,
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

//OBTENER LOS TALLERES DE CADA ALUMNO
router.get('/talleres-por-alumno/:id_alumno', authMiddleware, async (req, res) => {
  const { id_alumno } = req.params;
  try {
    const [talleres] = await db.query(`
      SELECT t.id_taller, t.nombre_taller, at.estado_evaluacion_taller
      FROM Alumno_Taller at
      JOIN Taller t ON at.id_taller = t.id_taller
      WHERE at.id_alumno = ?
    `, [id_alumno]);

    res.json({ success: true, talleres });
  } catch (error) {
    console.error('Error al obtener talleres del alumno:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

//ACTUALIZAR LOS TALLERES DEL ALUMNO
router.post('/actualizar-talleres-alumno', authMiddleware, async (req, res) => {
  const { id_alumno, talleres } = req.body; // talleres: array de { id_taller, estado_evaluacion_taller }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Eliminar talleres anteriores
    await connection.query('DELETE FROM Alumno_Taller WHERE id_alumno = ?', [id_alumno]);

    // Insertar los nuevos talleres
    for (const taller of talleres) {
      await connection.query(`
        INSERT INTO Alumno_Taller (id_alumno, id_taller, estado_evaluacion_taller)
        VALUES (?, ?, ?)
      `, [id_alumno, taller.id_taller, taller.estado_evaluacion_taller]);
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar talleres del alumno:', error);
    res.status(500).json({ success: false });
  } finally {
    connection.release();
  }
});

//ACTUALIZAR COUNSELOR DEL ALUMNO
router.post('/actualizar-counselor-alumno', authMiddleware, async (req, res) => {
  const { id_alumno, id_personal } = req.body;
  try {
    await db.query('UPDATE Alumno SET id_personal = ? WHERE id_alumno = ?', [id_personal, id_alumno]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al actualizar counselor:', error);
    res.status(500).json({ success: false });
  }
});

//OBTENER LOS GRUPOS SOLO DEL MISMO GRADO
router.get('/grupos-mismo-grado/:grado', authMiddleware, async (req, res) => {
  const grado = req.params.grado;
  try {
    const [grupos] = await db.query(
      'SELECT id_grado_grupo, grado, grupo FROM Grado_grupo WHERE grado = ? ORDER BY grupo',
      [grado]
    );
    res.json({ success: true, grupos });
  } catch (error) {
    console.error('Error al obtener grupos del mismo grado:', error);
    res.status(500).json({ success: false });
  }
});

//ACTUALIZAR EL GRUPO DEL ALUMNO
router.post('/actualizar-grupo-alumno', authMiddleware, async (req, res) => {
  const { id_alumno, id_grado_grupo } = req.body;
  try {
    await db.query('UPDATE Alumno SET id_grado_grupo = ? WHERE id_alumno = ?', [id_grado_grupo, id_alumno]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al actualizar grupo:', error);
    res.status(500).json({ success: false });
  }
});

//BUSCAR ALUMNOS
router.get('/buscar-alumnos', authMiddleware, async (req, res) => {
  const nombre = req.query.nombre?.trim();
  if (!nombre) return res.status(400).json({ success: false, message: 'Nombre vacío' });

  try {
    const [alumnos] = await db.query(`
      SELECT 
        a.id_alumno,
        a.nombre_alumno,
        a.apaterno_alumno,
        a.amaterno_alumno,
        p.id_personal,
        p.nombre_personal AS nombre_counselor,
        p.apaterno_personal AS apaterno_counselor,
        g.grado,
        g.grupo,
        GROUP_CONCAT(t.nombre_taller SEPARATOR ', ') AS talleres
      FROM Alumno a
      LEFT JOIN Personal p ON a.id_personal = p.id_personal
      LEFT JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
      LEFT JOIN Alumno_Taller at ON a.id_alumno = at.id_alumno
      LEFT JOIN Taller t ON at.id_taller = t.id_taller
      WHERE CONCAT_WS(' ', a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno) LIKE ? AND a.estado_alumno = 1
      GROUP BY a.id_alumno
      ORDER BY a.apaterno_alumno, a.nombre_alumno
    `, [`%${nombre}%`]);

    res.json({ success: true, alumnos });
  } catch (error) {
    console.error('Error al buscar alumnos:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

//AGREGAR NUEVO ALUMNO
router.post('/insertar-nuevo-alumno', authMiddleware, async (req, res) => {
  const { id_alumno, nombre, apaterno, amaterno, correo, password, id_grado_grupo, id_personal, talleres } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    //HASHEAR CONTRASEÑA
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const [[{ maxId }]] = await connection.query('SELECT MAX(id_usuario) AS maxId FROM Usuario');
    const id_usuario = (maxId || 0) + 1;

    //INSERTAR MANUALMENTE
    await connection.query(`
      INSERT INTO Usuario (id_usuario, correo_usuario, contraseña_usuario)
      VALUES (?, ?, ?)
    `, [id_usuario, correo, hashedPassword]);

    //VERIFICAR SI EXISTE UN ALUMNO CON ESA MATRICULA
    const [alumnoExistente] = await connection.query(`
      SELECT 1 FROM Alumno WHERE id_alumno = ?
    `, [id_alumno]);

    if (alumnoExistente.length > 0) {
      throw new Error(`Ya existe un alumno con la matrícula ${id_alumno}`);
    }

    // VERIFICAR SI YA EXISTE ESE CORREO
    const [correoExistente] = await connection.query(`
      SELECT 1 FROM Usuario WHERE correo_usuario = ?
    `, [correo]);

    if (correoExistente.length > 0) {
      throw new Error(`Ya existe un usuario con el correo ${correo}`);
    }

    //INSERTAR EN TABLA ALUMNO INCLUYENDO EL ID_USUARIO
    const [result] = await connection.query(`
      INSERT INTO Alumno (id_alumno, nombre_alumno, apaterno_alumno, amaterno_alumno, id_grado_grupo, id_personal, id_usuario)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id_alumno, nombre, apaterno, amaterno, id_grado_grupo, id_personal, id_usuario]);

    //INSERTAR LA RELACIÓN CON TALLERES
    for (const id_taller of talleres) {
      await connection.query(`
        INSERT INTO Alumno_Taller (id_alumno, id_taller, estado_evaluacion_taller)
        VALUES (?, ?, 0)
      `, [id_alumno, id_taller]);
    }

    //INSERTAR RELACIÓN CON MATERIAS
    const [materiasGrupo] = await connection.query(`
      SELECT id_materia, id_personal FROM Grupo_Materia WHERE id_grado_grupo = ?
    `, [id_grado_grupo]);

    for (const m of materiasGrupo) {
      await connection.query(`
        INSERT INTO Alumno_Materia (id_alumno, id_materia, id_personal, estado_evaluacion_materia)
        VALUES (?, ?, ?, 0)
      `, [id_alumno, m.id_materia, m.id_personal]);
    }

    //INSERTAR RELACIÓN CON SERVICIOS
    const [servicios] = await connection.query('SELECT id_servicio FROM Servicio');
    for (const s of servicios) {
      await connection.query(`
        INSERT INTO Alumno_Servicio (id_alumno, id_servicio, estado_evaluacion_servicio)
        VALUES (?, ?, 0)
      `, [id_alumno, s.id_servicio]);
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error al insertar nuevo alumno:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
});

//DAR DE BAJA ALUMNOS
router.post('/dar-baja-alumno', authMiddleware, async (req, res) => {
  const { id_alumno } = req.body;

  const connection = await db.getConnection();
  try {
    const [result] = await connection.query(`
      UPDATE Alumno SET estado_alumno = 0 WHERE id_alumno = ?
    `, [id_alumno]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Alumno no encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error al dar de baja alumno:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor al dar de baja al alumno.' });
  } finally {
    connection.release();
  }
});

//RUTA PARA PRUEBA NADAMÁS
router.get('/debug', (req, res) => {
  res.send('Rutas funcionando');
});


module.exports = router;

