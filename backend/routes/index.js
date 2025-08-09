const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../config/db'); // Asegúrate de que esta importación sea correcta
const authMiddleware = require('../middleware/auth');
const bcrypt = require('bcrypt');
const { permisoMiddleware } = require('../middleware/permisosMiddleware'); 
const { bloquearAlumnos } = require('../middleware/bloquearAlumnosMiddleware'); // Middleware para bloquear alumnos

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

//DASHBOAR DIR.GENERAL
router.get('/Dashboard', authMiddleware, (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.redirect('/'); // Por si acaso
  }

  if (user.userType === 'alumno') {
    return res.redirect('/DashboardAlumno');
  }

  // Si es personal
  const esDirectorGeneral = user.roles?.some(rol => rol.nombre_rol === 'Director General');

  if (esDirectorGeneral) {
    return res.sendFile(path.join(__dirname, '../../public/html/Dashboard.html'));
  } else {
    return res.sendFile(path.join(__dirname, '../../public/html/DashboardPersonal.html'));
  }
});

router.get('/Mis-KPIs-Pendientes', authMiddleware, bloquearAlumnos, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Mis-KPIs-Pendientes.html'));
});

//RUTA INTERMEDIA PARA REDIRECCIONAR A RECUPERACIÓN
router.get('/redirigir-a-recuperar', (req, res) => {
  req.session.puedeRecuperar = true;
  res.redirect('/Recuperar-enviar-email');
});

// ALUMNOS
router.get('/DashboardAlumno', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/DashboardAlumno.html'));
});

router.get('/EvaluacionProfesores', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/EvaluacionProfesores.html'));
});

router.get('/EvaluacionServicios', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/EvaluacionServicios.html'));
});

router.get('/EvaluacionTalleres', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/EvaluacionTalleres.html'));
});

router.get('/EvaluacionCounselor', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/EvaluacionCounselor.html'));
});

//ADMINISTRACIÓN
//(RAYMUNDO)
router.get('/Gestion-Alumnos', authMiddleware, bloquearAlumnos, permisoMiddleware ('permiso_alumnos'), (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Gestion-Alumnos.html'));
});

router.get('/Gestion-Grupos', authMiddleware, bloquearAlumnos, permisoMiddleware('permiso_grupos'), (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Gestion-Grupos.html'));
});
//(ARMANDO)
router.get('/Gestion-Personal-Permisos', bloquearAlumnos, authMiddleware, permisoMiddleware ('permiso_personal'), (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Gestion-Personal-Permisos.html'));
});

router.get('/Gestion-Talleres-Permisos', bloquearAlumnos, authMiddleware, permisoMiddleware ('permiso_talleres'), (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Gestion-Talleres-Permisos.html'));
});

// PERSONAL
router.get('/DashboardPersonal', authMiddleware, bloquearAlumnos, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/DashboardPersonal.html'));
});

router.get('/EvaluacionCoordinador', authMiddleware, bloquearAlumnos,(req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/EvaluacionCoordinador.html'));
});

router.get('/EvaluacionPares', authMiddleware, bloquearAlumnos, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/EvaluacionPares.html'));
});

router.get('/Evaluacion360', authMiddleware, bloquearAlumnos, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Evaluacion360.html'));
});

router.get('/EvaluacionJefe', authMiddleware, bloquearAlumnos, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/EvaluacionJefe.html'));
});

router.get('/EvaluacionSubordinados', bloquearAlumnos, authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/EvaluacionSubordinados.html'));
});

router.get('/Mis-Evaluaciones-Dir-General', bloquearAlumnos, authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Evaluaciones360.html'));
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
    const [alumno] = await db.query('SELECT id_alumno, nombre_alumno, apaterno_alumno, amaterno_alumno, id_personal FROM Alumno WHERE id_usuario = ?', [user.id_usuario]);
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

      const [permisosRows] = await db.query(
        'SELECT * FROM Permisos WHERE id_usuario = ?',
        [id_personal]
      );
      const permisos = permisosRows[0] || {}; // Si no tiene, que sea objeto vacío

      req.session.user = {
        id_usuario: user.id_usuario,
        email: user.correo_usuario,
        userType,
        id_personal,
        id_puesto,
        roles,
        nombre_completo,
        permisos // AÑADIMOS LOS PERMISOS AQUÍ
      };
      if (id_puesto == 35){
        res.json({ success: true , userType, redirect: '/Dashboard' });
      }else {
        res.json({ success: true , userType, redirect: '/DashboardPersonal' });
      }

    } else if (alumno.length > 0) {
        userType = 'alumno'; 
        id_alumno = alumno[0].id_alumno; 
        id_personal = alumno[0].id_personal; // SU COUNSELOR
        nombre_completo = `${alumno[0].nombre_alumno} ${alumno[0].apaterno_alumno} ${alumno[0].amaterno_alumno || ''}`.trim();

        req.session.user = {
          id_usuario: user.id_usuario,
          email: user.correo_usuario,
          userType,
          id_alumno,
          nombre_completo,
          id_personal 
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
  const { id_grado_grupo } = req.params;
  try {
    const [alumnos] = await db.query(`
      SELECT 
        a.id_alumno,
        a.nombre_alumno,
        a.apaterno_alumno,
        a.amaterno_alumno,
        a.id_grado_grupo,
        a.id_personal,
        g.grado,
        g.grupo,
        p.nombre_personal AS nombre_counselor,
        p.apaterno_personal AS apaterno_counselor,
        GROUP_CONCAT(t.nombre_taller SEPARATOR ', ') AS talleres,
        ni.nombre_nivel_ingles,
        ae.nombre_arte_especialidad
      FROM Alumno a
      JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
      LEFT JOIN Personal p ON a.id_personal = p.id_personal
      LEFT JOIN Alumno_Taller at ON a.id_alumno = at.id_alumno
      LEFT JOIN Taller t ON at.id_taller = t.id_taller
      LEFT JOIN Alumno_Nivel_Ingles ani ON a.id_alumno = ani.id_alumno
      LEFT JOIN Nivel_Ingles ni ON ani.id_nivel_ingles = ni.id_nivel_ingles
      LEFT JOIN Alumno_Arte_Especialidad aae ON a.id_alumno = aae.id_alumno
      LEFT JOIN Arte_Especialidad ae ON aae.id_arte_especialidad = ae.id_arte_especialidad
      WHERE a.id_grado_grupo = ? AND a.estado_alumno = 1
      GROUP BY a.id_alumno
    `, [id_grado_grupo]);

    res.json({ success: true, alumnos });
  } catch (error) {
    console.error('Error al obtener alumnos por grupo:', error);
    res.status(500).json({ success: false, message: 'Error al obtener alumnos' });
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
    const [alumnos] = await db.query(`
      SELECT 
        a.id_alumno,
        a.nombre_alumno,
        a.apaterno_alumno,
        a.amaterno_alumno,
        a.telefono_alumno,
        a.id_personal,
        a.id_grado_grupo,
        ani.id_nivel_ingles,
        aae.id_arte_especialidad,
        g.grado,
        g.grupo,
        p.nombre_personal AS nombre_counselor,
        p.apaterno_personal AS apaterno_counselor,
        GROUP_CONCAT(t.nombre_taller SEPARATOR ', ') AS talleres
      FROM Alumno a
      JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
      LEFT JOIN Alumno_Nivel_Ingles ani ON a.id_alumno = ani.id_alumno
      LEFT JOIN Alumno_Arte_Especialidad aae ON a.id_alumno = aae.id_alumno
      LEFT JOIN Personal p ON a.id_personal = p.id_personal
      LEFT JOIN Alumno_Taller at ON a.id_alumno = at.id_alumno
      LEFT JOIN Taller t ON at.id_taller = t.id_taller
      WHERE a.id_alumno = ? AND a.estado_alumno = 1
      GROUP BY a.id_alumno
    `, [id_alumno]);

    if (alumnos.length === 0) {
      return res.status(404).json({ success: false, message: 'Alumno no encontrado' });
    }

    res.json({ success: true, alumno: alumnos[0] });
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
  const { id_alumno, talleres } = req.body;
  const nuevosIds = talleres.map(t => t.id_taller);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Eliminar talleres que ya no están en la lista
    if (nuevosIds.length > 0) {
      await connection.query(`
        DELETE FROM Alumno_Taller
        WHERE id_alumno = ? AND id_taller NOT IN (?)
      `, [id_alumno, nuevosIds]);
    } else {
      await connection.query(`
        DELETE FROM Alumno_Taller
        WHERE id_alumno = ?
      `, [id_alumno]);
    }

    // 2. Insertar nuevos talleres
    for (const taller of talleres) {
      const [rows] = await connection.query(`
        SELECT 1 FROM Alumno_Taller
        WHERE id_alumno = ? AND id_taller = ?
      `, [id_alumno, taller.id_taller]);

      if (rows.length === 0) {
        // Revisar si ya hay respuestas del alumno en ese taller
        const [respuestas] = await connection.query(`
          SELECT COUNT(*) AS total FROM Respuesta_Alumno_Taller
          WHERE id_alumno = ? AND id_taller = ?
        `, [id_alumno, taller.id_taller]);

        const yaEvaluado = respuestas[0].total > 0 ? 1 : taller.estado_evaluacion_taller;

        await connection.query(`
          INSERT INTO Alumno_Taller (id_alumno, id_taller, estado_evaluacion_taller)
          VALUES (?, ?, ?)
        `, [id_alumno, taller.id_taller, yaEvaluado]);
      }
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

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Actualizar el counselor del alumno
    await connection.query(
      'UPDATE Alumno SET id_personal = ? WHERE id_alumno = ?',
      [id_personal, id_alumno]
    );

    // 2. Verificar si ya hay respuestas del alumno para ese counselor
    const [respuestas] = await connection.query(
      `SELECT COUNT(*) AS total FROM Respuesta_Alumno_Counselor
       WHERE id_alumno = ? AND id_personal = ?`,
      [id_alumno, id_personal]
    );

    const estado = respuestas[0].total > 0 ? 1 : 0;

    // 3. Actualizar estado_evaluacion_counselor
    await connection.query(
      'UPDATE Alumno SET estado_evaluacion_counselor = ? WHERE id_alumno = ?',
      [estado, id_alumno]
    );

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar counselor:', error);
    res.status(500).json({ success: false });
  } finally {
    connection.release();
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

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Actualizar grupo
    await connection.query(
      'UPDATE Alumno SET id_grado_grupo = ? WHERE id_alumno = ?',
      [id_grado_grupo, id_alumno]
    );

    // 2. Eliminar materias anteriores
    await connection.query(
      'DELETE FROM Alumno_Materia WHERE id_alumno = ?',
      [id_alumno]
    );

    // 3. Insertar nuevas materias del grupo
    const [materiasGrupo] = await connection.query(
      'SELECT id_materia, id_personal FROM Grupo_Materia WHERE id_grado_grupo = ?',
      [id_grado_grupo]
    );

    for (const m of materiasGrupo) {
      await connection.query(
        `INSERT INTO Alumno_Materia (id_alumno, id_materia, id_personal, estado_evaluacion_materia)
         VALUES (?, ?, ?, 0)`,
        [id_alumno, m.id_materia, m.id_personal]
      );
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar grupo:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar grupo del alumno' });
  } finally {
    connection.release();
  }
});

//BUSCAR ALUMNOS
router.get('/buscar-alumnos', authMiddleware, async (req, res) => {
  const { nombre } = req.query;
  try {
    const [alumnos] = await db.query(`
      SELECT 
        a.id_alumno,
        a.nombre_alumno,
        a.apaterno_alumno,
        a.amaterno_alumno,
        a.id_grado_grupo,
        a.id_personal,
        g.grado,
        g.grupo,
        p.nombre_personal AS nombre_counselor,
        p.apaterno_personal AS apaterno_counselor,
        GROUP_CONCAT(t.nombre_taller SEPARATOR ', ') AS talleres,
        ni.nombre_nivel_ingles,
        ae.nombre_arte_especialidad
      FROM Alumno a
      JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
      LEFT JOIN Personal p ON a.id_personal = p.id_personal
      LEFT JOIN Alumno_Taller at ON a.id_alumno = at.id_alumno
      LEFT JOIN Taller t ON at.id_taller = t.id_taller
      LEFT JOIN Alumno_Nivel_Ingles ani ON a.id_alumno = ani.id_alumno
      LEFT JOIN Nivel_Ingles ni ON ani.id_nivel_ingles = ni.id_nivel_ingles
      LEFT JOIN Alumno_Arte_Especialidad aae ON a.id_alumno = aae.id_alumno
      LEFT JOIN Arte_Especialidad ae ON aae.id_arte_especialidad = ae.id_arte_especialidad
      WHERE a.estado_alumno = 1 
        AND (a.nombre_alumno LIKE ? OR a.apaterno_alumno LIKE ? OR a.amaterno_alumno LIKE ?)
      GROUP BY a.id_alumno
    `, [`%${nombre}%`, `%${nombre}%`, `%${nombre}%`]);

    res.json({ success: true, alumnos });
  } catch (error) {
    console.error('Error al buscar alumnos:', error);
    res.status(500).json({ success: false, message: 'Error al buscar alumnos' });
  }
});

// AGREGAR NUEVO ALUMNO
router.post('/insertar-nuevo-alumno', authMiddleware, async (req, res) => {
  const { id_alumno, nombre, apaterno, amaterno, correo, password, id_grado_grupo, id_personal, talleres, nivel_ingles, arte_especialidad} = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // VERIFICAR SI YA EXISTE UN ALUMNO CON ESA MATRÍCULA
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

    // HASHEAR CONTRASEÑA
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // GENERAR NUEVO ID_USUARIO
    const [[{ maxId }]] = await connection.query('SELECT MAX(id_usuario) AS maxId FROM Usuario');
    const id_usuario = (maxId || 0) + 1;

    // INSERTAR EN USUARIO
    await connection.query(`
      INSERT INTO Usuario (id_usuario, correo_usuario, contraseña_usuario)
      VALUES (?, ?, ?)
    `, [id_usuario, correo, hashedPassword]);

    // INSERTAR EN ALUMNO
    await connection.query(`
      INSERT INTO Alumno (id_alumno, nombre_alumno, apaterno_alumno, amaterno_alumno, id_grado_grupo, id_personal, id_usuario)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id_alumno, nombre, apaterno, amaterno, id_grado_grupo, id_personal, id_usuario]);

    // INSERTAR RELACIÓN CON TALLERES
    for (const id_taller of talleres) {
      await connection.query(`
        INSERT INTO Alumno_Taller (id_alumno, id_taller, estado_evaluacion_taller)
        VALUES (?, ?, 0)
      `, [id_alumno, id_taller]);
    }

    // INSERTAR RELACIÓN CON MATERIAS DEL GRUPO
    const [materiasGrupo] = await connection.query(`
      SELECT id_materia, id_personal FROM Grupo_Materia WHERE id_grado_grupo = ?
    `, [id_grado_grupo]);

    for (const m of materiasGrupo) {
      await connection.query(`
        INSERT INTO Alumno_Materia (id_alumno, id_materia, id_personal, estado_evaluacion_materia)
        VALUES (?, ?, ?, 0)
      `, [id_alumno, m.id_materia, m.id_personal]);
    }

    // INSERTAR RELACIÓN CON SERVICIOS
    const [servicios] = await connection.query('SELECT id_servicio FROM Servicio');

    for (const s of servicios) {
      await connection.query(`
        INSERT INTO Alumno_Servicio (id_alumno, id_servicio, estado_evaluacion_servicio)
        VALUES (?, ?, 0)
      `, [id_alumno, s.id_servicio]);
    }

    // INSERTAR NIVEL DE INGLÉS Y ESPECIALIDAD DE ARTE
    if (nivel_ingles && nivel_ingles.id_nivel_ingles && nivel_ingles.id_personal && nivel_ingles.id_materia) {
      await connection.query(`
        INSERT INTO Alumno_Nivel_Ingles (id_alumno, id_personal, id_nivel_ingles, estado_evaluacion_nivel_ingles, id_materia)
        VALUES (?, ?, ?, 0, ?)
      `, [id_alumno, nivel_ingles.id_personal, nivel_ingles.id_nivel_ingles, nivel_ingles.id_materia]);
    }

    if (arte_especialidad && arte_especialidad.id_arte_especialidad && arte_especialidad.id_personal && arte_especialidad.id_materia) {
      await connection.query(`
        INSERT INTO Alumno_Arte_Especialidad (id_alumno, id_personal, id_arte_especialidad, estado_evaluacion_arte_especialidad, id_materia)
        VALUES (?, ?, ?, 0, ?)
      `, [id_alumno, arte_especialidad.id_personal, arte_especialidad.id_arte_especialidad, arte_especialidad.id_materia]);
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

//TRAER ARTES Y NIVELES DE INGLÉS PARA ASIGNAR AL ALUMNO
router.get('/opciones-ingles-y-arte/:id_grado_grupo', authMiddleware, async (req, res) => {
  const { id_grado_grupo } = req.params;
  try {
    const [niveles] = await db.query(`
      SELECT DISTINCT 
        ni.id_nivel_ingles, 
        ni.nombre_nivel_ingles,
        pni.id_personal,
        COALESCE(gm.id_materia, (SELECT id_materia FROM Materia WHERE nombre_materia LIKE 'Inglés%' LIMIT 1)) AS id_materia
      FROM Personal_Nivel_Ingles pni
      INNER JOIN Nivel_Ingles ni ON ni.id_nivel_ingles = pni.id_nivel_ingles
      LEFT JOIN Grupo_Materia gm ON gm.id_grado_grupo = pni.id_grado_grupo 
        AND gm.id_personal = pni.id_personal
      LEFT JOIN Materia m ON m.id_materia = gm.id_materia 
        AND m.nombre_materia LIKE 'Inglés%'
      WHERE pni.id_grado_grupo = ?;
    `, [id_grado_grupo]);

    const [artes] = await db.query(`
      SELECT DISTINCT 
        ae.id_arte_especialidad, 
        ae.nombre_arte_especialidad,
        pae.id_personal,
        COALESCE(gm.id_materia, (SELECT id_materia FROM Materia WHERE nombre_materia LIKE 'Arte%' LIMIT 1)) AS id_materia
      FROM Personal_Arte_Especialidad pae
      INNER JOIN Arte_Especialidad ae ON ae.id_arte_especialidad = pae.id_arte_especialidad
      LEFT JOIN Grupo_Materia gm ON gm.id_grado_grupo = pae.id_grado_grupo 
        AND gm.id_personal = pae.id_personal
      LEFT JOIN Materia m ON m.id_materia = gm.id_materia 
        AND m.nombre_materia LIKE 'Arte%'
      WHERE pae.id_grado_grupo = ?;
    `, [id_grado_grupo]);

    console.log(`Niveles para id_grado_grupo ${id_grado_grupo}:`, niveles);
    console.log(`Artes para id_grado_grupo ${id_grado_grupo}:`, artes);

    res.json({ success: true, niveles, artes });
  } catch (err) {
    console.error('Error al obtener opciones de inglés y arte:', err);
    res.status(500).json({ success: false, message: 'Error obteniendo opciones' });
  }
});

// ACTUALIZAR NIVEL DE INGLÉS DEL ALUMNO
router.post('/actualizar-nivel-ingles-alumno', authMiddleware, async (req, res) => {
  const { id_alumno, id_nivel_ingles, id_personal, id_materia } = req.body;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Verificar si ya existe un registro para este alumno
    const [existing] = await connection.query(`
      SELECT 1 FROM Alumno_Nivel_Ingles WHERE id_alumno = ?
    `, [id_alumno]);

    if (existing.length > 0) {
      // Actualizar registro existente
      await connection.query(`
        UPDATE Alumno_Nivel_Ingles 
        SET id_nivel_ingles = ?, id_personal = ?, id_materia = ?, estado_evaluacion_nivel_ingles = 0
        WHERE id_alumno = ?
      `, [id_nivel_ingles, id_personal, id_materia, id_alumno]);
    } else {
      // Insertar nuevo registro
      await connection.query(`
        INSERT INTO Alumno_Nivel_Ingles (id_alumno, id_personal, id_nivel_ingles, estado_evaluacion_nivel_ingles, id_materia)
        VALUES (?, ?, ?, 0, ?)
      `, [id_alumno, id_personal, id_nivel_ingles, id_materia]);
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar nivel de inglés:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar nivel de inglés' });
  } finally {
    connection.release();
  }
});

// ACTUALIZAR ESPECIALIDAD DE ARTE DEL ALUMNO
router.post('/actualizar-arte-especialidad-alumno', authMiddleware, async (req, res) => {
  const { id_alumno, id_arte_especialidad, id_personal, id_materia } = req.body;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Verificar si ya existe un registro para este alumno
    const [existing] = await connection.query(`
      SELECT 1 FROM Alumno_Arte_Especialidad WHERE id_alumno = ?
    `, [id_alumno]);

    if (existing.length > 0) {
      // Actualizar registro existente
      await connection.query(`
        UPDATE Alumno_Arte_Especialidad 
        SET id_arte_especialidad = ?, id_personal = ?, id_materia = ?, estado_evaluacion_arte_especialidad = 0
        WHERE id_alumno = ?
      `, [id_arte_especialidad, id_personal, id_materia, id_alumno]);
    } else {
      // Insertar nuevo registro
      await connection.query(`
        INSERT INTO Alumno_Arte_Especialidad (id_alumno, id_personal, id_arte_especialidad, estado_evaluacion_arte_especialidad, id_materia)
        VALUES (?, ?, ?, 0, ?)
      `, [id_alumno, id_personal, id_arte_especialidad, id_materia]);
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar arte/especialidad:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar arte/especialidad' });
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

//GESTIÓN MASIVA DE GRUPOS

//Traer todos los alumnos 
router.get('/alumnos-todos', async (req, res) => {
  try {
    const sql = `
      SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, a.id_grado_grupo
      FROM Alumno a
      JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
      WHERE a.estado_alumno = 1
      ORDER BY a.apaterno_alumno, a.nombre_alumno
    `;
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error en la consulta' });
  }
});


// Obtener todos los grados disponibles
router.get('/grados', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT DISTINCT grado FROM Grado_grupo ORDER BY grado');
    const grados = rows.map(r => r.grado);
    res.json(grados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error en la consulta' });
  }
});

// Obtener grupos por grado
router.get('/grupos-por-grado/:grado', async (req, res) => {
  try {
    const { grado } = req.params;
    const [rows] = await db.query('SELECT id_grado_grupo, grupo FROM Grado_grupo WHERE grado = ?', [grado]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error en la consulta' });
  }
});

// Alumnos por grado
router.get('/alumnos-por-grado/:grado', async (req, res) => {
  try {
    const { grado } = req.params;
    const sql = `
    SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, a.id_grado_grupo
    FROM Alumno a
    JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
    WHERE g.grado = ? AND a.estado_alumno = 1
  `;
    const [rows] = await db.query(sql, [grado]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error en la consulta' });
  }
});

// Asignar grupo a varios alumnos
router.post('/asignar-grupo-a-varios', async (req, res) => {
  const { id_grado_grupo, alumnos } = req.body;

  if (!id_grado_grupo || !Array.isArray(alumnos)) {
    return res.status(400).json({ success: false, message: 'Datos incompletos' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    for (const id_alumno of alumnos) {
      await connection.query('UPDATE Alumno SET id_grado_grupo = ? WHERE id_alumno = ?', [id_grado_grupo, id_alumno]);
      await connection.query('DELETE FROM Alumno_Materia WHERE id_alumno = ?', [id_alumno]);

      const [materiasGrupo] = await connection.query(
        'SELECT id_materia, id_personal FROM Grupo_Materia WHERE id_grado_grupo = ?',
        [id_grado_grupo]
      );

      for (const m of materiasGrupo) {
        await connection.query(
          `INSERT INTO Alumno_Materia (id_alumno, id_materia, id_personal, estado_evaluacion_materia)
           VALUES (?, ?, ?, 0)`,
          [id_alumno, m.id_materia, m.id_personal]
        );
      }
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al asignar alumnos' });
  } finally {
    connection.release();
  }
});

// Adelantar ciclo escolar
router.post('/adelantar-ciclo', authMiddleware, async (req, res) => {
  try {
    // Obtener todos los alumnos con su grupo y grado actual
    const [alumnos] = await db.query(`
      SELECT a.id_alumno, g.id_grado_grupo, CAST(g.grado AS UNSIGNED) AS grado, UPPER(g.grupo) AS grupo
      FROM Alumno a
      JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
    `);

    // Obtener todos los grupos posibles
    const [todosGrupos] = await db.query(`
      SELECT id_grado_grupo, CAST(grado AS UNSIGNED) AS grado, UPPER(grupo) AS grupo
      FROM Grado_grupo
    `);

    // Crear mapa de grupo destino por clave "grado_grupo"
    const mapaNuevo = {};
    todosGrupos.forEach(g => {
      const clave = `${g.grado}_${g.grupo}`;
      mapaNuevo[clave] = g.id_grado_grupo;
    });

    let alumnosActualizados = 0;

    for (const alumno of alumnos) {
      if (alumno.grado >= 6) {
        console.log(`No se adelanta a alumno ${alumno.id_alumno} de grado ${alumno.grado}_${alumno.grupo}`);
        continue;
      }

      const gradoNuevo = alumno.grado + 1;
      const claveNuevo = `${gradoNuevo}_${alumno.grupo}`;
      const idNuevo = mapaNuevo[claveNuevo];

      if (!idNuevo) {
        console.log(`No existe grupo destino para: ${claveNuevo} (alumno ${alumno.id_alumno})`);
        continue;
      }

      const [resultado] = await db.query(
        `UPDATE Alumno SET id_grado_grupo = ? WHERE id_alumno = ?`,
        [idNuevo, alumno.id_alumno]
      );

      alumnosActualizados += resultado.affectedRows;
      console.log(`Actualizado alumno ${alumno.id_alumno} de ${alumno.grado}_${alumno.grupo} a ${claveNuevo}`);
    }

    res.status(200).json({
      success: true,
      message: `Ciclo adelantado correctamente. ${alumnosActualizados} alumnos actualizados.`
    });

  } catch (error) {
    console.error('Error al adelantar el ciclo:', error);
    res.status(500).json({ success: false, message: 'Error al adelantar ciclo.' });
  }
});

//PERMISOS PARA OPCIONES DEL HEADER
router.get('/permisos-usuario', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'No estás autenticado.' });
  }

  try {
    const usuario = req.session.user;
    const [rows] = await db.query('SELECT * FROM Permisos WHERE id_usuario = ?', [usuario.id_usuario]);

    if (rows.length === 0) {
      return res.json({ success: true, permisos: null });
    }

    res.json({ success: true, permisos: rows[0] }); // Aquí está el cambio importante
  } catch (err) {
    console.error('Error al obtener permisos:', err);
    res.status(500).json({ success: false, message: 'Error del servidor.' });
  }
});

// OBTENER LOS SERVICIOS PARA EVALUARLOS
router.get('/getServicios', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 
  const query = "SELECT s.id_servicio ,s.nombre_servicio, s.img_servicio, sa.estado_evaluacion_servicio FROM Servicio s, Alumno_Servicio sa WHERE s.id_servicio=sa.id_servicio AND sa.id_alumno=?"; // OBTENER LOS SERVICIOS
  try {
    const [servicios] = await db.query(query,id_alumno);
    const cantidadServicios = servicios.length;
    res.json({ success: true, servicios, cantidadServicios });
  } catch (error) {
    console.error('Error al obtener servicios:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER PREGUNTAS DEL SERVICIO
router.get('/getPreguntasServicio/:id_servicio', authMiddleware, async (req, res) => {
  const id_servicio = req.params.id_servicio;
  const query = "SELECT s.nombre_servicio, p.id_pregunta, p.nombre_pregunta, p.id_tipo_pregunta, p.id_grupo_respuesta FROM servicio s,pregunta p WHERE s.id_servicio=p.id_servicio AND p.id_servicio=?"; // OBTENER LAS PREGUNTAS
  const query2 = "SELECT s.nombre_servicio, p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM servicio s,pregunta p, respuesta r WHERE s.id_servicio=p.id_servicio AND p.id_servicio=? AND p.id_grupo_respuesta=r.id_grupo_respuesta;"; // OBTENER LAS POSIBLES RESPUETAS A LAS PREGUNTAS / SE HACE POR SEPARADO PORQUE SI SE PONE QUE EN UNA SOLA CONULTA SE TRAIGA TODO LA MISMA PREGUNTA SE REPETIRA LA MISMA CANTIDAD DE VECES QUE SUS POSIBLES RESPUESTAS Y EL FOREACH NO S EPODRIA HACER BIEN
  try {
    const [preguntas] = await db.query(query,id_servicio);
    const [respuestas] = await db.query(query2,id_servicio);
    const cantidadPreguntas = preguntas.length;
    res.json({ success: true, preguntas, cantidadPreguntas, respuestas});
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// GUARDAR RESPUESTA A SERVICIO POR PARTE DE ALUMNOS 
router.post('/postRespuestasServicio', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 
  const {id_servicio,respuestas,comentarios} = req.body;
  const valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_alumno,
    id_servicio,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  const valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_alumno,
    id_servicio,
    comentario.tipo_comentario,
    comentario.comentario_servicio
  ]);
  const query = "INSERT INTO Respuesta_Alumno_Servicio (id_alumno, id_servicio, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
  const query2 = "INSERT INTO Comentario_Servicio (id_alumno, id_servicio, tipo_comentario, comentario_servicio) VALUES ?";  // AGREGAR EL COMENTARIO
  const query3 = "UPDATE Alumno_Servicio set estado_evaluacion_servicio=1 WHERE id_alumno=? AND id_servicio=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  try { 
    await db.query(query,[valoresRespuestas]);
    if (valoresComentarios.length > 0) { // EN CASO DE QUE NO HAYA COMENTARIOS NO SE HACE ESTA INSERCION
      await db.query(query2,[valoresComentarios]);
    }
    await db.query(query3,[id_alumno,id_servicio]);
    res.json({ success: true , message:'Servicio evaluado correctamente'});
  } catch (error) {
    console.error('Error al hacer la insercion:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
  }
});

// OBTENER LOS TALLERES PARA EVALUARLOS
router.get('/getTalleres', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 
  const query = "SELECT t.id_taller, t.nombre_taller, t.img_taller, ta.estado_evaluacion_taller, p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal FROM Taller t, Alumno_Taller ta, Personal p, Personal_taller pt WHERE p.id_personal=pt.id_taller AND pt.id_taller=ta.id_taller AND t.id_taller=ta.id_taller AND ta.id_alumno=?"; // OBTENER LOS TALLERES A LOS QUE ESTA INSCRITO
  try {
    const [talleres] = await db.query(query,id_alumno);
    const cantidadTalleres = talleres.length;
    res.json({ success: true, talleres, cantidadTalleres });
  } catch (error) {
    console.error('Error al obtener talleres:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER PREGUNTAS DEL TALLER
router.get('/getPreguntasTaller/:id_taller', authMiddleware, async (req, res) => {
  const id_taller = req.params.id_taller;
  const query = "SELECT t.nombre_taller, p.id_pregunta, p.nombre_pregunta, p.id_tipo_pregunta, p.id_grupo_respuesta FROM Taller t,Pregunta p WHERE p.id_tipo_pregunta=9 AND t.id_taller=?"; // 9 ES ('TALLERES EXTRA CLASE'),
  const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM pregunta p, respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=9"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
  try {
    const [preguntas] = await db.query(query,id_taller);
    const [respuestas] = await db.query(query2);
    const cantidadPreguntas = preguntas.length;
    res.json({ success: true, preguntas, cantidadPreguntas, respuestas});
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// GUARDAR RESPUESTA A TALLER POR PARTE DE ALUMNOS 
router.post('/postRespuestasTaller', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 
  const {id_taller,id_personal,respuestas,comentarios} = req.body;
  const valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_alumno,
    id_taller,
    id_personal,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  const valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_alumno,
    id_taller,
    id_personal,
    comentario.tipo_comentario,
    comentario.comentario_taller
  ]);
  const query = "INSERT INTO Respuesta_Alumno_Taller (id_alumno, id_taller, id_personal, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
  const query2 = "INSERT INTO Comentario_Taller (id_alumno, id_taller, id_personal, tipo_comentario, comentario_taller) VALUES ?"; // AGREGAR EL COMENTARIO
  const query3 = "UPDATE Alumno_Taller set estado_evaluacion_taller=1 WHERE id_alumno=? AND id_taller=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  try {
    await db.query(query,[valoresRespuestas]);
    if (valoresComentarios.length > 0) { // EN CASO DE QUE NO HAYA COMENTARIOS NO SE HACE ESTA INSERCION
      await db.query(query2,[valoresComentarios]);
    }
    await db.query(query3,[id_alumno,id_taller]);
    res.json({ success: true , message:'Taller evaluado correctamente'});
  } catch (error) {
    console.error('Error al hacer la insercion:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
  }
});

// OBTENER EL COUNSELOR PARA EVALUARLO
router.get('/getCounselor', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 
  const id_personal = req.session.user.id_personal; // SU COUNSELOR
  const query = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, a.estado_evaluacion_counselor FROM Personal p, Alumno a WHERE a.id_alumno=? AND p.id_personal=?"; // OBTENER EL COUNSELOR QUE TIENE EL ALUMNO
  try {
    const [counselor] = await db.query(query,[id_alumno,id_personal]);
    res.json({ success: true, counselor });
  } catch (error) {
    console.error('Error al obtener talleres:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER PREGUNTAS DE COUNSELOR
router.get('/getPreguntasCounselor', authMiddleware, async (req, res) => {
  const query = "SELECT p.id_pregunta, p.nombre_pregunta, p.id_tipo_pregunta, p.id_grupo_respuesta FROM Pregunta p WHERE p.id_tipo_pregunta=2"; // 2 ES COUNSELOR
  const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM pregunta p, respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=2"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
  try {
    const [preguntas] = await db.query(query);
    const [respuestas] = await db.query(query2);
    const cantidadPreguntas = preguntas.length;
    res.json({ success: true, preguntas, cantidadPreguntas, respuestas});
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// GUARDAR RESPUESTA A COUNSELOR POR PARTE DE ALUMNOS 
router.post('/postRespuestasCounselor', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 
  const {id_personal,respuestas,comentarios} = req.body;
  const valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_alumno,
    id_personal,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  const valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_alumno,
    id_personal,
    comentario.tipo_comentario,
    comentario.comentario_counselor
  ]);
  const query = "INSERT INTO Respuesta_Alumno_Counselor (id_alumno, id_personal, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
  const query2 = "INSERT INTO Comentario_Counselor (id_alumno,id_personal, tipo_comentario, comentario_counselor) VALUES ?"; // AGREGAR EL COMENTARIO
  const query3 = "UPDATE Alumno set estado_evaluacion_counselor=1 WHERE id_alumno=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  try {
    await db.query(query,[valoresRespuestas]);
    if (valoresComentarios.length > 0) { // EN CASO DE QUE NO HAYA COMENTARIOS NO SE HACE ESTA INSERCION
      await db.query(query2,[valoresComentarios]);
    }
    await db.query(query3,[id_alumno]);
    res.json({ success: true , message:'Counselor evaluado correctamente'});
  } catch (error) {
    console.error('Error al hacer la insercion:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
  }
});

//OBTENER LOS PROFESORES QUE DEBE DE EVALUAR CADA ALUMNO
router.get('/getDocentes', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 

  const query = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, m.id_materia, m.nombre_materia, am.estado_evaluacion_materia  FROM Personal p, Alumno_Materia am, Materia m WHERE am.id_materia=m.id_materia AND p.id_personal=am.id_personal AND am.id_alumno=?"; // OBTENER PROFESORES DE MATERIAS "NORMALES"
  const query2 = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, m.id_materia, m.nombre_materia, ni.id_nivel_ingles,ni.nombre_nivel_ingles ,ani.estado_evaluacion_nivel_ingles  FROM Personal p, Materia m, Nivel_Ingles ni, Alumno_Nivel_Ingles ani WHERE ani.id_materia=m.id_materia AND p.id_personal=ani.id_personal AND ni.id_nivel_ingles=ani.id_nivel_ingles AND ani.id_alumno=?"; // OBTENER PROFESOR DE INGLES
  const query3 = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, m.id_materia, m.nombre_materia, ae.id_arte_especialidad, ae.nombre_arte_especialidad ,aae.estado_evaluacion_arte_especialidad  FROM Personal p, Materia m, Arte_Especialidad ae, Alumno_Arte_Especialidad aae WHERE aae.id_materia=m.id_materia AND p.id_personal=aae.id_personal AND ae.id_arte_especialidad=aae.id_arte_especialidad AND aae.id_alumno=?"; // OBTENER PROFESOR DE ARTE
  try {
    const [profesores] = await db.query(query,id_alumno);
    const [ingles] = await db.query(query2,id_alumno);
    const [arte] = await db.query(query3,id_alumno);
    res.json({ success: true, profesores, ingles, arte });
  } catch (error) {
    console.error('Error al obtener profesores:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER PREGUNTAS DE DOCENTE
router.get('/getPreguntasDocente', authMiddleware, async (req, res) => {
  const query = "SELECT p.id_pregunta, p.nombre_pregunta, p.id_tipo_pregunta, p.id_grupo_respuesta FROM Pregunta p WHERE p.id_tipo_pregunta=1"; // 1 ES DOCENTE
  const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM pregunta p, respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=1"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
  try {
    const [preguntas] = await db.query(query);
    const [respuestas] = await db.query(query2);
    const cantidadPreguntas = preguntas.length;
    res.json({ success: true, preguntas, cantidadPreguntas, respuestas});
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// GUARDAR RESPUESTA A DOCENTE POR PARTE DE ALUMNOS 
router.post('/postRespuestasDocente', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 
  const {id_personal,id_materia,id_nivel_ingles,id_arte_especialidad,respuestas,comentarios} = req.body;
  let valoresRespuestas = [];
  let valoresComentarios = [];
  let query = '';
  let query2 = '';
  let query3 = '';

  if (id_nivel_ingles!=null) { // EN CASO DE QUE LA MATERIA SEA INGLES / QUIERE DECIR QUE SE MANDO EL NIVEL DE INGLES DESDE EL CLIENTE
      valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
      id_alumno,
      id_personal,
      id_nivel_ingles,
      respuesta.id_pregunta,
      respuesta.id_respuesta
    ]);
    valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
      id_alumno,
      id_personal,
      id_nivel_ingles,
      comentario.tipo_comentario,
      comentario.comentario_docente_ingles
    ]);
    query = "INSERT INTO Respuesta_Alumno_Docente_Ingles (id_alumno, id_personal, id_nivel_ingles,id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
    query2 = "INSERT INTO Comentario_Docente_Ingles (id_alumno,id_personal, id_nivel_ingles,tipo_comentario, comentario_docente_ingles) VALUES ?"; // AGREGAR EL COMENTARIO
    query3 = "UPDATE Alumno_Nivel_Ingles set estado_evaluacion_nivel_ingles=1 WHERE id_alumno=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  } else if (id_arte_especialidad != null) { // EN CASO DE QUE LA MATERIA SEA ARTE
    valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
      id_alumno,
      id_personal,
      id_arte_especialidad,
      respuesta.id_pregunta,
      respuesta.id_respuesta
    ]);
    valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
      id_alumno,
      id_personal,
      id_arte_especialidad,
      comentario.tipo_comentario,
      comentario.comentario_docente_arte
    ]);
    query = "INSERT INTO Respuesta_Alumno_Docente_Arte (id_alumno, id_personal, id_arte_especialidad,id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
    query2 = "INSERT INTO Comentario_Docente_Arte (id_alumno,id_personal, id_arte_especialidad,tipo_comentario, comentario_docente_arte) VALUES ?"; // AGREGAR EL COMENTARIO
    query3 = "UPDATE Alumno_Arte_Especialidad set estado_evaluacion_arte_especialidad=1 WHERE id_alumno=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  } else { // MATERIA "NORMAL"
    valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
      id_alumno,
      id_personal,
      id_materia,
      respuesta.id_pregunta,
      respuesta.id_respuesta
    ]);
    valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
      id_alumno,
      id_personal,
      id_materia,
      comentario.tipo_comentario,
      comentario.comentario_docente
    ]);
    query = "INSERT INTO Respuesta_Alumno_Docente (id_alumno, id_personal, id_materia, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
    query2 = "INSERT INTO Comentario_Docente (id_alumno, id_personal, id_materia, tipo_comentario, comentario_docente) VALUES ?"; // AGREGAR EL COMENTARIO
    query3 = `UPDATE Alumno_Materia set estado_evaluacion_materia=1 WHERE id_alumno=? AND id_materia=${id_materia}` // ACTUALIZAR EL ESTADO DE EVALUACION / SE METIO ASI MATERIA PORQUE EN LAS OTRAS QUERY 3 NO LLEVABA ESA CONDICION 
  }

  try {
    await db.query(query,[valoresRespuestas]);
    if (valoresComentarios.length > 0) { // EN CASO DE QUE NO HAYA COMENTARIOS NO SE HACE ESTA INSERCION
      await db.query(query2,[valoresComentarios]);
    }
    await db.query(query3,[id_alumno]);
    res.json({ success: true , message:'Materia evaluada correctamente'});
  } catch (error) {
    console.error('Error al hacer la insercion:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
  }
});

// OBTENER INFO DE ALUMNO
router.get('/getInfoAlumno', authMiddleware, async (req, res) => { 
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 

  const query = "SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno FROM Alumno a WHERE id_alumno=?"; // OBTENER SUBORDINADOS A EVALUAR
  try {
    const [alumno] = await db.query(query,id_alumno);
    res.json({ success: true, alumno});
  } catch (error) {
    console.error('Error al obtener alumno:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});



// OBTENER COORDINADORES A EVALUAR
router.get('/getCoordinadores', authMiddleware, async (req, res) => { // DE MOMENTO NO HAY DOCENTES QUE TENGAN 2 O MAS COORDINADORES PERO SE HACE PENSANDO EN UN CASO HIPOTETICO
  const id_personal = req.session.user.id_personal; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 

  const query = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, a.nombre_academia, pc.estado_evaluacion_coordinador, pc.id_evaluador FROM Personal p, Academia a, Personal_Coordinador pc WHERE a.id_personal=pc.id_personal AND p.id_personal=pc.id_personal AND p.id_personal<>pc.id_evaluador AND pc.id_evaluador=?"; // OBTENER COORDINADOR A EVALUAR
  try {
    const [coordinadores] = await db.query(query,id_personal);
    const cantidadCoordinadores = coordinadores.length;
    res.json({ success: true, coordinadores, cantidadCoordinadores});
  } catch (error) {
    console.error('Error al obtener coordinadores:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER PREGUNTAS DE COORDINADOR
router.get('/getPreguntasCoordinador', authMiddleware, async (req, res) => {
  const query = "SELECT p.id_pregunta, p.nombre_pregunta, p.id_tipo_pregunta, p.id_grupo_respuesta FROM Pregunta p WHERE p.id_tipo_pregunta=3"; // 3 ES COORDINADOR
  const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM pregunta p, respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=3"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
  try {
    const [preguntas] = await db.query(query);
    const [respuestas] = await db.query(query2);
    const cantidadPreguntas = preguntas.length;
    res.json({ success: true, preguntas, cantidadPreguntas, respuestas});
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// GUARDAR RESPUESTA A COORDINADOR 
router.post('/postRespuestasCoordinador', authMiddleware, async (req, res) => {
  const id_evaluador = req.session.user.id_personal; // EL ID DE LA PERSONA QUE ESTA EVALUANDO
  const {id_personal,respuestas,comentarios} = req.body;
  const tipo_pregunta = 3; // EL TIPO DE PREGUNTA DE COOORDINADOR
  const valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  const valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    comentario.tipo_comentario,
    comentario.comentario_personal
  ]);
  const query = "INSERT INTO Respuesta_Personal (id_evaluador, id_personal, id_tipo_pregunta, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA 
  const query2 = "INSERT INTO Comentario_Personal (id_evaluador, id_personal, id_tipo_pregunta, tipo_comentario, comentario_personal) VALUES ?"; // AGREGAR EL COMENTARIO
  const query3 = "UPDATE Personal_Coordinador set estado_evaluacion_coordinador=1 WHERE id_evaluador=? AND id_personal=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  try {
    await db.query(query,[valoresRespuestas]);
    if (valoresComentarios.length > 0) { // EN CASO DE QUE NO HAYA COMENTARIOS NO SE HACE ESTA INSERCION
      await db.query(query2,[valoresComentarios]);
    }
    await db.query(query3,[id_evaluador, id_personal]);
    res.json({ success: true , message:'Coordinador evaluado correctamente'});
  } catch (error) {
    console.error('Error al hacer la insercion:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
  }
});

// OBTENER PARES A EVALUAR
router.get('/getPares', authMiddleware, async (req, res) => { 
  const id_personal = req.session.user.id_personal; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 

  const query = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, pp.estado_evaluacion_par, pp.id_evaluador, pu.nombre_puesto FROM Personal p, Personal_par pp, Puesto pu WHERE p.id_personal=pp.id_personal AND p.id_puesto=pu.id_puesto AND p.id_personal<>pp.id_evaluador AND pp.id_evaluador=?"; // OBTENER PARES A EVALUAR
  try {
    const [pares] = await db.query(query,id_personal);
    const cantidadPares = pares.length;
    res.json({ success: true, pares, cantidadPares});
  } catch (error) {
    console.error('Error al obtener pares:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER PREGUNTAS DE PAR
router.get('/getPreguntasPar', authMiddleware, async (req, res) => {
  const query = "SELECT p.id_pregunta, p.nombre_pregunta, p.id_tipo_pregunta, p.id_grupo_respuesta FROM Pregunta p WHERE p.id_tipo_pregunta=6"; // 6 ES PARES
  const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM pregunta p, respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=6"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
  try {
    const [preguntas] = await db.query(query);
    const [respuestas] = await db.query(query2);
    const cantidadPreguntas = preguntas.length;
    res.json({ success: true, preguntas, cantidadPreguntas, respuestas});
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// GUARDAR RESPUESTA A PAR 
router.post('/postRespuestasPar', authMiddleware, async (req, res) => {
  const id_evaluador = req.session.user.id_personal; // EL ID DE LA PERSONA QUE ESTA EVALUANDO
  const {id_personal,respuestas,comentarios} = req.body;
  const tipo_pregunta = 6; // EL TIPO DE PREGUNTA DE PAR
  const valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  const valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    comentario.tipo_comentario,
    comentario.comentario_personal
  ]);
  const query = "INSERT INTO Respuesta_Personal (id_evaluador, id_personal, id_tipo_pregunta, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA 
  const query2 = "INSERT INTO Comentario_Personal (id_evaluador, id_personal, id_tipo_pregunta, tipo_comentario, comentario_personal) VALUES ?"; // AGREGAR EL COMENTARIO
  const query3 = "UPDATE Personal_Par set estado_evaluacion_par=1 WHERE id_evaluador=? AND id_personal=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  try {
    await db.query(query,[valoresRespuestas]);
    if (valoresComentarios.length > 0) { // EN CASO DE QUE NO HAYA COMENTARIOS NO SE HACE ESTA INSERCION
      await db.query(query2,[valoresComentarios]);
    }
    await db.query(query3,[id_evaluador, id_personal]);
    res.json({ success: true , message:'Par evaluado correctamente'});
  } catch (error) {
    console.error('Error al hacer la insercion:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
  }
});

// OBTENER 360 A EVALUAR
router.get('/get360', authMiddleware, async (req, res) => { 
  const id_personal = req.session.user.id_personal; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 

  const query = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, p3.estado_evaluacion_360, p3.id_evaluador, pu.nombre_puesto FROM Personal p, Personal_360 p3, Puesto pu WHERE p.id_personal=p3.id_personal AND p.id_puesto=pu.id_puesto AND p.id_personal<>p3.id_evaluador AND p3.id_evaluador=?"; // OBTENER 360 A EVALUAR
  try {
    const [todos] = await db.query(query,id_personal);
    const cantidad360 = todos.length;
    res.json({ success: true, todos, cantidad360});
  } catch (error) {
    console.error('Error al obtener 360:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER PREGUNTAS DE 360
router.get('/getPreguntas360', authMiddleware, async (req, res) => {
  const query = "SELECT p.id_pregunta, p.nombre_pregunta, p.id_tipo_pregunta, p.id_grupo_respuesta FROM Pregunta p WHERE p.id_tipo_pregunta=5"; // 5 ES 360
  const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM pregunta p, respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=5"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
  try {
    const [preguntas] = await db.query(query);
    const [respuestas] = await db.query(query2);
    const cantidadPreguntas = preguntas.length;
    res.json({ success: true, preguntas, cantidadPreguntas, respuestas});
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// GUARDAR RESPUESTA A PAR 
router.post('/postRespuestas360', authMiddleware, async (req, res) => {
  const id_evaluador = req.session.user.id_personal; // EL ID DE LA PERSONA QUE ESTA EVALUANDO
  const {id_personal,respuestas,comentarios} = req.body;
  const tipo_pregunta = 5; // EL TIPO DE PREGUNTA DE PAR
  const valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  const valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    comentario.tipo_comentario,
    comentario.comentario_personal
  ]);
  const query = "INSERT INTO Respuesta_Personal (id_evaluador, id_personal, id_tipo_pregunta, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA 
  const query2 = "INSERT INTO Comentario_Personal (id_evaluador, id_personal, id_tipo_pregunta, tipo_comentario, comentario_personal) VALUES ?"; // AGREGAR EL COMENTARIO
  const query3 = "UPDATE Personal_360 set estado_evaluacion_360=1 WHERE id_evaluador=? AND id_personal=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  try {
    await db.query(query,[valoresRespuestas]);
    if (valoresComentarios.length > 0) { // EN CASO DE QUE NO HAYA COMENTARIOS NO SE HACE ESTA INSERCION
      await db.query(query2,[valoresComentarios]);
    }
    await db.query(query3,[id_evaluador, id_personal]);
    res.json({ success: true , message:'Personal evaluado correctamente'});
  } catch (error) {
    console.error('Error al hacer la insercion:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
  }
});

// OBTENER JEFES A EVALUAR
router.get('/getJefes', authMiddleware, async (req, res) => { 
  const id_personal = req.session.user.id_personal; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 

  const query = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, pj.estado_evaluacion_jefe, pj.id_evaluador, pu.nombre_puesto FROM Personal p, Personal_Jefe pj, Puesto pu WHERE p.id_personal=pj.id_personal AND p.id_puesto=pu.id_puesto AND p.id_personal<>pj.id_evaluador AND pj.id_evaluador=?"; // OBTENER JEFES A EVALUAR
  try {
    const [jefes] = await db.query(query,id_personal);
    const cantidadJefes = jefes.length;
    res.json({ success: true, jefes, cantidadJefes});
  } catch (error) {
    console.error('Error al obtener jefes:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER PREGUNTAS DE JEFE
router.get('/getPreguntasJefe', authMiddleware, async (req, res) => {
  const query = "SELECT p.id_pregunta, p.nombre_pregunta, p.id_tipo_pregunta, p.id_grupo_respuesta FROM Pregunta p WHERE p.id_tipo_pregunta=7"; // 7 ES JEFE
  const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM pregunta p, respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=7"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
  try {
    const [preguntas] = await db.query(query);
    const [respuestas] = await db.query(query2);
    const cantidadPreguntas = preguntas.length;
    res.json({ success: true, preguntas, cantidadPreguntas, respuestas});
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// GUARDAR RESPUESTA A JEFE 
router.post('/postRespuestasJefe', authMiddleware, async (req, res) => {
  const id_evaluador = req.session.user.id_personal; // EL ID DE LA PERSONA QUE ESTA EVALUANDO
  const {id_personal,respuestas,comentarios} = req.body;
  const tipo_pregunta = 5; // EL TIPO DE PREGUNTA DE PAR
  const valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  const valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    comentario.tipo_comentario,
    comentario.comentario_personal
  ]);
  const query = "INSERT INTO Respuesta_Personal (id_evaluador, id_personal, id_tipo_pregunta, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA 
  const query2 = "INSERT INTO Comentario_Personal (id_evaluador, id_personal, id_tipo_pregunta, tipo_comentario, comentario_personal) VALUES ?"; // AGREGAR EL COMENTARIO
  const query3 = "UPDATE Personal_Jefe set estado_evaluacion_jefe=1 WHERE id_evaluador=? AND id_personal=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  try {
    await db.query(query,[valoresRespuestas]);
    if (valoresComentarios.length > 0) { // EN CASO DE QUE NO HAYA COMENTARIOS NO SE HACE ESTA INSERCION
      await db.query(query2,[valoresComentarios]);
    }
    await db.query(query3,[id_evaluador, id_personal]);
    res.json({ success: true , message:'Jefe evaluado correctamente'});
  } catch (error) {
    console.error('Error al hacer la insercion:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
  }
});

// OBTENER SUBORDINADOS A EVALUAR
router.get('/getSubordinados', authMiddleware, async (req, res) => { 
  const id_personal = req.session.user.id_personal; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 

  const query = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, ps.estado_evaluacion_subordinado,pu.nombre_puesto, ps.id_evaluador  FROM Personal p, Personal_Subordinado ps, Puesto pu WHERE p.id_personal=ps.id_personal AND p.id_puesto=pu.id_puesto AND p.id_personal<>ps.id_evaluador AND ps.id_evaluador=?"; // OBTENER SUBORDINADOS A EVALUAR
  try {
    const [subordinados] = await db.query(query,id_personal);
    const cantidadSubordinados = subordinados.length;
    res.json({ success: true, subordinados, cantidadSubordinados});
  } catch (error) {
    console.error('Error al obtener subordinados:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER PREGUNTAS DE JEFE
router.get('/getPreguntasSubordinado', authMiddleware, async (req, res) => {
  const query = "SELECT p.id_pregunta, p.nombre_pregunta, p.id_tipo_pregunta, p.id_grupo_respuesta FROM Pregunta p WHERE p.id_tipo_pregunta=4"; // 7 ES SUBORDINADO
  const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM pregunta p, respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=4"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
  try {
    const [preguntas] = await db.query(query);
    const [respuestas] = await db.query(query2);
    const cantidadPreguntas = preguntas.length;
    res.json({ success: true, preguntas, cantidadPreguntas, respuestas});
  } catch (error) {
    console.error('Error al obtener preguntas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// GUARDAR RESPUESTA A SUBORDINADO 
router.post('/postRespuestasSubordinado', authMiddleware, async (req, res) => {
  const id_evaluador = req.session.user.id_personal; // EL ID DE LA PERSONA QUE ESTA EVALUANDO
  const {id_personal,respuestas,comentarios} = req.body;
  const tipo_pregunta = 4; // EL TIPO DE PREGUNTA DE PAR
  const valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  const valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_evaluador,
    id_personal,
    tipo_pregunta,
    comentario.tipo_comentario,
    comentario.comentario_personal
  ]);
  const query = "INSERT INTO Respuesta_Personal (id_evaluador, id_personal, id_tipo_pregunta, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA 
  const query2 = "INSERT INTO Comentario_Personal (id_evaluador, id_personal, id_tipo_pregunta, tipo_comentario, comentario_personal) VALUES ?"; // AGREGAR EL COMENTARIO
  const query3 = "UPDATE Personal_Subordinado set estado_evaluacion_subordinado=1 WHERE id_evaluador=? AND id_personal=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  try {
    await db.query(query,[valoresRespuestas]);
      if (valoresComentarios.length > 0) { // EN CASO DE QUE NO HAYA COMENTARIOS NO SE HACE ESTA INSERCION
      await db.query(query2,[valoresComentarios]);
    }
    await db.query(query3,[id_evaluador, id_personal]);
    res.json({ success: true , message:'Subordinado evaluado correctamente'});
  } catch (error) {
    console.error('Error al hacer la insercion:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
  }
});

// OBTENER INFO DE PERSONA
router.get('/getInfoPersona', authMiddleware, async (req, res) => { 
  const id_personal = req.session.user.id_personal; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 

  const query = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal FROM Personal p WHERE id_personal=?"; // OBTENER SUBORDINADOS A EVALUAR
  try {
    const [persona] = await db.query(query,id_personal);
    res.json({ success: true, persona});
  } catch (error) {
    console.error('Error al obtener persona:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

//RUTAS DE ARMANDO

// Obtener todos los personales
router.get('/personal', authMiddleware, async (req, res) => {
  try {
    const [personal] = await db.query(`
      SELECT p.id_personal, 
             p.nombre_personal, 
             p.apaterno_personal,
             p.amaterno_personal, 
             p.fecha_nacimiento_personal, 
             p.telefono_personal, 
             p.estado_personal,
             pu.id_puesto, 
             pu.nombre_puesto, 
             GROUP_CONCAT(r.nombre_rol) AS roles,
             u.correo_usuario
      FROM Personal p
      LEFT JOIN Puesto pu ON p.id_puesto = pu.id_puesto
      LEFT JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
      LEFT JOIN Rol r ON pr.id_rol = r.id_rol
      LEFT JOIN Usuario u ON p.id_usuario = u.id_usuario
      GROUP BY p.id_personal
    `);
    res.json(personal.map(p => ({
      ...p,
      estado_personal: p.estado_personal === 1 ? 'Activo' : 'Inactivo'
    })));
  } catch (error) {
    console.error('Error al obtener personal:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener personal' });
  }
});

// Obtener un personal específico por ID
router.get('/personal/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [personal] = await db.query(`
      SELECT p.id_personal, 
             p.nombre_personal, 
             p.apaterno_personal, 
             p.amaterno_personal, 
             p.fecha_nacimiento_personal, 
             p.telefono_personal, 
             p.estado_personal,
             pu.id_puesto, 
             pu.nombre_puesto, 
             GROUP_CONCAT(r.nombre_rol) AS roles,
             u.correo_usuario
      FROM Personal p
      LEFT JOIN Puesto pu ON p.id_puesto = pu.id_puesto
      LEFT JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
      LEFT JOIN Rol r ON pr.id_rol = r.id_rol
      LEFT JOIN Usuario u ON p.id_usuario = u.id_usuario
      WHERE p.id_personal = ?
      GROUP BY p.id_personal
    `, [id]);
    if (personal.length === 0) {
      return res.status(404).json({ success: false, message: 'Personal no encontrado' });
    }
    res.json({
      ...personal[0],
      estado_personal: personal[0].estado_personal === 1 ? 'Activo' : 'Inactivo'
    });
  } catch (error) {
    console.error('Error al obtener personal:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener personal' });
  }
});

// Obtener todos los puestos
router.get('/puestos', authMiddleware, async (req, res) => {
  try {
    const [puestos] = await db.query('SELECT id_puesto, nombre_puesto FROM Puesto');
    res.json(puestos);
  } catch (error) {
    console.error('Error al obtener puestos:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener puestos' });
  }
});

// Obtener todos los roles
router.get('/roles', authMiddleware, async (req, res) => {
  try {
    const [roles] = await db.query('SELECT id_rol, nombre_rol FROM Rol');
    res.json(roles);
  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener roles' });
  }
});

// Agregar un nuevo personal
router.post('/personal', authMiddleware, async (req, res) => {
  const { nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado, id_puesto, roles, correo, contrasena } = req.body;
  try {
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken || csrfToken !== req.csrfToken()) { // Ensure req.csrfToken() is a function
      console.log('CSRF Token recibido:', csrfToken);
      console.log('CSRF Token esperado:', req.csrfToken());
      return res.status(403).json({ success: false, message: 'Token CSRF inválido' });
    }

    // Verificar si los roles coinciden con un puesto existente
    const [existingPuestos] = await db.query(`
      SELECT p.id_puesto, GROUP_CONCAT(pr.id_rol) AS role_ids
      FROM Puesto p
      LEFT JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
      GROUP BY p.id_puesto
    `);
    const roleIdsStr = roles.sort().join(',');
    let selectedIdPuesto = id_puesto || null;
    if (!selectedIdPuesto) {
      const matchingPuesto = existingPuestos.find(p => 
        p.role_ids && p.role_ids.split(',').sort().join(',') === roleIdsStr
      );
      selectedIdPuesto = matchingPuesto ? matchingPuesto.id_puesto : null;
    }

    // Crear nuevo puesto si no hay coincidencia y hay roles
    let newIdPuesto = selectedIdPuesto;
    if (!newIdPuesto && roles && roles.length > 0) {
      const [result] = await db.query(
        'INSERT INTO Puesto (nombre_puesto) VALUES (?)',
        [`Puesto_${Date.now()}`]
      );
      newIdPuesto = result.insertId;
      await Promise.all(roles.map(id_rol => 
        db.query('INSERT INTO Puesto_Rol (id_puesto, id_rol) VALUES (?, ?)', [newIdPuesto, id_rol])
      ));
    }

    // Insertar usuario y personal
    const [userResult] = await db.query(
      'INSERT INTO Usuario (correo_usuario, contraseña_usuario) VALUES (?, ?)',
      [correo, await bcrypt.hash(contrasena, 10)]
    );
    const id_usuario = userResult.insertId;
    const [personalResult] = await db.query(
      'INSERT INTO Personal (nombre_personal, apaterno_personal, amaterno_personal, fecha_nacimiento_personal, telefono_personal, estado_personal, id_puesto, id_usuario) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado === 'Activo' ? 1 : 0, newIdPuesto || selectedIdPuesto, id_usuario]
    );
    const id_personal = personalResult.insertId;

    // Insertar Evaluador
    await db.query('INSERT INTO Evaluador (id_personal) VALUES (?)', [id_personal]);

    // Poblar Jerarquia, Personal_Jefe, Personal_Subordinado y Personal_Par
    const [jerarquia] = await db.query('SELECT id_rol, id_jefe FROM Jerarquia');
    const roleMap = jerarquia.reduce((map, { id_rol, id_jefe }) => {
      map[id_rol] = id_jefe;
      return map;
    }, {});

    const personalRoles = await db.query(
      'SELECT id_rol FROM Puesto_Rol WHERE id_puesto = ?',
      [newIdPuesto || selectedIdPuesto]
    );

    await Promise.all(personalRoles[0].map(async ({ id_rol }) => {
      if (!jerarquia.find(j => j.id_rol === id_rol)) {
        await db.query('INSERT INTO Jerarquia (id_rol, id_jefe) VALUES (?, ?)', [id_rol, roleMap[id_rol] || null]);
      }

      const [otherPersonals] = await db.query(`
        SELECT p.id_personal
        FROM Personal p
        JOIN Puesto pu ON p.id_puesto = pu.id_puesto
        JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
        WHERE pr.id_rol = ? AND p.id_personal != ?
      `, [id_rol, id_personal]);

      otherPersonals.forEach(async ({ id_personal: otherId }) => {
        const otherEvaluator = (await db.query('SELECT id_evaluador FROM Evaluador WHERE id_personal = ?', [otherId]))[0][0]?.id_evaluador;

        if (roleMap[id_rol]) {
          await db.query(
            'INSERT INTO Personal_Jefe (id_evaluador, id_personal, estado_evaluacion_jefe) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_jefe = 0',
            [otherEvaluator, id_personal]
          );
        }

        const [subordinates] = await db.query(
          'SELECT id_rol FROM Jerarquia WHERE id_jefe = ?',
          [id_rol]
        );
        if (subordinates.length > 0) {
          await db.query(
            'INSERT INTO Personal_Subordinado (id_evaluador, id_personal, estado_evaluacion_subordinado) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_subordinado = 0',
            [otherEvaluator, id_personal]
          );
        }

        await db.query(
          'INSERT INTO Personal_Par (id_evaluador, id_personal, estado_evaluacion_par) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_par = 0',
          [otherEvaluator, id_personal]
        );
      });
    }));

    res.json({ success: true, message: 'Personal agregado exitosamente', id_personal });
  } catch (error) {
    console.error('Error al agregar personal:', error);
    res.status(500).json({ success: false, message: 'Error interno al agregar personal' });
  }
});

// Actualizar un personal existente
router.put('/personal/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado, id_puesto, roles, correo, contrasena } = req.body;
  try {
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken || csrfToken !== req.csrfToken()) {
      console.log('CSRF Token recibido:', csrfToken);
      console.log('CSRF Token esperado:', req.csrfToken());
      return res.status(403).json({ success: false, message: 'Token CSRF inválido' });
    }

    const [existingPersonal] = await db.query('SELECT id_usuario, id_puesto FROM Personal WHERE id_personal = ?', [id]);
    if (!existingPersonal.length) {
      return res.status(404).json({ success: false, message: 'Personal no encontrado' });
    }
    const { id_usuario, id_puesto: currentIdPuesto } = existingPersonal[0];

    await db.query(
      'UPDATE Usuario SET correo_usuario = ?' + (contrasena ? ', contraseña_usuario = ?' : '') + ' WHERE id_usuario = ?',
      [correo, contrasena ? await bcrypt.hash(contrasena, 10) : null, id_usuario]
    );

    const [existingPuestos] = await db.query(`
      SELECT p.id_puesto, GROUP_CONCAT(pr.id_rol) AS role_ids
      FROM Puesto p
      LEFT JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
      GROUP BY p.id_puesto
    `);
    const roleIdsStr = roles.sort().join(',');
    let selectedIdPuesto = id_puesto || currentIdPuesto;
    if (!selectedIdPuesto || (roles && roles.length > 0)) {
      const matchingPuesto = existingPuestos.find(p => 
        p.role_ids && p.role_ids.split(',').sort().join(',') === roleIdsStr
      );
      selectedIdPuesto = matchingPuesto ? matchingPuesto.id_puesto : null;
    }

    let newIdPuesto = selectedIdPuesto;
    if (!newIdPuesto && roles && roles.length > 0) {
      const [result] = await db.query(
        'INSERT INTO Puesto (nombre_puesto) VALUES (?)',
        [`Puesto_${Date.now()}`]
      );
      newIdPuesto = result.insertId;
      await Promise.all(roles.map(id_rol => 
        db.query('INSERT INTO Puesto_Rol (id_puesto, id_rol) VALUES (?, ?)', [newIdPuesto, id_rol])
      ));
    } else if (newIdPuesto && roles && roles.length > 0) {
      await db.query('DELETE FROM Puesto_Rol WHERE id_puesto = ?', [newIdPuesto]);
      await Promise.all(roles.map(id_rol => 
        db.query('INSERT INTO Puesto_Rol (id_puesto, id_rol) VALUES (?, ?)', [newIdPuesto, id_rol])
      ));
    }

    await db.query(
      'UPDATE Personal SET nombre_personal = ?, apaterno_personal = ?, amaterno_personal = ?, fecha_nacimiento_personal = ?, telefono_personal = ?, estado_personal = ?, id_puesto = ? WHERE id_personal = ?',
      [nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado === 'Activo' ? 1 : 0, newIdPuesto || selectedIdPuesto, id]
    );

    const [jerarquia] = await db.query('SELECT id_rol, id_jefe FROM Jerarquia');
    const roleMap = jerarquia.reduce((map, { id_rol, id_jefe }) => {
      map[id_rol] = id_jefe;
      return map;
    }, {});

    const personalRoles = await db.query(
      'SELECT id_rol FROM Puesto_Rol WHERE id_puesto = ?',
      [newIdPuesto || selectedIdPuesto]
    );

    await Promise.all(personalRoles[0].map(async ({ id_rol }) => {
      const [otherPersonals] = await db.query(`
        SELECT p.id_personal
        FROM Personal p
        JOIN Puesto pu ON p.id_puesto = pu.id_puesto
        JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
        WHERE pr.id_rol = ? AND p.id_personal != ?
      `, [id_rol, id]);

      otherPersonals.forEach(async ({ id_personal: otherId }) => {
        const otherEvaluator = (await db.query('SELECT id_evaluador FROM Evaluador WHERE id_personal = ?', [otherId]))[0][0]?.id_evaluador;

        if (roleMap[id_rol]) {
          await db.query(
            'INSERT INTO Personal_Jefe (id_evaluador, id_personal, estado_evaluacion_jefe) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_jefe = 0',
            [otherEvaluator, id]
          );
        }

        const [subordinates] = await db.query(
          'SELECT id_rol FROM Jerarquia WHERE id_jefe = ?',
          [id_rol]
        );
        if (subordinates.length > 0) {
          await db.query(
            'INSERT INTO Personal_Subordinado (id_evaluador, id_personal, estado_evaluacion_subordinado) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_subordinado = 0',
            [otherEvaluator, id]
          );
        }

        await db.query(
          'INSERT INTO Personal_Par (id_evaluador, id_personal, estado_evaluacion_par) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_par = 0',
          [otherEvaluator, id]
        );
      });
    }));

    res.json({ success: true, message: 'Personal actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar personal:', error);
    res.status(500).json({ success: false, message: 'Error interno al actualizar personal' });
  }
});

// Eliminar un personal
router.delete('/personal/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [personal] = await db.query('SELECT id_puesto, id_usuario FROM Personal WHERE id_personal = ?', [id]);
    if (personal.length === 0) {
      return res.status(404).json({ success: false, message: 'Personal no encontrado' });
    }
    await db.query('DELETE FROM Puesto_Rol WHERE id_puesto = ?', [personal[0].id_puesto]);
    await db.query('DELETE FROM Usuario WHERE id_usuario = ?', [personal[0].id_usuario]);
    await db.query('DELETE FROM Personal WHERE id_personal = ?', [id]);
    res.json({ success: true, message: 'Personal eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar personal:', error);
    res.status(500).json({ success: false, message: 'Error interno al eliminar personal' });
  }
});

// RUTA PARA OBTENER TODOS LOS TALLERES CON PERSONAL Y ALUMNOS
router.get('/talleres-personal-alumnos', authMiddleware, async (req, res) => {
  try {
    const [talleres] = await db.query(
      'SELECT t.id_taller, t.nombre_taller, p.id_personal, CONCAT(p.nombre_personal, " ", p.apaterno_personal) AS profesor, COUNT(at.id_alumno) AS num_alumnos ' +
      'FROM Taller t ' +
      'LEFT JOIN Personal_taller pt ON t.id_taller = pt.id_taller ' +
      'LEFT JOIN Personal p ON pt.id_personal = p.id_personal ' +
      'LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller ' +
      'GROUP BY t.id_taller, t.nombre_taller, p.id_personal, p.nombre_personal, p.apaterno_personal'
    );
    res.json({ success: true, talleres });
  } catch (error) {
    console.error('Error al obtener talleres:', error);
    res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
  }
});

// RUTA PARA OBTENER DETALLES DE UN TALLER ESPECÍFICO
router.get('/talleres-personal-alumnos/:id_taller', authMiddleware, async (req, res) => {
  const { id_taller } = req.params;
  try {
    const [taller] = await db.query(
      'SELECT t.id_taller, t.nombre_taller, p.id_personal, CONCAT(p.nombre_personal, " ", p.apaterno_personal) AS profesor, COUNT(at.id_alumno) AS num_alumnos ' +
      'FROM Taller t ' +
      'LEFT JOIN Personal_taller pt ON t.id_taller = pt.id_taller ' +
      'LEFT JOIN Personal p ON pt.id_personal = p.id_personal ' +
      'LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller ' +
      'WHERE t.id_taller = ? ' +
      'GROUP BY t.id_taller, t.nombre_taller, p.id_personal, p.nombre_personal, p.apaterno_personal',
      [id_taller]
    );
    if (taller.length === 0) {
      return res.status(404).json({ success: false, message: 'Taller no encontrado.' });
    }
    res.json({ success: true, taller: taller[0] });
  } catch (error) {
    console.error('Error al obtener taller:', error);
    res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
  }
});

// RUTA PARA OBTENER LA LISTA DE ALUMNOS INSCRITOS EN UN TALLER ESPECÍFICO
router.get('/talleres-personal-alumnos/:id_taller/alumnos', authMiddleware, async (req, res) => {
  const { id_taller } = req.params;
  try {
    const [taller] = await db.query('SELECT nombre_taller FROM Taller WHERE id_taller = ?', [id_taller]);
    if (taller.length === 0) throw new Error('Taller no encontrado');
    const [alumnos] = await db.query(
      'SELECT a.id_alumno, CONCAT(a.nombre_alumno, " ", a.apaterno_alumno, " ", a.amaterno_alumno) AS nombre_completo, g.grado, g.grupo ' +
      'FROM Alumno_Taller at ' +
      'JOIN Alumno a ON at.id_alumno = a.id_alumno ' +
      'JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo ' +
      'WHERE at.id_taller = ? AND a.estado_alumno = 1',
      [id_taller]
    );
    res.json({ success: true, taller_nombre: taller[0].nombre_taller, alumnos });
  } catch (error) {
    console.error('Error al obtener alumnos:', error);
    res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
  }
});

// RUTA PARA CREAR UN NUEVO TALLER
router.post('/talleres-personal-alumnos', authMiddleware, async (req, res) => {
  const { nombre_taller, id_personal } = req.body;
  try {
    const [result] = await db.query('INSERT INTO Taller (nombre_taller) VALUES (?)', [nombre_taller]);
    await db.query('INSERT INTO Personal_taller (id_personal, id_taller) VALUES (?, ?)', [id_personal, result.insertId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al crear taller:', error);
    res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
  }
});

// RUTA PARA ACTUALIZAR UN TALLER EXISTENTE
router.put('/talleres-personal-alumnos/:id_taller', authMiddleware, async (req, res) => {
  const { id_taller } = req.params;
  const { nombre_taller, id_personal } = req.body;
  try {
    await db.query('UPDATE Taller SET nombre_taller = ? WHERE id_taller = ?', [nombre_taller, id_taller]);
    await db.query('UPDATE Personal_taller SET id_personal = ? WHERE id_taller = ?', [id_personal, id_taller]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al actualizar taller:', error);
    res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
  }
});

// RUTA PARA ELIMINAR UN TALLER
router.delete('/talleres-personal-alumnos/:id_taller', authMiddleware, async (req, res) => {
  const { id_taller } = req.params;
  try {
    await db.query('DELETE FROM Personal_taller WHERE id_taller = ?', [id_taller]);
    await db.query('DELETE FROM Taller WHERE id_taller = ?', [id_taller]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar taller:', error);
    res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
  }
});

// RUTA PARA BUSCAR TALLERES POR NOMBRE O PROFESOR
router.get('/talleres-personal-alumnos/buscar', authMiddleware, async (req, res) => {
  const term = req.query.term?.toLowerCase() || '';
  try {
    const [talleres] = await db.query(
      'SELECT t.id_taller, t.nombre_taller, p.id_personal, CONCAT(p.nombre_personal, " ", p.apaterno_personal) AS profesor, COUNT(at.id_alumno) AS num_alumnos ' +
      'FROM Taller t ' +
      'LEFT JOIN Personal_taller pt ON t.id_taller = pt.id_taller ' +
      'LEFT JOIN Personal p ON pt.id_personal = p.id_personal ' +
      'LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller ' +
      'WHERE LOWER(t.nombre_taller) LIKE ? OR LOWER(CONCAT(p.nombre_personal, " ", p.apaterno_personal)) LIKE ? ' +
      'GROUP BY t.id_taller, t.nombre_taller, p.id_personal, p.nombre_personal, p.apaterno_personal',
      [`%${term}%`, `%${term}%`]
    );
    res.json({ success: true, talleres });
  } catch (error) {
    console.error('Error al buscar talleres:', error);
    res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
  }
});

// RUTA PARA OBTENER LA LISTA DE PROFESORES
router.get('/personal-profesores', authMiddleware, async (req, res) => {
    try {
        const [personal] = await db.query(
            'SELECT id_personal, nombre_personal, apaterno_personal FROM Personal WHERE estado_personal = 1'
        );
        res.json({ success: true, personal });
    } catch (error) {
        console.error('Error al obtener personal:', error);
        res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
    }
});


//RUTA PARA PRUEBA NADAMÁS
router.get('/debug', (req, res) => {
  res.send('Rutas funcionando');
});


module.exports = router;

