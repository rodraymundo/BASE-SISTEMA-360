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
  const esDirectorGeneral = user.roles?.some(rol => rol.nombre_rol === 'DIRECTOR GENERAL');

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
// (RODRIGO)
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

router.get('/Elegir-Taller', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Elegir-Taller.html'));
});

// PERSONAL
// (RODRIGO)
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

router.get('/Gestion-Kpis-Permisos', bloquearAlumnos, authMiddleware, permisoMiddleware ('permiso_kpis'), 
(req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Gestion-Kpis-Permisos.html')); 
});

router.get('/Gestion-Materias-Permisos', bloquearAlumnos, authMiddleware, permisoMiddleware ('permiso_materias'), (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Gestion-Materias-Permisos.html'));
});


router.get('/Mis-Evaluaciones-Dir-General', bloquearAlumnos, authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Evaluaciones360.html'));
});

router.get('/Gestion-Personal-Resultados', authMiddleware, bloquearAlumnos, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Gestion-Personal-Resultados.html'));
});

router.get('/Gestion-Permisos', authMiddleware, bloquearAlumnos, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/html/Gestion-Permisos.html'));
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
        res.json({ success: true , userType, redirect: '/Dashboard' });
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
        res.json({ success: true , userType, redirect: '/Dashboard' });
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

//SELECCIONAR TALLER

// --- Obtener información del alumno de la sesión ---
router.get('/mi-alumno', authMiddleware, async (req, res) => {
  try {
    const id_alumno = req.session.user?.id_alumno;
    if (!id_alumno) return res.json({ success: false, message: 'No hay alumno en sesión' });

    const [rows] = await db.query(`
      SELECT a.id_alumno, a.id_grado_grupo, gg.grado, gg.grupo
      FROM Alumno a
      LEFT JOIN Grado_grupo gg ON gg.id_grado_grupo = a.id_grado_grupo
      WHERE a.id_alumno = ?
    `, [id_alumno]);

    if (!rows.length) return res.json({ success: false, message: 'Alumno no encontrado' });
    res.json({ success: true, alumno: rows[0] });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Error al obtener alumno' });
  }
});

// --- Talleres extra (todos los registros de la tabla Taller) ---
router.get('/talleres', authMiddleware, async (req, res) => {
  try {
    const [talleres] = await db.query(`
      SELECT DISTINCT t.id_taller, t.nombre_taller 
      FROM Taller t
      JOIN Personal_Taller pt ON t.id_taller = pt.id_taller
      WHERE pt.id_personal IS NOT NULL
      ORDER BY t.nombre_taller
    `);
    res.json({ success: true, talleres });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Error al obtener talleres' });
  }
});

// --- Talleres de arte disponibles para un grado (usar Personal_Arte_Especialidad + Arte_Especialidad) --- 
// Devuelve id_personal y, si existe, id_materia asociado (intento por Grupo_Materia)
router.get('/talleres-arte/:id_grado_grupo', authMiddleware, async (req, res) => {
  const { id_grado_grupo } = req.params;
  try {
    const [artes] = await db.query(`
      SELECT 
        pa.id_personal,
        a.id_arte_especialidad,
        a.nombre_arte_especialidad,
        CONCAT(p.nombre_personal, ' ', p.apaterno_personal) AS nombre_personal,
        -- intentar obtener materia asociada al personal en ese grado (si existe)
        gm.id_materia
      FROM Personal_Arte_Especialidad pa
      JOIN Arte_Especialidad a ON a.id_arte_especialidad = pa.id_arte_especialidad
      LEFT JOIN Personal p ON p.id_personal = pa.id_personal
      LEFT JOIN Grupo_Materia gm ON gm.id_personal = pa.id_personal AND gm.id_grado_grupo = pa.id_grado_grupo
      WHERE pa.id_grado_grupo = ?
      GROUP BY a.id_arte_especialidad, pa.id_personal
      ORDER BY a.nombre_arte_especialidad
    `, [id_grado_grupo]);

    res.json({ success: true, artes });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Error al obtener talleres de arte' });
  }
});

// --- Obtener selección actual del alumno (extraescolares y arte) ---
router.get('/talleres-por-alumno', authMiddleware, async (req, res) => {
  try {
    const id_alumno = req.session.user?.id_alumno;
    if (!id_alumno) return res.json({ success: false, message: 'No hay alumno en sesión' });

    const [extraes] = await db.query(`
      SELECT id_taller
      FROM Alumno_Taller
      WHERE id_alumno = ?
    `, [id_alumno]);

    const [arteRows] = await db.query(`
      SELECT id_arte_especialidad, id_personal, id_materia
      FROM Alumno_Arte_Especialidad
      WHERE id_alumno = ?
      LIMIT 1
    `, [id_alumno]);

    res.json({
      success: true,
      extraescolares: extraes,
      arte: arteRows[0] || null
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: 'Error al obtener selección del alumno' });
  }
});

// --- Guardar elección del alumno (arte obligatorio para 1-3 si aplica) ---
router.post('/guardar-eleccion-taller', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user?.id_alumno;
  if (!id_alumno) return res.json({ success: false, message: 'No hay alumno en sesión' });

  const { arte, extraescolares } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Obtener talleres actuales
    const [talleresDB] = await connection.query(`SELECT id_taller FROM Alumno_Taller WHERE id_alumno = ?`, [id_alumno]);
    const talleresDBIds = talleresDB.map(t => t.id_taller);

    const nuevosIds = Array.isArray(extraescolares) ? extraescolares.map(id => parseInt(id, 10)) : [];
    const borrarIds = talleresDBIds.filter(id => !nuevosIds.includes(id));
    const insertarIds = nuevosIds.filter(id => !talleresDBIds.includes(id));

    // Eliminar talleres que ya no están
    if (borrarIds.length) {
      await connection.query(`DELETE FROM Alumno_Taller WHERE id_alumno = ? AND id_taller IN (?)`, [id_alumno, borrarIds]);
    }

    // Insertar nuevos talleres con asignación rotativa de profesores
    for (const id_taller of insertarIds) {
      const [profesores] = await connection.query(`SELECT id_personal FROM Personal_taller WHERE id_taller = ?`, [id_taller]);

      let id_personal = null;
      if (profesores.length > 0) {
        // Contador global por taller (puede ser un campo en memoria o simple random si quieres)
        // Aquí simplemente asignamos el profesor con menos alumnos
        const [conteos] = await connection.query(`
          SELECT id_personal, COUNT(*) AS total FROM Alumno_Taller
          WHERE id_taller = ?
          GROUP BY id_personal
          ORDER BY total ASC
        `, [id_taller]);
        if (conteos.length) {
          id_personal = conteos[0].id_personal;
        } else {
          id_personal = profesores[0].id_personal;
        }
      }

      await connection.query(`
        INSERT INTO Alumno_Taller (id_alumno, id_taller, estado_evaluacion_taller, id_personal)
        VALUES (?, ?, 0, ?)
      `, [id_alumno, id_taller, id_personal]);
    }

    // Actualizar taller de arte
    await connection.query(`DELETE FROM Alumno_Arte_Especialidad WHERE id_alumno = ?`, [id_alumno]);
    if (arte) {
      // Asignación de id_materia (puedes mantener la lógica que ya tenías)
      let id_materia_arte = null;
      const [[materiaRow]] = await connection.query(`
        SELECT id_materia FROM Materia WHERE nombre_materia LIKE 'Arte%' LIMIT 1
      `);
      id_materia_arte = materiaRow ? materiaRow.id_materia : null;

      await connection.query(`
        INSERT INTO Alumno_Arte_Especialidad 
          (id_alumno, id_personal, id_arte_especialidad, id_materia, estado_evaluacion_arte_especialidad)
        VALUES (?, ?, ?, ?, 0)
      `, [id_alumno, arte.id_personal, arte.id_arte_especialidad, id_materia_arte]);
    }

    await connection.commit();
    res.json({ success: true });

  } catch (error) {
    await connection.rollback();
    console.error('Error guardar-eleccion-taller:', error);
    res.json({ success: false, message: 'Error al guardar la elección' });
  } finally {
    connection.release();
  }
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
    const currentMonth = new Date().getMonth() + 1; // Mes actual (1-12)
    let GradosActivos;
    if (currentMonth >= 8 || currentMonth <= 1) {
      GradosActivos = [1, 3, 5]; // Agosto a enero
    } else {
      GradosActivos = [2, 4, 6]; // Febrero a julio
    }

    const [grupos] = await db.query(`
      SELECT DISTINCT gg.id_grado_grupo, gg.grado, gg.grupo 
      FROM Grado_grupo gg 
      JOIN Grupo_Materia gm ON gg.id_grado_grupo = gm.id_grado_grupo 
      WHERE gm.id_personal IS NOT NULL 
      AND gg.grado IN (?)
      ORDER BY gg.grado, gg.grupo
    `, [GradosActivos]);

    res.json({ success: true, grupos });
  } catch (error) {
    console.error('Error al obtener grupos en curso:', error);
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
        MAX(a.nombre_alumno) AS nombre_alumno,
        MAX(a.apaterno_alumno) AS apaterno_alumno,
        MAX(a.amaterno_alumno) AS amaterno_alumno,
        MAX(a.id_grado_grupo) AS id_grado_grupo,
        MAX(a.id_personal) AS id_personal,
        MAX(u.correo_usuario) AS correo_alumno,
        MAX(g.grado) AS grado,
        MAX(g.grupo) AS grupo,
        MAX(p.nombre_personal) AS nombre_counselor,
        MAX(p.apaterno_personal) AS apaterno_counselor,
        GROUP_CONCAT(DISTINCT t.nombre_taller SEPARATOR ', ') AS talleres,
        MAX(ni.nombre_nivel_ingles) AS nombre_nivel_ingles,
        MAX(ae.nombre_arte_especialidad) AS nombre_arte_especialidad
      FROM Alumno a
      JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
      LEFT JOIN Usuario u ON a.id_usuario = u.id_usuario
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

    console.log('Alumnos por grupo:', JSON.stringify(alumnos, null, 2)); // Debug log
    res.json({ success: true, alumnos });
  } catch (error) {
    console.error('Error al obtener alumnos por grupo:', error);
    res.status(500).json({ success: false, message: 'Error al obtener alumnos del grupo' });
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
router.get('/talleres-para-alumnos', authMiddleware, async (req, res) => {
  try {
    const [talleres] = await db.query(`
      SELECT DISTINCT t.id_taller, t.nombre_taller 
      FROM Taller t
      JOIN Personal_Taller pt ON t.id_taller = pt.id_taller
      WHERE pt.id_personal IS NOT NULL
      ORDER BY t.nombre_taller
    `);
    res.json({ success: true, talleres });
  } catch (error) {
    console.error('Error al obtener talleres con docente asignado:', error);
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
        MAX(a.nombre_alumno) AS nombre_alumno,
        MAX(a.apaterno_alumno) AS apaterno_alumno,
        MAX(a.amaterno_alumno) AS amaterno_alumno,
        MAX(a.telefono_alumno) AS telefono_alumno,
        MAX(a.id_personal) AS id_personal,
        MAX(a.id_grado_grupo) AS id_grado_grupo,
        MAX(ani.id_nivel_ingles) AS id_nivel_ingles,
        MAX(aae.id_arte_especialidad) AS id_arte_especialidad,
        MAX(g.grado) AS grado,
        MAX(g.grupo) AS grupo,
        MAX(p.nombre_personal) AS nombre_counselor,
        MAX(p.apaterno_personal) AS apaterno_counselor,
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

    // 2. Insertar nuevos talleres con asignación de profesor rotativa
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

        // Obtener profesores del taller
        const [profesores] = await connection.query(`
          SELECT id_personal FROM Personal_taller
          WHERE id_taller = ?
        `, [taller.id_taller]);

        // Asignar profesor rotativo
        let id_personal = null;
        if (profesores.length > 0) {
          // Contar cuántos alumnos ya tiene cada profesor
          const [conteo] = await connection.query(`
            SELECT id_personal, COUNT(*) AS total
            FROM Alumno_Taller
            WHERE id_taller = ?
            GROUP BY id_personal
          `, [taller.id_taller]);

          // Ordenar profesores por menos alumnos para balancear
          const ordenado = profesores.map(p => {
            const c = conteo.find(x => x.id_personal === p.id_personal);
            return { id_personal: p.id_personal, total: c ? c.total : 0 };
          }).sort((a,b) => a.total - b.total);

          // Elegimos el profesor con menos alumnos
          id_personal = ordenado[0].id_personal;
        }

        // Insertar con profesor asignado
        await connection.query(`
          INSERT INTO Alumno_Taller (id_alumno, id_taller, estado_evaluacion_taller, id_personal)
          VALUES (?, ?, ?, ?)
        `, [id_alumno, taller.id_taller, yaEvaluado, id_personal]);
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
// ACTUALIZAR EL GRUPO DEL ALUMNO
router.post('/actualizar-grupo-alumno', authMiddleware, async (req, res) => {
  const { id_alumno, id_grado_grupo } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Obtener el nivel de inglés actual del alumno
    const [nivelInglesActual] = await connection.query(
      `SELECT id_nivel_ingles FROM Alumno_Nivel_Ingles WHERE id_alumno = ?`,
      [id_alumno]
    );

    // 2. Si el alumno tiene un nivel de inglés asignado, verificar si el nuevo grupo tiene un docente que lo imparta
    if (nivelInglesActual.length > 0 && nivelInglesActual[0].id_nivel_ingles) {
      const [docentesNivelIngles] = await connection.query(
        `SELECT 1 FROM Personal_Nivel_Ingles pni
         WHERE pni.id_grado_grupo = ? AND pni.id_nivel_ingles = ?`,
        [id_grado_grupo, nivelInglesActual[0].id_nivel_ingles]
      );

      if (docentesNivelIngles.length === 0) {
        throw new Error(
          'No se puede cambiar al grupo seleccionado porque no hay un docente asignado para el nivel de inglés actual del alumno.'
        );
      }
    }

    // 3. Actualizar grupo
    await connection.query(
      'UPDATE Alumno SET id_grado_grupo = ? WHERE id_alumno = ?',
      [id_grado_grupo, id_alumno]
    );

    // 4. Eliminar materias anteriores
    await connection.query(
      'DELETE FROM Alumno_Materia WHERE id_alumno = ?',
      [id_alumno]
    );

    // 5. Insertar nuevas materias del grupo
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
    res.status(500).json({ success: false, message: error.message || 'Error al actualizar grupo del alumno' });
  } finally {
    connection.release();
  }
});

//BUSCAR ALUMNOS
router.get('/buscar-alumnos', authMiddleware, async (req, res) => {
  const nombre = req.query.nombre?.trim();
  if (!nombre) {
    return res.status(400).json({ success: false, message: 'Nombre vacío' });
  }

  try {
    const currentMonth = new Date().getMonth() + 1; // Mes actual (1-12)
    let GradosActivos;
    if (currentMonth >= 8 || currentMonth <= 1) {
      GradosActivos = [1, 3, 5]; // Agosto a enero: grados impares
    } else {
      GradosActivos = [2, 4, 6]; // Febrero a julio: grados pares
    }

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
        u.correo_usuario AS correo_alumno,
        GROUP_CONCAT(DISTINCT t.nombre_taller SEPARATOR ', ') AS talleres,
        GROUP_CONCAT(DISTINCT ni.nombre_nivel_ingles SEPARATOR ', ') AS nombre_nivel_ingles,
        GROUP_CONCAT(DISTINCT ae.nombre_arte_especialidad SEPARATOR ', ') AS nombre_arte_especialidad
      FROM Alumno a
      LEFT JOIN Personal p ON a.id_personal = p.id_personal
      LEFT JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
      LEFT JOIN Usuario u ON a.id_usuario = u.id_usuario
      LEFT JOIN Alumno_Taller at ON a.id_alumno = at.id_alumno
      LEFT JOIN Taller t ON at.id_taller = t.id_taller
      LEFT JOIN Alumno_Nivel_Ingles ani ON a.id_alumno = ani.id_alumno
      LEFT JOIN Nivel_Ingles ni ON ani.id_nivel_ingles = ni.id_nivel_ingles
      LEFT JOIN Alumno_Arte_Especialidad aae ON a.id_alumno = aae.id_alumno
      LEFT JOIN Arte_Especialidad ae ON aae.id_arte_especialidad = ae.id_arte_especialidad
      WHERE (
        CONCAT_WS(' ', a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno) LIKE ? 
        OR u.correo_usuario LIKE ?
      )
      AND a.estado_alumno = 1
      AND g.grado IN (?)
      GROUP BY a.id_alumno
      ORDER BY a.apaterno_alumno, a.nombre_alumno
    `, [`%${nombre}%`, `%${nombre}%`, GradosActivos]);

    res.json({ success: true, alumnos });
  } catch (error) {
    console.error('Error al buscar alumnos:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// AGREGAR NUEVO ALUMNO
router.post('/insertar-nuevo-alumno', authMiddleware, async (req, res) => {
  const { id_alumno, nombre, apaterno, amaterno, correo, password, id_grado_grupo, id_personal, talleres, nivel_ingles, arte_especialidad} = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // VERIFICAR SI YA EXISTE UN ALUMNO CON ESA MATRÍCULA
    const [alumnoExistente] = await connection.query(`SELECT 1 FROM Alumno WHERE id_alumno = ?`, [id_alumno]);
    if (alumnoExistente.length > 0) throw new Error(`Ya existe un alumno con la matrícula ${id_alumno}`);

    // VERIFICAR SI YA EXISTE ESE CORREO
    const [correoExistente] = await connection.query(`SELECT 1 FROM Usuario WHERE correo_usuario = ?`, [correo]);
    if (correoExistente.length > 0) throw new Error(`Ya existe un usuario con el correo ${correo}`);

    //GENERAR CONTRASEÑA POR DEFECTO
    const username = correo.split('@')[0];
    const defaultPassword = `pass${username}`;
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // GENERAR NUEVO ID_USUARIO
    const [[{ maxId }]] = await connection.query('SELECT MAX(id_usuario) AS maxId FROM Usuario');
    const id_usuario = (maxId || 0) + 1;

    // INSERTAR EN USUARIO
    await connection.query(`INSERT INTO Usuario (id_usuario, correo_usuario, contraseña_usuario) VALUES (?, ?, ?)`,
      [id_usuario, correo, hashedPassword]);

    // INSERTAR EN ALUMNO
    await connection.query(`INSERT INTO Alumno (id_alumno, nombre_alumno, apaterno_alumno, amaterno_alumno, id_grado_grupo, id_personal, id_usuario)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [id_alumno, nombre, apaterno, amaterno, id_grado_grupo, id_personal, id_usuario]);

    // INSERTAR RELACIÓN CON TALLERES (con asignación de profesor balanceada)
    for (const id_taller of talleres) {
      // Obtener profesores del taller
      const [profesores] = await connection.query(`
        SELECT id_personal FROM Personal_taller WHERE id_taller = ?
      `, [id_taller]);

      let id_personal_asignado = null;

      if (profesores.length > 0) {
        // Contar alumnos asignados a cada profesor
        const [conteo] = await connection.query(`
          SELECT id_personal, COUNT(*) AS total
          FROM Alumno_Taller
          WHERE id_taller = ?
          GROUP BY id_personal
        `, [id_taller]);

        const ordenado = profesores.map(p => {
          const c = conteo.find(x => x.id_personal === p.id_personal);
          return { id_personal: p.id_personal, total: c ? c.total : 0 };
        }).sort((a,b) => a.total - b.total);

        // Elegir el profesor con menos alumnos
        id_personal_asignado = ordenado[0].id_personal;
      }

      await connection.query(`
        INSERT INTO Alumno_Taller (id_alumno, id_taller, estado_evaluacion_taller, id_personal)
        VALUES (?, ?, 0, ?)
      `, [id_alumno, id_taller, id_personal_asignado]);
    }

    // INSERTAR RELACIÓN CON MATERIAS DEL GRUPO
    const [materiasGrupo] = await connection.query(`SELECT id_materia, id_personal FROM Grupo_Materia WHERE id_grado_grupo = ?`, [id_grado_grupo]);
    for (const m of materiasGrupo) {
      await connection.query(`INSERT INTO Alumno_Materia (id_alumno, id_materia, id_personal, estado_evaluacion_materia)
        VALUES (?, ?, ?, 0)`, [id_alumno, m.id_materia, m.id_personal]);
    }

    // INSERTAR RELACIÓN CON SERVICIOS
    const [servicios] = await connection.query('SELECT id_servicio FROM Servicio');
    for (const s of servicios) {
      await connection.query(`INSERT INTO Alumno_Servicio (id_alumno, id_servicio, estado_evaluacion_servicio)
        VALUES (?, ?, 0)`, [id_alumno, s.id_servicio]);
    }

    // INSERTAR NIVEL DE INGLÉS Y ESPECIALIDAD DE ARTE
    if (nivel_ingles && nivel_ingles.id_nivel_ingles && nivel_ingles.id_personal && nivel_ingles.id_materia) {
      await connection.query(`INSERT INTO Alumno_Nivel_Ingles (id_alumno, id_personal, id_nivel_ingles, estado_evaluacion_nivel_ingles, id_materia)
        VALUES (?, ?, ?, 0, ?)`, [id_alumno, nivel_ingles.id_personal, nivel_ingles.id_nivel_ingles, nivel_ingles.id_materia]);
    }

    if (arte_especialidad && arte_especialidad.id_arte_especialidad && arte_especialidad.id_personal && arte_especialidad.id_materia) {
      await connection.query(`INSERT INTO Alumno_Arte_Especialidad (id_alumno, id_personal, id_arte_especialidad, estado_evaluacion_arte_especialidad, id_materia)
        VALUES (?, ?, ?, 0, ?)`, [id_alumno, arte_especialidad.id_personal, arte_especialidad.id_arte_especialidad, arte_especialidad.id_materia]);
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
    // 1) obtener el campo 'grado' del grupo
    const [ggRows] = await db.query(
      `SELECT grado FROM Grado_grupo WHERE id_grado_grupo = ? LIMIT 1`, 
      [id_grado_grupo]
    );
    if (!ggRows.length) {
      return res.status(404).json({ success: false, message: 'Grado_grupo no encontrado' });
    }

    // Normalizar grado a número: quitar todo lo que no sea dígito y parsear
    const rawGrado = String(ggRows[0].grado || '');
    const parsed = rawGrado.replace(/\D/g, ''); // ejemplo: "1°" -> "1"
    const gradoNumber = parsed ? parseInt(parsed, 10) : null;

    // 2) NIVELES DE INGLÉS
    // Si gm.id_materia existe lo usa; si no, intenta buscar Materia por grado (si lo tenemos),
    // si aún no encuentra, hace un fallback buscando cualquier Materia 'Inglés%' sin grado.
    const [niveles] = await db.query(`
      SELECT DISTINCT 
        ni.id_nivel_ingles, 
        ni.nombre_nivel_ingles,
        pni.id_personal,
        COALESCE(
          gm.id_materia,
          (SELECT id_materia FROM Materia WHERE nombre_materia LIKE 'Inglés%' 
            ${gradoNumber ? 'AND grado_materia = ?' : ''} LIMIT 1),
          (SELECT id_materia FROM Materia WHERE nombre_materia LIKE 'Inglés%' LIMIT 1)
        ) AS id_materia
      FROM Personal_Nivel_Ingles pni
      INNER JOIN Nivel_Ingles ni ON ni.id_nivel_ingles = pni.id_nivel_ingles
      LEFT JOIN Grupo_Materia gm ON gm.id_grado_grupo = pni.id_grado_grupo 
        AND gm.id_personal = pni.id_personal
      WHERE pni.id_grado_grupo = ?;
    `, gradoNumber ? [gradoNumber, id_grado_grupo] : [id_grado_grupo]);

    // 3) ARTES
    // Sólo intentamos materia de Arte si el gradoNumber está en 1..3 (según tu regla)
    let artes = [];
    if (gradoNumber && gradoNumber >= 1 && gradoNumber <= 3) {
      // buscamos igual: primero gm.id_materia, luego Materia con nombre LIKE 'Arte%' y grado_materia = gradoNumber
      const [artRows] = await db.query(`
        SELECT DISTINCT
          ae.id_arte_especialidad,
          ae.nombre_arte_especialidad,
          pae.id_personal,
          COALESCE(
            gm.id_materia,
            (SELECT id_materia FROM Materia WHERE nombre_materia LIKE 'Arte%' AND grado_materia = ? LIMIT 1),
            (SELECT id_materia FROM Materia WHERE nombre_materia LIKE 'Arte%' LIMIT 1)
          ) AS id_materia
        FROM Personal_Arte_Especialidad pae
        INNER JOIN Arte_Especialidad ae ON ae.id_arte_especialidad = pae.id_arte_especialidad
        LEFT JOIN Grupo_Materia gm ON gm.id_grado_grupo = pae.id_grado_grupo 
          AND gm.id_personal = pae.id_personal
        WHERE pae.id_grado_grupo = ?;
      `, [gradoNumber, id_grado_grupo]);

      artes = artRows;
    } else {
      // grado fuera de 1..3 -> no corresponde materia de arte
      artes = [];
    }

    console.log('gradoNumber:', gradoNumber);
    console.log('niveles ->', niveles);
    console.log('artes ->', artes);

    res.json({ success: true, niveles, artes, grado: rawGrado, gradoNumber });
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

// OBTENER TODOS LOS PSICOLOGOS
router.get('/getPsicologos', authMiddleware, async (req, res) => {
  const query = `SELECT pr.id_puesto FROM Puesto_rol pr WHERE pr.id_rol IN (SELECT r.id_rol FROM Rol r WHERE r.nombre_rol = "PEDAGÓGICO")`; // OBTENER PUESTOS QUE TIENE EL ROL DE PEDAGOGICO
  const query2 = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal FROM Personal p WHERE p.id_puesto IN (?)" // OBTENER PERSONAL CON LOS PUESTOS TRAIDOS

  try {
    const [puestos] = await db.query(query);
    const idPuestos = puestos.map(puesto =>
      puesto.id_puesto
    );
    const [psicologos] = await db.query(query2, [idPuestos]);
    res.json({ success: true, psicologos});
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
  const {id_servicio,respuestas,comentarios, id_personal} = req.body;
    let valoresRespuestas = [];
  let valoresComentarios = [];
  let query = '';
  let query2 = '';
  let query3 = '';

  if (respuestas != null) {

    if (id_personal == null) { // EN CASO DE QUE SEA SERVICIO DE PEDAGOGIA O EN UN FUTURO UN SERVCICIO QUE REQUIERA EVALUAR PERSONAL 
      valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
        id_alumno,
        id_servicio,
        respuesta.id_pregunta,
        respuesta.id_respuesta
      ]);
      valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
        id_alumno,
        id_servicio,
        comentario.tipo_comentario,
        comentario.comentario_servicio
      ]);
      query = "INSERT INTO Respuesta_Alumno_Servicio (id_alumno, id_servicio, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
      query2 = "INSERT INTO Comentario_Servicio (id_alumno, id_servicio, tipo_comentario, comentario_servicio) VALUES ?";  // AGREGAR EL COMENTARIO
      query3 = "UPDATE Alumno_Servicio set estado_evaluacion_servicio=1 WHERE id_alumno=? AND id_servicio=?" // ACTUALIZAR EL ESTADO DE EVALUACION
    }else{
      valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
        id_alumno,
        id_personal,
        respuesta.id_pregunta,
        respuesta.id_respuesta
      ]);
      valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
        id_alumno,
        id_personal,
        comentario.tipo_comentario,
        comentario.comentario_servicio
      ]);
      query = "INSERT INTO Respuesta_Alumno_Psicopedagogico (id_alumno, id_personal, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
      query2 = "INSERT INTO Comentario_Psicopedagogico (id_alumno, id_personal, tipo_comentario, comentario_servicio) VALUES ?";  // AGREGAR EL COMENTARIO
      query3 = "UPDATE Alumno_Servicio set estado_evaluacion_servicio=1 WHERE id_alumno=? AND id_servicio=?" // ACTUALIZAR EL ESTADO DE EVALUACION
    }

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
  }else{
    const query = "UPDATE Alumno_Servicio set estado_evaluacion_servicio=2 WHERE id_alumno=? AND id_servicio=?" // ACTUALIZAR EL ESTADO DE EVALUACION
      try { 
        await db.query(query,[id_alumno,id_servicio]);
        res.json({ success: true , message:'Servicio no utilizado'});
      } catch (error) {
        console.error('Error al hacer la insercion:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor. Intenta mas tarde' });
      }
  }
});

// OBTENER LOS TALLERES PARA EVALUARLOS
router.get('/getTalleres', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION
  console.log('iialum',id_alumno);
  const query = "SELECT t.id_taller, t.nombre_taller, t.img_taller, ta.estado_evaluacion_taller, p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal FROM Taller t, Alumno_Taller ta, Personal p, Personal_taller pt WHERE p.id_personal=pt.id_personal AND pt.id_taller=ta.id_taller AND t.id_taller=ta.id_taller AND ta.id_alumno=?"; // OBTENER LOS TALLERES A LOS QUE ESTA INSCRITO
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
    res.json({ success: true , message:'Profesor evaluada correctamente'});
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
//GENERALES
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

// Agregar un nuevo puesto
router.post('/puestos', authMiddleware, async (req, res) => {
  const { roles, categorias } = req.body;
  console.log('Datos recibidos para puesto:', { roles, categorias });

  try {
    // Validate roles
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ success: false, message: 'Debe seleccionar al menos un rol' });
    }

    // Validate categorias
    if (!categorias || !Array.isArray(categorias) || categorias.length === 0) {
      return res.status(400).json({ success: false, message: 'Debe seleccionar al menos una categoría' });
    }

    // Validate total percentage
    const totalPorcentaje = categorias.reduce((sum, c) => sum + c.porcentaje_categoria, 0);
    if (totalPorcentaje !== 100) {
      return res.status(400).json({ success: false, message: 'La suma de los porcentajes debe ser exactamente 100%' });
    }

    // Validate all roles exist
    const [existingRoles] = await db.query('SELECT id_rol, nombre_rol FROM Rol WHERE id_rol IN (?)', [roles]);
    if (existingRoles.length !== roles.length) {
      return res.status(400).json({ success: false, message: 'Uno o más roles seleccionados no existen' });
    }

    // Validate all categorias exist
    const [existingCategorias] = await db.query('SELECT id_categoria_kpi FROM Categoria_Kpi WHERE id_categoria_kpi IN (?)', [categorias.map(c => c.id_categoria_kpi)]);
    if (existingCategorias.length !== categorias.length) {
      return res.status(400).json({ success: false, message: 'Una o más categorías seleccionadas no existen' });
    }

    // Check for duplicate role combination
    const [existingPuestos] = await db.query(`
      SELECT p.id_puesto, GROUP_CONCAT(pr.id_rol ORDER BY pr.id_rol) AS role_ids
      FROM Puesto p
      LEFT JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
      GROUP BY p.id_puesto
    `);
    const roleIdsStr = roles.sort((a, b) => a - b).join(',');
    const duplicatePuesto = existingPuestos.find(p => p.role_ids === roleIdsStr);
    if (duplicatePuesto) {
      return res.status(409).json({ success: false, message: 'Ya existe un puesto con esta combinación de roles' });
    }

    // Generate nombre_puesto from role names
    const roleNames = existingRoles
      .sort((a, b) => a.nombre_rol.localeCompare(b.nombre_rol))
      .map(r => r.nombre_rol.toUpperCase());
    const nombre_puesto = roleNames.join('/');

    // Insert new Puesto
    const [puestoResult] = await db.query(
      'INSERT INTO Puesto (nombre_puesto) VALUES (?)',
      [nombre_puesto]
    );
    const id_puesto = puestoResult.insertId;

    // Insert into Puesto_Rol
    await Promise.all(roles.map(id_rol =>
      db.query('INSERT INTO Puesto_Rol (id_puesto, id_rol) VALUES (?, ?)', [id_puesto, id_rol])
    ));

    // Insert into Puesto_Categoria
    await Promise.all(categorias.map(c =>
      db.query('INSERT INTO Puesto_Categoria (id_puesto, id_categoria_kpi, porcentaje_categoria) VALUES (?, ?, ?)', [id_puesto, c.id_categoria_kpi, c.porcentaje_categoria])
    ));

    res.json({ success: true, message: 'Puesto agregado exitosamente', id_puesto });
  } catch (error) {
    console.error('Error al agregar puesto:', error);
    res.status(500).json({ success: false, message: 'Error interno al agregar puesto' });
  }
});

// Obtener lista de categorías
router.get('/categorias', authMiddleware, async (req, res) => {
  try {
    const [categorias] = await db.query('SELECT id_categoria_kpi, nombre_categoria_kpi FROM Categoria_Kpi');
    res.json(categorias);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener categorías' });
  }
});



//PERSONAL
// Obtener lista de puestos con sus roles
router.get('/puestos/roles', authMiddleware, async (req, res) => {
  try {
    const [puestos] = await db.query(`
      SELECT p.id_puesto, GROUP_CONCAT(pr.id_rol ORDER BY pr.id_rol) AS role_ids
      FROM Puesto p
      LEFT JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
      GROUP BY p.id_puesto
    `);
    res.json(puestos);
  } catch (error) {
    console.error('Error al obtener puestos con roles:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener puestos con roles' });
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
  const { nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado, id_puesto, correo, contrasena } = req.body;
  console.log('Datos recibidos para personal:', { nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado, id_puesto, correo, contrasena });

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validate id_puesto exists
    const [puesto] = await connection.query('SELECT id_puesto FROM Puesto WHERE id_puesto = ?', [id_puesto]);
    if (!puesto.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El puesto seleccionado no existe' });
    }

    // Insert user
    const [userResult] = await connection.query(
      'INSERT INTO Usuario (correo_usuario, contraseña_usuario) VALUES (?, ?)',
      [correo, await bcrypt.hash(contrasena, 10)]
    );
    const id_usuario = userResult.insertId;

    // Insert personal
    const [personalResult] = await connection.query(
      'INSERT INTO Personal (nombre_personal, apaterno_personal, amaterno_personal, fecha_nacimiento_personal, telefono_personal, estado_personal, id_puesto, id_usuario) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado === 'Activo' ? 1 : 0, id_puesto, id_usuario]
    );
    const id_personal = personalResult.insertId;

    // Insert Evaluador
    const [evaluadorResult] = await connection.query('INSERT INTO Evaluador (id_personal) VALUES (?)', [id_personal]);
    const id_evaluador = evaluadorResult.insertId;

    // Inline logic to select 5 random Personal records for Personal_360 (excluding id_personal)
    const count = 5;
    const [personals] = await connection.query(
      'SELECT id_personal FROM Personal WHERE id_personal != ?',
      [id_personal]
    );
    const availableIds = personals.map(p => p.id_personal);
    if (availableIds.length < count) {
      await connection.rollback();
      throw new Error(`No hay suficientes personas disponibles para seleccionar ${count}. Solo hay ${availableIds.length}.`);
    }
    // Shuffle array and take first 'count' elements
    for (let i = availableIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
    }
    const randomPersonalIds = availableIds.slice(0, count);
    console.log('Personas seleccionadas para Personal_360:', randomPersonalIds);

    // Insert into Personal_360
    await Promise.all(randomPersonalIds.map(id_personal_evaluado =>
      connection.query(
        'INSERT INTO Personal_360 (id_evaluador, id_personal, estado_evaluacion_360) VALUES (?, ?, 0)',
        [id_evaluador, id_personal_evaluado]
      )
    ));

    // Fetch roles associated with id_puesto from Puesto_Rol
    const [roles] = await connection.query('SELECT id_rol FROM Puesto_Rol WHERE id_puesto = ?', [id_puesto]);
    const roleIds = roles.map(r => r.id_rol);

    // Populate Personal_Jefe based on Jerarquia (bosses)
    const [jerarquia] = await connection.query('SELECT id_rol, id_jefe FROM Jerarquia WHERE id_rol IN (?)', [roleIds]);
    const bossRoleIds = jerarquia.map(j => j.id_jefe).filter(id => id !== null);

    if (bossRoleIds.length > 0) {
      // Find Personal who have the boss roles
      const [bossPersonals] = await connection.query(`
        SELECT DISTINCT p.id_personal
        FROM Personal p
        JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
        WHERE pr.id_rol IN (?) AND p.id_personal != ?
      `, [bossRoleIds, id_personal]);

      // Insert into Personal_Jefe: current Personal evaluates their bosses
      await Promise.all(bossPersonals.map(async ({ id_personal: bossId }) => {
        await connection.query(
          'INSERT INTO Personal_Jefe (id_evaluador, id_personal, estado_evaluacion_jefe) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_jefe = 0',
          [id_evaluador, bossId]
        );
      }));
    }

    // Populate Personal_Subordinado based on Jerarquia (subordinates)
    const [subordinateRoles] = await connection.query('SELECT id_rol FROM Jerarquia WHERE id_jefe IN (?)', [roleIds]);
    const subordinateRoleIds = subordinateRoles.map(r => r.id_rol);

    if (subordinateRoleIds.length > 0) {
      // Find Personal who have the subordinate roles
      const [subordinatePersonals] = await connection.query(`
        SELECT DISTINCT p.id_personal
        FROM Personal p
        JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
        WHERE pr.id_rol IN (?) AND p.id_personal != ?
      `, [subordinateRoleIds, id_personal]);

      // Insert into Personal_Subordinado: current Personal evaluates their subordinates
      await Promise.all(subordinatePersonals.map(async ({ id_personal: subordinateId }) => {
        await connection.query(
          'INSERT INTO Personal_Subordinado (id_evaluador, id_personal, estado_evaluacion_subordinado) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_subordinado = 0',
          [id_evaluador, subordinateId]
        );
      }));
    }

    // Populate Personal_Par (up to 5 random peers with same roles)
    const [peerPersonals] = await connection.query(`
      SELECT DISTINCT p.id_personal
      FROM Personal p
      JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
      WHERE pr.id_rol IN (?) AND p.id_personal != ?
    `, [roleIds, id_personal]);

    const peerIds = peerPersonals.map(p => p.id_personal);
    const maxPeers = 5;
    let selectedPeerIds = peerIds;
    if (peerIds.length > maxPeers) {
      // Shuffle array and take first 'maxPeers' elements
      for (let i = peerIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [peerIds[i], peerIds[j]] = [peerIds[j], peerIds[i]];
      }
      selectedPeerIds = peerIds.slice(0, maxPeers);
    }
    console.log('Pares seleccionados para Personal_Par:', selectedPeerIds);

    // Insert into Personal_Par: current Personal evaluates their selected peers
    await Promise.all(selectedPeerIds.map(async peerId =>
      connection.query(
        'INSERT INTO Personal_Par (id_evaluador, id_personal, estado_evaluacion_par) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_par = 0',
        [id_evaluador, peerId]
      )
    ));

    await connection.commit();
    res.json({ success: true, message: 'Personal agregado exitosamente', id_personal });
  } catch (error) {
    console.error('Error al agregar personal:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: `Error interno al agregar personal: ${error.message}` });
  } finally {
    if (connection) connection.release();
  }
});

// Actualizar un personal existente
router.put('/personal/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado, id_puesto, correo, contrasena } = req.body;

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validate id_personal exists
    const [existingPersonal] = await connection.query('SELECT id_usuario, id_puesto FROM Personal WHERE id_personal = ?', [id]);
    if (!existingPersonal.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Personal no encontrado' });
    }
    const { id_usuario } = existingPersonal[0];

    // Validate id_puesto exists
    const [puesto] = await connection.query('SELECT id_puesto FROM Puesto WHERE id_puesto = ?', [id_puesto]);
    if (!puesto.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El puesto seleccionado no existe' });
    }

    // Handle user creation or update
    let new_id_usuario = id_usuario;
    if (!id_usuario && correo) {
      // No id_usuario exists and correo is provided, create a new Usuario
      const [userResult] = await connection.query(
        'INSERT INTO Usuario (correo_usuario, contraseña_usuario) VALUES (?, ?)',
        [correo, contrasena ? await bcrypt.hash(contrasena, 10) : null]
      );
      new_id_usuario = userResult.insertId;
    } else if (id_usuario && correo) {
      // id_usuario exists, update the existing Usuario
      await connection.query(
        'UPDATE Usuario SET correo_usuario = ?' + (contrasena ? ', contraseña_usuario = ?' : '') + ' WHERE id_usuario = ?',
        contrasena ? [correo, await bcrypt.hash(contrasena, 10), id_usuario] : [correo, id_usuario]
      );
    }

    // Update Personal with new_id_usuario if a new user was created
    await connection.query(
      'UPDATE Personal SET nombre_personal = ?, apaterno_personal = ?, amaterno_personal = ?, fecha_nacimiento_personal = ?, telefono_personal = ?, estado_personal = ?, id_puesto = ?, id_usuario = ? WHERE id_personal = ?',
      [nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado === 'Activo' ? 1 : 0, id_puesto, new_id_usuario, id]
    );

    // Clear existing entries for this id_evaluador to avoid duplicates
    const [evaluador] = await connection.query('SELECT id_evaluador FROM Evaluador WHERE id_personal = ?', [id]);
    const id_evaluador = evaluador[0]?.id_evaluador;
    if (id_evaluador) {
      await connection.query('DELETE FROM Personal_Jefe WHERE id_evaluador = ?', [id_evaluador]);
      await connection.query('DELETE FROM Personal_Subordinado WHERE id_evaluador = ?', [id_evaluador]);
      await connection.query('DELETE FROM Personal_Par WHERE id_evaluador = ?', [id_evaluador]);
    }

    // Fetch roles associated with id_puesto from Puesto_Rol
    const [roles] = await connection.query('SELECT id_rol FROM Puesto_Rol WHERE id_puesto = ?', [id_puesto]);
    const roleIds = roles.map(r => r.id_rol);

    // Populate Personal_Jefe based on Jerarquia (bosses)
    const [jerarquia] = await connection.query('SELECT id_rol, id_jefe FROM Jerarquia WHERE id_rol IN (?)', [roleIds]);
    const bossRoleIds = jerarquia.map(j => j.id_jefe).filter(id => id !== null);

    if (bossRoleIds.length > 0) {
      // Find Personal who have the boss roles
      const [bossPersonals] = await connection.query(`
        SELECT DISTINCT p.id_personal
        FROM Personal p
        JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
        WHERE pr.id_rol IN (?) AND p.id_personal != ?
      `, [bossRoleIds, id]);

      // Insert into Personal_Jefe: current Personal evaluates their bosses
      await Promise.all(bossPersonals.map(async ({ id_personal: bossId }) => {
        await connection.query(
          'INSERT INTO Personal_Jefe (id_evaluador, id_personal, estado_evaluacion_jefe) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_jefe = 0',
          [id_evaluador, bossId]
        );
      }));
    }

    // Populate Personal_Subordinado based on Jerarquia (subordinates)
    const [subordinateRoles] = await connection.query('SELECT id_rol FROM Jerarquia WHERE id_jefe IN (?)', [roleIds]);
    const subordinateRoleIds = subordinateRoles.map(r => r.id_rol);

    if (subordinateRoleIds.length > 0) {
      // Find Personal who have the subordinate roles
      const [subordinatePersonals] = await connection.query(`
        SELECT DISTINCT p.id_personal
        FROM Personal p
        JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
        WHERE pr.id_rol IN (?) AND p.id_personal != ?
      `, [subordinateRoleIds, id]);

      // Insert into Personal_Subordinado: current Personal evaluates their subordinates
      await Promise.all(subordinatePersonals.map(async ({ id_personal: subordinateId }) => {
        await connection.query(
          'INSERT INTO Personal_Subordinado (id_evaluador, id_personal, estado_evaluacion_subordinado) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_subordinado = 0',
          [id_evaluador, subordinateId]
        );
      }));
    }

    // Populate Personal_Par (up to 5 random peers with same roles)
    const [peerPersonals] = await connection.query(`
      SELECT DISTINCT p.id_personal
      FROM Personal p
      JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
      WHERE pr.id_rol IN (?) AND p.id_personal != ?
    `, [roleIds, id]);

    const peerIds = peerPersonals.map(p => p.id_personal);
    const maxPeers = 5;
    let selectedPeerIds = peerIds;
    if (peerIds.length > maxPeers) {
      // Shuffle array and take first 'maxPeers' elements
      for (let i = peerIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [peerIds[i], peerIds[j]] = [peerIds[j], peerIds[i]];
      }
      selectedPeerIds = peerIds.slice(0, maxPeers);
    }
    console.log('Pares seleccionados para Personal_Par:', selectedPeerIds);

    // Insert into Personal_Par: current Personal evaluates their selected peers
    await Promise.all(selectedPeerIds.map(async peerId =>
      connection.query(
        'INSERT INTO Personal_Par (id_evaluador, id_personal, estado_evaluacion_par) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_par = 0',
        [id_evaluador, peerId]
      )
    ));

    await connection.commit();
    res.json({ success: true, message: 'Personal actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar personal:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: `Error interno al actualizar personal: ${error.message}` });
  } finally {
    if (connection) connection.release();
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

//RUTAS TALLERES
 
// RUTA PARA OBTENER TODOS LOS TALLERES
router.get('/talleres-personal-alumnos', authMiddleware, async (req, res) => {
  try {
    // 1) Obtener talleres y número de alumnos
    const [tallerRows] = await db.query(`
      SELECT t.id_taller, t.nombre_taller, COUNT(at.id_alumno) AS num_alumnos
      FROM Taller t
      LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller
      GROUP BY t.id_taller, t.nombre_taller
      ORDER BY t.nombre_taller
    `);

    const tallerIds = tallerRows.map(r => r.id_taller);
    if (tallerIds.length === 0) {
      return res.json({ success: true, talleres: [] });
    }

    // 2) Obtener todos los instructores para esos talleres
    const [instrRows] = await db.query(`
      SELECT pt.id_taller, p.id_personal, CONCAT(p.nombre_personal, ' ', p.apaterno_personal) AS nombre_personal
      FROM Personal_taller pt
      JOIN Personal p ON p.id_personal = pt.id_personal
      WHERE pt.id_taller IN (?)
    `, [tallerIds]);

    // 3) Agrupar instructores por taller
    const instrMap = {};
    instrRows.forEach(r => {
      if (!instrMap[r.id_taller]) instrMap[r.id_taller] = [];
      instrMap[r.id_taller].push({ id_personal: r.id_personal, nombre: r.nombre_personal });
    });

    // 4) Construir resultado final
    const talleres = tallerRows.map(t => ({
      id_taller: t.id_taller,
      nombre_taller: t.nombre_taller,
      num_alumnos: t.num_alumnos,
      instructors: instrMap[t.id_taller] || []
    }));

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
    const [rows] = await db.query(
      `SELECT 
         t.id_taller, 
         t.nombre_taller, 
         p.id_personal, 
         CONCAT(p.nombre_personal, " ", p.apaterno_personal) AS profesor, 
         COUNT(at.id_alumno) AS num_alumnos
       FROM Taller t
       LEFT JOIN Personal_taller pt ON t.id_taller = pt.id_taller
       LEFT JOIN Personal p ON pt.id_personal = p.id_personal
       LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller
       WHERE t.id_taller = ?
       GROUP BY t.id_taller, t.nombre_taller, p.id_personal, p.nombre_personal, p.apaterno_personal`,
      [id_taller]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Taller no encontrado.' });
    }

    const taller = {
      id_taller: rows[0].id_taller,
      nombre_taller: rows[0].nombre_taller,
      num_alumnos: rows[0].num_alumnos,
      instructors: rows
        .filter(r => r.id_personal !== null)
        .map(r => ({
          id_personal: r.id_personal,
          profesor: r.profesor
        }))
    };

    res.json({ success: true, taller });
  } catch (error) {
    console.error('Error al obtener taller:', error);
    res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
  }
});

// RUTA PARA OBTENER LA LISTA DE ALUMNOS INSCRITOS EN UN TALLER ESPECÍFICO (con filtro por profesor)
router.get('/talleres-personal-alumnos/:id_taller/alumnos', authMiddleware, async (req, res) => {
  const { id_taller } = req.params;
  const { id_personal } = req.query; // opcional

  try {
    const [taller] = await db.query('SELECT nombre_taller FROM Taller WHERE id_taller = ?', [id_taller]);
    if (taller.length === 0) return res.status(404).json({ success: false, message: 'Taller no encontrado' });

    // Construimos la consulta y parámetros condicionalmente
    let sql = `
      SELECT a.id_alumno,
             CONCAT(a.nombre_alumno, ' ', a.apaterno_alumno, ' ', IFNULL(a.amaterno_alumno, '')) AS nombre_completo,
             g.grado, g.grupo
      FROM Alumno_Taller at
      JOIN Alumno a ON at.id_alumno = a.id_alumno
      JOIN Grado_grupo g ON a.id_grado_grupo = g.id_grado_grupo
      WHERE at.id_taller = ? AND a.estado_alumno = 1
    `;
    const params = [id_taller];

    if (id_personal) {
      sql += ' AND at.id_personal = ?';
      params.push(id_personal);
    }

    const [alumnos] = await db.query(sql, params);

    res.json({
      success: true,
      taller_nombre: taller[0].nombre_taller,
      alumnos
    });
  } catch (error) {
    console.error('Error al obtener alumnos:', error);
    res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
  }
});


// RUTA PARA CREAR UN NUEVO TALLER
router.post('/talleres-personal-alumnos', authMiddleware, async (req, res) => {
    const { nombre_taller, id_personal } = req.body;

    // Depuración: Mostrar el cuerpo completo de la solicitud
    console.log('Cuerpo recibido en POST /talleres-personal-alumnos:', req.body);

    // Validar que no se envíe un id_taller en la creación
    if (req.body.id_taller) {
        return res.status(400).json({ success: false, message: 'No se puede especificar un ID para crear un nuevo taller.' });
    }

    if (!nombre_taller || !id_personal) {
        return res.status(400).json({ success: false, message: 'Faltan nombre_taller o id_personal.' });
    }

    try {
        await db.query('START TRANSACTION');

        // Verificar que id_personal exista en la tabla Personal
        const [personalCheck] = await db.query('SELECT id_personal FROM Personal WHERE id_personal = ?', [id_personal]);
        if (personalCheck.length === 0) {
            throw new Error('El ID de personal especificado no existe.');
        }

        // Insertar el nuevo taller
        const [result] = await db.query('INSERT INTO Taller (nombre_taller) VALUES (?)', [nombre_taller]);
        const id_taller = result.insertId;

        // Asociar el personal al taller
        await db.query('INSERT INTO Personal_taller (id_personal, id_taller) VALUES (?, ?)', [id_personal, id_taller]);

        await db.query('COMMIT');

        // Obtener el taller recién creado
        const [newTaller] = await db.query(
            'SELECT t.id_taller, t.nombre_taller, p.id_personal, CONCAT(p.nombre_personal, " ", COALESCE(p.apaterno_personal, "")) AS profesor ' +
            'FROM Taller t ' +
            'LEFT JOIN Personal_taller pt ON t.id_taller = pt.id_taller ' +
            'LEFT JOIN Personal p ON pt.id_personal = p.id_personal ' +
            'WHERE t.id_taller = ?',
            [id_taller]
        );

        if (newTaller.length === 0) {
            throw new Error('No se pudo recuperar el taller creado.');
        }

        console.log('Taller creado con éxito, ID:', id_taller, 'Datos:', newTaller[0]);
        res.json({ success: true, taller: newTaller[0] });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error al crear taller:', error);
        res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
    }
});

// RUTA PARA ACTUALIZAR UN TALLER EXISTENTE
router.put('/talleres-personal-alumnos/:id_taller', authMiddleware, async (req, res) => {
  const { id_taller } = req.params;
  const { nombre_taller, id_personal } = req.body;
  try {
    // Verificar si el taller existe
    const [existingTaller] = await db.query('SELECT id_taller FROM Taller WHERE id_taller = ?', [id_taller]);
    if (existingTaller.length === 0) {
      return res.status(404).json({ success: false, message: 'Taller no encontrado.' });
    }

    // Actualizar el taller
    await db.query('UPDATE Taller SET nombre_taller = ? WHERE id_taller = ?', [nombre_taller, id_taller]);
    
    // Actualizar o insertar la relación con el personal
    const [existingPersonal] = await db.query('SELECT id_personal FROM Personal_taller WHERE id_taller = ?', [id_taller]);
    if (existingPersonal.length > 0) {
      await db.query('UPDATE Personal_taller SET id_personal = ? WHERE id_taller = ?', [id_personal, id_taller]);
    } else {
      await db.query('INSERT INTO Personal_taller (id_personal, id_taller) VALUES (?, ?)', [id_personal, id_taller]);
    }

    // Devolver el taller actualizado
    const [updatedTaller] = await db.query(
      'SELECT t.id_taller, t.nombre_taller, p.id_personal, CONCAT(p.nombre_personal, " ", p.apaterno_personal) AS profesor, COUNT(at.id_alumno) AS num_alumnos ' +
      'FROM Taller t ' +
      'LEFT JOIN Personal_taller pt ON t.id_taller = pt.id_taller ' +
      'LEFT JOIN Personal p ON pt.id_personal = p.id_personal ' +
      'LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller ' +
      'WHERE t.id_taller = ? ' +
      'GROUP BY t.id_taller, t.nombre_taller, p.id_personal, p.nombre_personal, p.apaterno_personal',
      [id_taller]
    );
    res.json({ success: true, taller: updatedTaller[0] });
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

//RUTA PARA BUSCADOR DE TALLERES
router.get('/buscar-talleres', authMiddleware, async (req, res) => {
    const term = req.query.term?.trim().toLowerCase() || '';
    try {
        const likeTerm = `%${term}%`;
        const [talleres] = await db.query(
          `SELECT 
              t.id_taller, 
              t.nombre_taller, 
              p.id_personal, 
              CONCAT(p.nombre_personal, " ", p.apaterno_personal) AS profesor, 
              COUNT(at.id_alumno) AS num_alumnos
           FROM Taller t
           LEFT JOIN Personal_taller pt ON t.id_taller = pt.id_taller
           LEFT JOIN Personal p ON pt.id_personal = p.id_personal
           LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller
           WHERE t.nombre_taller LIKE ? 
              OR p.nombre_personal LIKE ? 
              OR p.apaterno_personal LIKE ?
           GROUP BY t.id_taller, t.nombre_taller, p.id_personal, p.nombre_personal, p.apaterno_personal`,
           [likeTerm, likeTerm, likeTerm]
        );
        res.json({ success: true, talleres });
    } catch (error) {
        console.error('Error al buscar talleres:', error);
        res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
    }
});

        
// RUTA PARA OBTENER LA LISTA DE PROFESORES CON ROL "Taller Extraescolar"
router.get('/personal-profesores', authMiddleware, async (req, res) => {
    try {
        const [personal] = await db.query(
            'SELECT DISTINCT p.id_personal, p.nombre_personal, p.apaterno_personal ' +
            'FROM Personal p ' +
            'JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto ' +
            'JOIN Rol r ON pr.id_rol = r.id_rol ' +
            'WHERE r.nombre_rol = ? AND p.estado_personal = 1',
            ['Taller Extraescolar']
        );
        res.json({ success: true, personal });
    } catch (error) {
        console.error('Error al obtener personal:', error);
        res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
    }
});


// OBTENER TODAS LAS MATERIAS CON SUS ASIGNACIONES, PERSONAL Y ACADEMIAS
router.get('/materias-personal-alumnos', authMiddleware, async (req, res) => {
    try {
        const [materias] = await db.query(`
            SELECT m.*, a.nombre_academia, gg.grado, gg.grupo, p.nombre_personal, p.apaterno_personal AS profesor, gm.horas_materia, gm.id_grado_grupo, gm.id_personal
            FROM Materia m
            LEFT JOIN Academia a ON m.id_academia = a.id_academia
            LEFT JOIN Grupo_Materia gm ON m.id_materia = gm.id_materia
            LEFT JOIN Grado_grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
            LEFT JOIN Personal p ON gm.id_personal = p.id_personal
        `);
        const grouped = {};
        materias.forEach(m => {
            if (!grouped[m.id_materia]) grouped[m.id_materia] = { ...m, asignaciones: [] };
            if (m.id_grado_grupo) {
                grouped[m.id_materia].asignaciones.push({
                    id_grado_grupo: m.id_grado_grupo,
                    grado: m.grado,
                    grupo: m.grupo,
                    id_personal: m.id_personal,
                    profesor: `${m.nombre_personal} ${m.profesor || ''}`,
                    horas_materia: m.horas_materia
                });
            }
        });
        res.json({ success: true, materias: Object.values(grouped) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// OBTENER DETALLES DE UNA MATERIA ESPECIFICA CON SUS ASIGNACIONES
router.get('/materias-personal-alumnos/:id_materia', authMiddleware, async (req, res) => {
    try {
        const [materias] = await db.query(`
            SELECT m.*, a.nombre_academia, gg.grado, gg.grupo, p.nombre_personal, p.apaterno_personal AS profesor, gm.horas_materia, gm.id_grado_grupo, gm.id_personal
            FROM Materia m
            LEFT JOIN Academia a ON m.id_academia = a.id_academia
            LEFT JOIN Grupo_Materia gm ON m.id_materia = gm.id_materia
            LEFT JOIN Grado_grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
            LEFT JOIN Personal p ON gm.id_personal = p.id_personal
            WHERE m.id_materia = ?
        `, [req.params.id_materia]);
        const grouped = {};
        materias.forEach(m => {
            if (!grouped[m.id_materia]) grouped[m.id_materia] = { ...m, asignaciones: [] };
            if (m.id_grado_grupo) {
                grouped[m.id_materia].asignaciones.push({
                    id_grado_grupo: m.id_grado_grupo,
                    grado: m.grado,
                    grupo: m.grupo,
                    id_personal: m.id_personal,
                    profesor: `${m.nombre_personal} ${m.profesor || ''}`,
                    horas_materia: m.horas_materia
                });
            }
        });
        res.json({ success: true, materia: grouped[req.params.id_materia] || {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// CREAR UNA NUEVA MATERIA
router.post('/materias-personal-alumnos', authMiddleware, async (req, res) => {
    try {
        const { nombre_materia, modelo_materia, id_academia } = req.body;
        if (!nombre_materia || !modelo_materia || !id_academia) {
            return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
        }
        const [result] = await db.query('INSERT INTO Materia (nombre_materia, modelo_materia, grado_materia, id_academia) VALUES (?, ?, 0, ?)', [nombre_materia, modelo_materia, id_academia]);
        res.json({ success: true, materia: { id_materia: result.insertId, nombre_materia, modelo_materia, id_academia } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ACTUALIZAR UNA MATERIA EXISTENTE
router.put('/materias-personal-alumnos/:id_materia', authMiddleware, async (req, res) => {
    try {
        const { nombre_materia, modelo_materia, id_academia } = req.body;
        if (!nombre_materia || !modelo_materia || !id_academia) {
            return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
        }
        await db.query('UPDATE Materia SET nombre_materia = ?, modelo_materia = ?, id_academia = ? WHERE id_materia = ?', [nombre_materia, modelo_materia, id_academia, req.params.id_materia]);
        res.json({ success: true, materia: { id_materia: req.params.id_materia, nombre_materia, modelo_materia, id_academia } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ELIMINAR UNA MATERIA
router.delete('/materias-personal-alumnos/:id_materia', authMiddleware, async (req, res) => {
    try {
        await db.query('DELETE FROM Materia WHERE id_materia = ?', [req.params.id_materia]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ASIGNAR UNA MATERIA A UN GRUPO Y PROFESOR
router.post('/grupo-materia', authMiddleware, async (req, res) => {
    try {
        const { id_materia, id_grado_grupo, id_personal, horas_materia } = req.body;
        await db.query('INSERT INTO Grupo_Materia (id_grado_grupo, id_materia, id_personal, horas_materia) VALUES (?, ?, ?, ?)', [id_grado_grupo, id_materia, id_personal, horas_materia]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DESASIGNAR UNA MATERIA DE UN GRUPO Y PROFESOR
router.delete('/grupo-materia', authMiddleware, async (req, res) => {
    try {
        const { id_materia, id_grado_grupo, id_personal } = req.body;
        await db.query('DELETE FROM Grupo_Materia WHERE id_materia = ? AND id_grado_grupo = ? AND id_personal = ?', [id_materia, id_grado_grupo, id_personal]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ASIGNAR UNA MATERIA A UN ALUMNO
router.post('/alumno-materia', authMiddleware, async (req, res) => {
    try {
        const { id_alumno, id_materia, id_personal } = req.body;
        await db.query('INSERT INTO Alumno_Materia (id_alumno, id_materia, id_personal) VALUES (?, ?, ?)', [id_alumno, id_materia, id_personal]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DESASIGNAR UNA MATERIA DE UN ALUMNO
router.delete('/alumno-materia', authMiddleware, async (req, res) => {
    try {
        const { id_alumno, id_materia, id_personal } = req.body;
        await db.query('DELETE FROM Alumno_Materia WHERE id_alumno = ? AND id_materia = ? AND id_personal = ?', [id_alumno, id_materia, id_personal]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// OBTENER TODOS LOS GRADOS Y GRUPOS
router.get('/grado-grupo', authMiddleware, async (req, res) => {
    try {
        const [grado_grupos] = await db.query('SELECT * FROM Grado_grupo');
        res.json({ success: true, grado_grupos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// OBTENER TODOS LOS PROFESORES
router.get('/personal-profesores', authMiddleware, async (req, res) => {
    try {
        const [personal] = await db.query('SELECT id_personal, nombre_personal, apaterno_personal FROM Personal WHERE id_puesto IN (SELECT id_puesto FROM Puesto WHERE nombre_puesto LIKE "%Profesor%")');
        res.json({ success: true, personal });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// OBTENER TODAS LAS ACADEMIAS
router.get('/academias', authMiddleware, async (req, res) => {
    try {
        const [academias] = await db.query('SELECT * FROM Academia');
        res.json({ success: true, academias });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// OBTENER ALUMNOS POR ID DE GRADO Y GRUPO
router.get('/alumnos-por-grado-grupo/:id_grado_grupo', authMiddleware, async (req, res) => {
    try {
        const [alumnos] = await db.query('SELECT id_alumno FROM Alumno WHERE id_grado_grupo = ?', [req.params.id_grado_grupo]);
        res.json({ success: true, alumnos });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// CREAR UNA NUEVA ESPECIALIDAD DE ARTE
router.post('/arte-especialidad', authMiddleware, async (req, res) => {
    try {
        const { nombre_arte_especialidad, id_academia } = req.body;
        const [result] = await db.query('INSERT INTO Arte_Especialidad (nombre_arte_especialidad) VALUES (?)', [nombre_arte_especialidad]);
        res.json({ success: true, id_arte_especialidad: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// CREAR UN NUEVO NIVEL DE INGLES
router.post('/nivel-ingles', authMiddleware, async (req, res) => {
    try {
        const { nombre_nivel_ingles, id_academia } = req.body;
        const [result] = await db.query('INSERT INTO Nivel_Ingles (nombre_nivel_ingles) VALUES (?)', [nombre_nivel_ingles]);
        res.json({ success: true, id_nivel_ingles: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Ruta para obtener especialidades de arte
router.get('/arte-especialidad', async (req, res) => {
    try {
        const [especialidades] = await db.query('SELECT * FROM Arte_Especialidad');
        res.json({ success: true, especialidades });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Ruta para agregar una nueva especialidad
router.post('/arte-especialidad', async (req, res) => {
    try {
        const { nombre_arte_especialidad } = req.body;
        if (!nombre_arte_especialidad) {
            return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
        }
        const [result] = await db.query('INSERT INTO Arte_Especialidad (nombre_arte_especialidad) VALUES (?)', [nombre_arte_especialidad]);
        res.json({ success: true, id_arte_especialidad: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Ruta para editar una especialidad
router.put('/arte-especialidad/:id_arte_especialidad', async (req, res) => {
    try {
        const { nombre_arte_especialidad } = req.body;
        const { id_arte_especialidad } = req.params;
        if (!nombre_arte_especialidad) {
            return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
        }
        await db.query('UPDATE Arte_Especialidad SET nombre_arte_especialidad = ? WHERE id_arte_especialidad = ?', [nombre_arte_especialidad, id_arte_especialidad]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Ruta para asignar una especialidad a un profesor y grupo
router.post('/personal-arte-especialidad', async (req, res) => {
    try {
        const { id_materia, id_arte_especialidad, id_personal, id_grado_grupo } = req.body;
        if (!id_personal || !id_grado_grupo || !id_arte_especialidad) {
            return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
        }
        await db.query(
            'INSERT INTO Personal_Arte_Especialidad (id_personal, id_arte_especialidad, id_grado_grupo) VALUES (?, ?, ?)',
            [id_personal, id_arte_especialidad, id_grado_grupo]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/materias-modelo-viejo', async (req, res) => {
    try {
        const [materias] = await db.query('SELECT m.id_materia, m.nombre_materia AS materia, g.grado, g.grupo, p.nombre_personal AS profesor FROM Materias m LEFT JOIN Asignaciones a ON m.id_materia = a.id_materia LEFT JOIN Grado_Grupo g ON a.id_grado_grupo = g.id_grado_grupo LEFT JOIN Personal p ON a.id_personal = p.id_personal WHERE m.modelo_materia = "VIEJO"');
        res.json({ success: true, materias });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/asignar-materia', async (req, res) => {
    try {
        const { id_materia, id_grado_grupo, id_personal, horas } = req.body;
        if (!id_materia || !id_grado_grupo || !id_personal || !horas) {
            return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
        }
        await db.query('INSERT INTO Asignaciones (id_materia, id_grado_grupo, id_personal, horas) VALUES (?, ?, ?, ?)', [id_materia, id_grado_grupo, id_personal, horas]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/desasignar-materia/:id_asignacion', async (req, res) => {
    try {
        const { id_asignacion } = req.params;
        await db.query('DELETE FROM Asignaciones WHERE id_asignacion = ?', [id_asignacion]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});



router.get('/asignaciones-materia/:id_materia', authMiddleware, async (req, res) => {
    try {
        const [asignaciones] = await db.query(`
            SELECT gm.id_grado_grupo, gg.grado, gg.grupo, p.nombre_personal AS profesor, p.apaterno_personal, gm.horas_materia, gm.id_personal
            FROM Grupo_Materia gm
            LEFT JOIN Grado_grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
            LEFT JOIN Personal p ON gm.id_personal = p.id_personal
            WHERE gm.id_materia = ?
        `, [req.params.id_materia]);
        res.json({ success: true, asignaciones });
    } catch (error) {
        console.error('Error en /asignaciones-materia:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/personal-materias', authMiddleware, async (req, res) => {
    try {
        const [personal] = await db.query('SELECT id_personal, nombre_personal, apaterno_personal, amaterno_personal FROM Personal WHERE estado_personal = 1');
        res.json({ success: true, personal });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// OBTIENE TODOS LOS ROLES DISPONIBLES
router.get('/roles-director', authMiddleware, async (req, res) => {
    const query = 'SELECT * FROM Rol';
    try {
        const [roles] = await db.query(query);
        res.json({ success: true, roles });
    } catch (error) {
        console.error('Error al obtener roles:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error en el servidor.', error: error.message });
    }
});

// OBTIENE LA INFORMACIÓN DEL PERSONAL CON SUS ROLES, MATERIAS Y EVALUACIÓN, ORDENADO POR EVALUACIÓN
router.get('/personnel-director', authMiddleware, async (req, res) => {
    const { role, sort } = req.query;
    let query = `
        SELECT 
            p.id_personal,
            p.nombre_personal,
            p.apaterno_personal,
            p.amaterno_personal,
            p.telefono_personal,
            p.fecha_nacimiento_personal,
            p.img_personal,
            pu.nombre_puesto
        FROM Personal p
        JOIN Puesto pu ON p.id_puesto = pu.id_puesto
    `;
    const queryParams = [];
    
    if (role) {
        query += `
            JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
            JOIN Rol r ON pr.id_rol = r.id_rol
            WHERE p.estado_personal = 1 AND r.nombre_rol = ?
        `;
        queryParams.push(role);
    } else {
        query += ' WHERE p.estado_personal = 1';
    }

    const query2 = `
        SELECT r.nombre_rol
        FROM Puesto_Rol pr
        JOIN Rol r ON pr.id_rol = r.id_rol
        WHERE pr.id_puesto = ?
    `;
    const query3 = `
        SELECT DISTINCT m.nombre_materia
        FROM Grupo_Materia gm
        JOIN Materia m ON gm.id_materia = m.id_materia
        WHERE gm.id_personal = ?
    `;
    const evalQueries = [
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Docente WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Docente WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Docente_Ingles WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Docente_Ingles WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Docente_Arte WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Docente_Arte WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Taller WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Taller WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Counselor WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Counselor WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Personal WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Personal WHERE id_personal IN (?) GROUP BY id_personal`
    ];
    const positiveResponses = [1, 5, 6, 9, 10];

    try {
        const [personnel] = await db.query(query, queryParams);
        const personnelWithDetails = await Promise.all(personnel.map(async (p) => {
            const [roles] = await db.query(query2, [p.id_puesto]);
            const [subjects] = await db.query(query3, [p.id_personal]);
            return {
                ...p,
                roles: roles.map(r => r.nombre_rol),
                subjects: subjects.map(s => s.nombre_materia),
                goalAchievement: Math.floor(Math.random() * 20 + 80) // Mock: Replace with Metas table
            };
        }));

        // Fetch and aggregate evaluation data
        const personnelIds = personnelWithDetails.map(p => p.id_personal);
        let allEvaluations = [];
        for (let i = 0; i < evalQueries.length; i += 2) {
            const [positiveResults] = await db.query(evalQueries[i], [personnelIds, positiveResponses]);
            const [totalResults] = await db.query(evalQueries[i + 1], [personnelIds]);
            allEvaluations = allEvaluations.concat(positiveResults, totalResults);
        }

        const aggregatedEvaluations = {};
        allEvaluations.forEach(eval => {
            if (!aggregatedEvaluations[eval.id_personal]) {
                aggregatedEvaluations[eval.id_personal] = { positive_count: 0, total_count: 0 };
            }
            if (eval.positive_count !== undefined) {
                aggregatedEvaluations[eval.id_personal].positive_count += eval.positive_count || 0;
            }
            if (eval.total_count !== undefined) {
                aggregatedEvaluations[eval.id_personal].total_count += eval.total_count || 0;
            }
        });

        const personnelWithEval = personnelWithDetails.map(p => {
            const evalInfo = aggregatedEvaluations[p.id_personal] || { positive_count: 0, total_count: 0 };
            const percentage = evalInfo.total_count > 0 ? Math.round((evalInfo.positive_count / evalInfo.total_count) * 100) : 0;
            return { ...p, evaluationPercentage: percentage };
        });

        // Sort and limit to 3
        let sortedPersonnel = [];
        if (sort === 'top') {
            sortedPersonnel = personnelWithEval.sort((a, b) => b.evaluationPercentage - a.evaluationPercentage).slice(0, 3);
        } else if (sort === 'bottom') {
            sortedPersonnel = personnelWithEval.sort((a, b) => a.evaluationPercentage - b.evaluationPercentage).slice(0, 3);
        } else {
            sortedPersonnel = personnelWithEval.slice(0, 3); // Default to top 3 if sort is invalid
        }

        res.json({ success: true, personnel: sortedPersonnel });
    } catch (error) {
        console.error('Error al obtener personal:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error en el servidor.', error: error.message });
    }
});

// OBTIENE EL RECUENTO DE RESPUESTAS POSITIVAS Y TOTALES POR ID_PERSONAL
router.get('/evaluations-director-full', authMiddleware, async (req, res) => {
    const { ids } = req.query; // Comma-separated list of id_personal
    if (!ids) return res.status(400).json({ success: false, message: 'IDs de personal requeridos' });

    const idArray = ids.split(',').map(id => parseInt(id));
    const positiveResponses = [1, 5, 6, 9, 10];

    const queries = [
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Docente WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Docente WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Docente_Ingles WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Docente_Ingles WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Docente_Arte WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Docente_Arte WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Taller WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Taller WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Alumno_Counselor WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Alumno_Counselor WHERE id_personal IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as positive_count FROM Respuesta_Personal WHERE id_personal IN (?) AND id_respuesta IN (?) GROUP BY id_personal`,
        `SELECT id_personal, COUNT(*) as total_count FROM Respuesta_Personal WHERE id_personal IN (?) GROUP BY id_personal`
    ];

    try {
        let allEvaluations = [];
        for (let i = 0; i < queries.length; i += 2) {
            const [positiveResults] = await db.query(queries[i], [idArray, positiveResponses]);
            const [totalResults] = await db.query(queries[i + 1], [idArray]);
            allEvaluations = allEvaluations.concat(positiveResults, totalResults);
        }

        // Aggregate counts per id_personal
        const aggregatedEvaluations = {};
        allEvaluations.forEach(eval => {
            if (!aggregatedEvaluations[eval.id_personal]) {
                aggregatedEvaluations[eval.id_personal] = { positive_count: 0, total_count: 0 };
            }
            if (eval.positive_count !== undefined) {
                aggregatedEvaluations[eval.id_personal].positive_count += eval.positive_count || 0;
            }
            if (eval.total_count !== undefined) {
                aggregatedEvaluations[eval.id_personal].total_count += eval.total_count || 0;
            }
        });

        const evaluations = idArray.map(id => ({
            id_personal: id,
            positive_count: aggregatedEvaluations[id]?.positive_count || 0,
            total_count: Math.max(aggregatedEvaluations[id]?.total_count || 1, 1) // Ensure at least 1 to avoid division by zero
        }));

        res.json({ success: true, evaluations });
    } catch (error) {
        console.error('Error al obtener evaluaciones:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error en el servidor.', error: error.message });
    }
});

// OBTIENE COMENTARIOS POR ID_PERSONAL Y TIPO
router.get('/comments-director', authMiddleware, async (req, res) => {
    const { id_personal, type } = req.query;
    if (!id_personal || !type) return res.status(400).json({ success: false, message: 'id_personal y type son requeridos' });

    const isPositive = type === 'positive' ? 1 : 0;
    const queries = [
        // Comentario_Docente
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cd.comentario_docente as comment 
         FROM Comentario_Docente cd 
         JOIN Alumno a ON cd.id_alumno = a.id_alumno 
         JOIN Grado_grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE cd.id_personal = ? AND cd.tipo_comentario = ?`,
        // Comentario_Docente_Ingles
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cdi.comentario_docente_ingles as comment 
         FROM Comentario_Docente_Ingles cdi 
         JOIN Alumno a ON cdi.id_alumno = a.id_alumno 
         JOIN Grado_grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE cdi.id_personal = ? AND cdi.tipo_comentario = ?`,
        // Comentario_Docente_Arte
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cda.comentario_docente_arte as comment 
         FROM Comentario_Docente_Arte cda 
         JOIN Alumno a ON cda.id_alumno = a.id_alumno 
         JOIN Grado_grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE cda.id_personal = ? AND cda.tipo_comentario = ?`,
        // Comentario_Taller
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, ct.comentario_taller as comment 
         FROM Comentario_Taller ct 
         JOIN Alumno a ON ct.id_alumno = a.id_alumno 
         JOIN Grado_grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE ct.id_personal = ? AND ct.tipo_comentario = ?`,
        // Comentario_Counselor
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cc.comentario_counselor as comment 
         FROM Comentario_Counselor cc 
         JOIN Alumno a ON cc.id_alumno = a.id_alumno 
         JOIN Grado_grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE cc.id_personal = ? AND cc.tipo_comentario = ?`,
        // Comentario_Personal (staff comments)
        `SELECT e.id_evaluador, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, cp.comentario_personal as comment 
         FROM Comentario_Personal cp 
         JOIN Evaluador e ON cp.id_evaluador = e.id_evaluador 
         JOIN Personal p ON e.id_personal = p.id_personal 
         WHERE cp.id_personal = ? AND cp.tipo_comentario = ?`
    ];

    try {
        let allComments = [];
        for (const query of queries) {
            const [results] = await db.query(query, [id_personal, isPositive]);
            allComments = allComments.concat(results.map(row => ({
                commenter: row.id_alumno ? `${row.nombre_alumno} ${row.apaterno_alumno} ${row.amaterno_alumno} (Grupo ${row.grupo})` : `${row.nombre_personal} ${row.apaterno_personal} ${row.amaterno_personal}`,
                comment: row.comment
            })));
        }

        res.json({ success: true, comments: allComments });
    } catch (error) {
        console.error('Error al obtener comentarios:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error en el servidor.', error: error.message });
    }
});

// Obtener todos los roles disponibles
router.get('/roles-permisos', authMiddleware, async (req, res) => {
    try {
        const [roles] = await db.query('SELECT id_rol, nombre_rol FROM Rol');
        if (!roles || roles.length === 0) {
            return res.json({ success: true, roles: [] });
        }
        res.json({ success: true, roles });
    } catch (error) {
        console.error('Error al obtener roles:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error en la consulta de roles.' });
    }
});

// Obtener permisos de un usuario específico
router.get('/permissions-permisos/:id_usuario', authMiddleware, async (req, res) => {
    const { id_usuario } = req.params;
    try {
        const [rows] = await db.query('SELECT * FROM Permisos WHERE id_usuario = ?', [id_usuario]);
        res.json({ success: true, data: rows.length > 0 ? rows[0] : { id_usuario: parseInt(id_usuario), permiso_materias: 0, permiso_kpis: 0, permiso_grupos: 0, permiso_personal: 0, permiso_talleres: 0, permiso_alumnos: 0 } });
    } catch (error) {
        console.error('Error fetching permissions:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// Guardar o actualizar permisos de un usuario
router.post('/permissions-permisos', async (req, res) => {
    const { id_usuario, permiso_materias, permiso_kpis, permiso_grupos, permiso_personal, permiso_talleres, permiso_alumnos } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.query('SELECT * FROM Permisos WHERE id_usuario = ?', [id_usuario]);
        if (existing.length > 0) {
            await connection.query(
                'UPDATE Permisos SET permiso_materias = ?, permiso_kpis = ?, permiso_grupos = ?, permiso_personal = ?, permiso_talleres = ?, permiso_alumnos = ? WHERE id_usuario = ?',
                [permiso_materias, permiso_kpis, permiso_grupos, permiso_personal, permiso_talleres, permiso_alumnos, id_usuario]
            );
        } else {
            await connection.query(
                'INSERT INTO Permisos (id_usuario, permiso_materias, permiso_kpis, permiso_grupos, permiso_personal, permiso_talleres, permiso_alumnos) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id_usuario, permiso_materias, permiso_kpis, permiso_grupos, permiso_personal, permiso_talleres, permiso_alumnos]
            );
        }
        await connection.commit();
        res.json({ success: true, message: 'Permisos guardados exitosamente.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error saving permissions:', error);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    } finally {
        connection.release();
    }
});

// Obtener personal asociado a un rol específico
router.get('/personal-by-role-permisos/:roleId', async (req, res) => {
    const { roleId } = req.params;
    try {
        const [personal] = await db.query(
            `SELECT DISTINCT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.id_usuario
             FROM Personal p
             JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
             WHERE pr.id_rol = ?`,
            [roleId]
        );
        res.json({ success: true, personal });
    } catch (error) {
        console.error('Error fetching personal by role:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta.' });
    }
});

// Fetch all roles
router.get('/personal-roles', authMiddleware, async (req, res) => {
    try {
        const [roles] = await db.query('SELECT id_rol, nombre_rol FROM Rol');
        res.json({ success: true, roles });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta de roles.' });
    }
});

// Fetch all categories with their roles
router.get('/personal-categories', authMiddleware, async (req, res) => {
    try {
        const [categories] = await db.query(`
            SELECT r.id_rol, r.nombre_rol, p.nombre_puesto
            FROM Rol r
            JOIN Puesto_Rol pr ON r.id_rol = pr.id_rol
            JOIN Puesto p ON pr.id_puesto = p.id_puesto
        `);
        const roleCategories = [
            { name: 'Dirección', roleIds: [3, 12] },
            { name: 'Subdirección', roleIds: [4, 5, 8, 11, 16, 18, 21, 23, 37] },
            { name: 'Docentes', roleIds: [1, 2, 15, 19, 30, 31, 36] },
            { name: 'Servicios', roleIds: [9, 10, 20, 24, 27] },
            { name: 'Otros', roleIds: [6, 7, 13, 14, 17, 22, 25, 26, 28, 29, 32, 33, 34, 35] }
        ];
        res.json({ success: true, categories: roleCategories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta de categorías.' });
    }
});

// Fetch personal by role
router.get('/personal-by-role/:roleId', authMiddleware, async (req, res) => {
    const { roleId } = req.params;
    try {
        const [personal] = await db.query(`
            SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.telefono_personal, p.id_usuario, p.id_puesto, p.img_personal
            FROM Personal p
            JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
            WHERE pr.id_rol = ? AND p.estado_personal = 1
        `, [roleId]);
        res.json({ success: true, personal });
    } catch (error) {
        console.error('Error fetching personal:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta de personal.' });
    }
});

// Fetch KPI results for a personal with responsible role
router.get('/personal-kpi-results/:id_personal', authMiddleware, async (req, res) => {
    const { id_personal } = req.params;
    try {
        const [results] = await db.query(`
            SELECT rk.id_resultado_kpi, rk.resultado_kpi, k.nombre_kpi, k.meta_kpi, k.tipo_kpi, ck.nombre_categoria_kpi, pc.porcentaje_categoria, r.nombre_rol AS responsable
            FROM Resultado_Kpi rk
            JOIN Kpi k ON rk.id_kpi = k.id_kpi
            JOIN Categoria_Kpi ck ON k.id_categoria_kpi = ck.id_categoria_kpi
            JOIN Puesto_Kpi pk ON k.id_kpi = pk.id_kpi
            JOIN Puesto_Categoria pc ON pk.id_puesto = pc.id_puesto AND k.id_categoria_kpi = pc.id_categoria_kpi
            JOIN Personal p ON rk.id_personal = p.id_personal
            JOIN Rol r ON k.id_rol = r.id_rol
            WHERE rk.id_personal = ? AND p.id_puesto = pk.id_puesto
        `, [id_personal]);
        res.json({ success: true, results });
    } catch (error) {
        console.error('Error fetching KPI results:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta de resultados KPI.' });
    }
});


//FIN DE RUTAS DE PERSONAL

//RUTAS DE KPIS

// Obtener todos los KPIs
router.get('/kpis', authMiddleware, async (req, res) => {
  try {
    const [kpis] = await db.query(`
      SELECT 
        k.id_kpi,
        k.nombre_kpi,
        k.meta_kpi,
        k.tipo_kpi,
        c.nombre_categoria_kpi,
        a.nombre_area_estrategica,
        a.siglas_area_estrategica,
        i.nombre_indicador_kpi,
        i.sigla_indicador_kpi,
        r.nombre_rol,
        p.nombre_puesto
      FROM Kpi k
      LEFT JOIN Categoria_Kpi c ON k.id_categoria_kpi = c.id_categoria_kpi
      LEFT JOIN Area_Estrategica a ON k.id_area_estrategica = a.id_area_estrategica
      LEFT JOIN Indicador_Kpi i ON k.id_indicador_kpi = i.id_indicador_kpi
      LEFT JOIN Rol r ON k.id_rol = r.id_rol
      LEFT JOIN Puesto_Kpi pk ON k.id_kpi = pk.id_kpi
      LEFT JOIN Puesto p ON pk.id_puesto = p.id_puesto
    `);
    res.json({ success: true, kpis });
  } catch (error) {
    console.error('Error al obtener KPIs:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener KPIs' });
  }
});

// Obtener un KPI específico
router.get('/kpis/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [kpis] = await db.query(`
      SELECT 
        k.id_kpi,
        k.nombre_kpi,
        k.meta_kpi,
        k.tipo_kpi,
        k.id_categoria_kpi,
        k.id_area_estrategica,
        k.id_indicador_kpi,
        k.id_rol,
        pk.id_puesto
      FROM Kpi k
      LEFT JOIN Puesto_Kpi pk ON k.id_kpi = pk.id_kpi
      WHERE k.id_kpi = ?
    `, [id]);
    if (kpis.length === 0) {
      return res.status(404).json({ success: false, message: 'KPI no encontrado' });
    }
    res.json({ success: true, kpi: kpis[0] });
  } catch (error) {
    console.error('Error al obtener KPI:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener KPI' });
  }
});

// Agregar un nuevo KPI
router.post('/kpis', authMiddleware, async (req, res) => {
  const { nombre_kpi, meta_kpi, tipo_kpi, id_categoria_kpi, id_area_estrategica, id_indicador_kpi, id_rol, id_puesto } = req.body;
  console.log('Datos recibidos para KPI:', { nombre_kpi, meta_kpi, tipo_kpi, id_categoria_kpi, id_area_estrategica, id_indicador_kpi, id_rol, id_puesto });

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validate inputs
    if (!nombre_kpi || !meta_kpi || !tipo_kpi || !id_categoria_kpi || !id_area_estrategica || !id_indicador_kpi || !id_puesto) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Todos los campos obligatorios deben ser proporcionados' });
    }

    // Validate meta_kpi based on tipo_kpi
    if (tipo_kpi === 'Porcentaje' && (meta_kpi < 0 || meta_kpi > 100 || !Number.isInteger(Number(meta_kpi)))) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'meta_kpi debe ser un entero entre 0 y 100 para tipo Porcentaje' });
    }
    if (tipo_kpi === 'Entero' && (!Number.isInteger(Number(meta_kpi)) || meta_kpi < 0)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'meta_kpi debe ser un entero positivo para tipo Entero' });
    }

    // Validate foreign keys
    const [categoria] = await connection.query('SELECT id_categoria_kpi FROM Categoria_Kpi WHERE id_categoria_kpi = ?', [id_categoria_kpi]);
    if (!categoria.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'La categoría seleccionada no existe' });
    }

    const [area] = await connection.query('SELECT id_area_estrategica FROM Area_Estrategica WHERE id_area_estrategica = ?', [id_area_estrategica]);
    if (!area.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El área estratégica seleccionada no existe' });
    }

    const [indicador] = await connection.query('SELECT id_indicador_kpi FROM Indicador_Kpi WHERE id_indicador_kpi = ?', [id_indicador_kpi]);
    if (!indicador.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El indicador seleccionado no existe' });
    }

    const [puesto] = await connection.query('SELECT id_puesto FROM Puesto WHERE id_puesto = ?', [id_puesto]);
    if (!puesto.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El puesto seleccionado no existe' });
    }

    // Validate id_rol if provided
    if (id_rol) {
      const [rol] = await connection.query('SELECT id_rol FROM Rol WHERE id_rol = ?', [id_rol]);
      if (!rol.length) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'El rol seleccionado no existe' });
      }
    }

    // Validate id_categoria_kpi is associated with id_puesto in Puesto_Categoria
    const [puestoCategoria] = await connection.query('SELECT id_categoria_kpi FROM Puesto_Categoria WHERE id_puesto = ? AND id_categoria_kpi = ?', [id_puesto, id_categoria_kpi]);
    if (!puestoCategoria.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'La categoría seleccionada no está asociada con el puesto' });
    }

    // Insert into Kpi
    const [kpiResult] = await connection.query(
      'INSERT INTO Kpi (nombre_kpi, meta_kpi, tipo_kpi, id_categoria_kpi, id_area_estrategica, id_indicador_kpi, id_rol) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nombre_kpi, meta_kpi, tipo_kpi, id_categoria_kpi, id_area_estrategica, id_indicador_kpi, id_rol || null]
    );
    const id_kpi = kpiResult.insertId;

    // Insert into Puesto_Kpi
    await connection.query('INSERT INTO Puesto_Kpi (id_puesto, id_kpi) VALUES (?, ?)', [id_puesto, id_kpi]);

    await connection.commit();
    res.json({ success: true, message: 'KPI agregado exitosamente', id_kpi });
  } catch (error) {
    console.error('Error al agregar KPI:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: `Error interno al agregar KPI: ${error.message}` });
  } finally {
    if (connection) connection.release();
  }
});

// Actualizar un KPI existente
router.put('/kpis/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { nombre_kpi, meta_kpi, tipo_kpi, id_categoria_kpi, id_area_estrategica, id_indicador_kpi, id_rol, id_puesto } = req.body;

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validate id_kpi exists
    const [existingKpi] = await connection.query('SELECT id_kpi FROM Kpi WHERE id_kpi = ?', [id]);
    if (!existingKpi.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'KPI no encontrado' });
    }

    // Validate inputs
    if (!nombre_kpi || !meta_kpi || !tipo_kpi || !id_categoria_kpi || !id_area_estrategica || !id_indicador_kpi || !id_puesto) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Todos los campos obligatorios deben ser proporcionados' });
    }

    // Validate meta_kpi based on tipo_kpi
    if (tipo_kpi === 'Porcentaje' && (meta_kpi < 0 || meta_kpi > 100 || !Number.isInteger(Number(meta_kpi)))) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'meta_kpi debe ser un entero entre 0 y 100 para tipo Porcentaje' });
    }
    if (tipo_kpi === 'Entero' && (!Number.isInteger(Number(meta_kpi)) || meta_kpi < 0)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'meta_kpi debe ser un entero positivo para tipo Entero' });
    }

    // Validate foreign keys
    const [categoria] = await connection.query('SELECT id_categoria_kpi FROM Categoria_Kpi WHERE id_categoria_kpi = ?', [id_categoria_kpi]);
    if (!categoria.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'La categoría seleccionada no existe' });
    }

    const [area] = await connection.query('SELECT id_area_estrategica FROM Area_Estrategica WHERE id_area_estrategica = ?', [id_area_estrategica]);
    if (!area.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El área estratégica seleccionada no existe' });
    }

    const [indicador] = await connection.query('SELECT id_indicador_kpi FROM Indicador_Kpi WHERE id_indicador_kpi = ?', [id_indicador_kpi]);
    if (!indicador.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El indicador seleccionado no existe' });
    }

    const [puesto] = await connection.query('SELECT id_puesto FROM Puesto WHERE id_puesto = ?', [id_puesto]);
    if (!puesto.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El puesto seleccionado no existe' });
    }

    // Validate id_rol if provided
    if (id_rol) {
      const [rol] = await connection.query('SELECT id_rol FROM Rol WHERE id_rol = ?', [id_rol]);
      if (!rol.length) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'El rol seleccionado no existe' });
      }
    }

    // Validate id_categoria_kpi is associated with id_puesto in Puesto_Categoria
    const [puestoCategoria] = await connection.query('SELECT id_categoria_kpi FROM Puesto_Categoria WHERE id_puesto = ? AND id_categoria_kpi = ?', [id_puesto, id_categoria_kpi]);
    if (!puestoCategoria.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'La categoría seleccionada no está asociada con el puesto' });
    }

    // Update Kpi
    await connection.query(
      'UPDATE Kpi SET nombre_kpi = ?, meta_kpi = ?, tipo_kpi = ?, id_categoria_kpi = ?, id_area_estrategica = ?, id_indicador_kpi = ?, id_rol = ? WHERE id_kpi = ?',
      [nombre_kpi, meta_kpi, tipo_kpi, id_categoria_kpi, id_area_estrategica, id_indicador_kpi, id_rol || null, id]
    );

    // Update Puesto_Kpi: delete old entry and insert new one
    await connection.query('DELETE FROM Puesto_Kpi WHERE id_kpi = ?', [id]);
    await connection.query('INSERT INTO Puesto_Kpi (id_puesto, id_kpi) VALUES (?, ?)', [id_puesto, id]);

    await connection.commit();
    res.json({ success: true, message: 'KPI actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar KPI:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: `Error interno al actualizar KPI: ${error.message}` });
  } finally {
    if (connection) connection.release();
  }
});

// Obtener categorías por puesto
router.get('/categorias-por-puesto/:id_puesto', authMiddleware, async (req, res) => {
  const { id_puesto } = req.params;
  try {
    const [categorias] = await db.query(`
      SELECT c.id_categoria_kpi, c.nombre_categoria_kpi
      FROM Categoria_Kpi c
      JOIN Puesto_Categoria pc ON c.id_categoria_kpi = pc.id_categoria_kpi
      WHERE pc.id_puesto = ?
    `, [id_puesto]);
    res.json(categorias);
  } catch (error) {
    console.error('Error al obtener categorías por puesto:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener categorías por puesto' });
  }
});

// Obtener todas las áreas estratégicas
router.get('/areas-estrategicas', authMiddleware, async (req, res) => {
  try {
    const [areas] = await db.query('SELECT id_area_estrategica, nombre_area_estrategica, siglas_area_estrategica FROM Area_Estrategica');
    res.json(areas);
  } catch (error) {
    console.error('Error al obtener áreas estratégicas:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener áreas estratégicas' });
  }
});

// Obtener todos los indicadores
router.get('/indicadores-kpi', authMiddleware, async (req, res) => {
  try {
    const [indicadores] = await db.query('SELECT id_indicador_kpi, nombre_indicador_kpi, sigla_indicador_kpi FROM Indicador_Kpi');
    res.json(indicadores);
  } catch (error) {
    console.error('Error al obtener indicadores:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener indicadores' });
  }
});


//FIN RUTAS DE KPIS

//RUTAS DE MATERIAS

// Obtener todas las materias con sus academias y asignaciones
router.get('/materias', authMiddleware, async (req, res) => {
  try {
    const [materias] = await db.query(`
      SELECT m.id_materia, m.nombre_materia, m.modelo_materia, m.grado_materia, a.nombre_academia,
        CASE 
          WHEN LOWER(m.nombre_materia) LIKE '%arte%' THEN
            (SELECT GROUP_CONCAT(
              DISTINCT CONCAT(
                p.nombre_personal, ' ', p.apaterno_personal, ' ', p.amaterno_personal, ' (', ae.nombre_arte_especialidad, ') - ',
                (SELECT GROUP_CONCAT(gg2.grupo ORDER BY gg2.grupo SEPARATOR ', ')
                 FROM Personal_Arte_Especialidad pae2
                 JOIN Grado_grupo gg2 ON pae2.id_grado_grupo = gg2.id_grado_grupo
                 WHERE pae2.id_personal = pae.id_personal 
                 AND pae2.id_arte_especialidad = pae.id_arte_especialidad
                 AND gg2.grado = m.grado_materia)
              ) SEPARATOR '; '
            )
            FROM Personal_Arte_Especialidad pae
            JOIN Personal p ON pae.id_personal = p.id_personal
            JOIN Arte_Especialidad ae ON pae.id_arte_especialidad = ae.id_arte_especialidad
            JOIN Grado_grupo gg ON pae.id_grado_grupo = gg.id_grado_grupo
            WHERE gg.grado = m.grado_materia)
          ELSE
            (SELECT GROUP_CONCAT(
              DISTINCT CONCAT(
                p.nombre_personal, ' ', p.apaterno_personal, ' ', p.amaterno_personal, ' - ',
                (SELECT GROUP_CONCAT(gg2.grupo ORDER BY gg2.grupo SEPARATOR ', ')
                 FROM Grupo_Materia gm2
                 JOIN Grado_grupo gg2 ON gm2.id_grado_grupo = gg2.id_grado_grupo
                 WHERE gm2.id_personal = gm.id_personal 
                 AND gm2.id_materia = m.id_materia),
                ' (', gm.horas_materia, ' horas)',
                IFNULL(CONCAT(' - ', ni.nombre_nivel_ingles), '')
              ) SEPARATOR '; '
            )
            FROM Grupo_Materia gm
            JOIN Personal p ON gm.id_personal = p.id_personal
            JOIN Grado_grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
            LEFT JOIN Personal_Nivel_Ingles pni ON gm.id_personal = pni.id_personal AND gm.id_grado_grupo = pni.id_grado_grupo
            LEFT JOIN Nivel_Ingles ni ON pni.id_nivel_ingles = ni.id_nivel_ingles
            WHERE gm.id_materia = m.id_materia)
        END AS profesores_grupos
      FROM Materia m
      LEFT JOIN Academia a ON m.id_academia = a.id_academia
      GROUP BY m.id_materia
    `);
    res.json({ success: true, materias });
  } catch (error) {
    console.error('Error al obtener materias:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener materias' });
  }
});

// Obtener una materia específica
router.get('/materias/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [materias] = await db.query(`
      SELECT m.*, a.nombre_academia
      FROM Materia m
      LEFT JOIN Academia a ON m.id_academia = a.id_academia
      WHERE m.id_materia = ?
    `, [id]);
    if (materias.length === 0) {
      return res.status(404).json({ success: false, message: 'Materia no encontrada' });
    }
    res.json({ success: true, materia: materias[0] });
  } catch (error) {
    console.error('Error al obtener materia:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener materia' });
  }
});

// Obtener asignaciones de una materia
router.get('/materias/:id/asignaciones', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [materia] = await db.query('SELECT nombre_materia, grado_materia FROM Materia WHERE id_materia = ?', [id]);
    if (!materia.length) {
      return res.status(404).json({ success: false, message: 'Materia no encontrada' });
    }
    const isArte = materia[0].nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('arte');
    let asignaciones;
    if (isArte) {
      [asignaciones] = await db.query(`
        SELECT pae.id_personal, pae.id_grado_grupo, p.nombre_personal, p.apaterno_personal, p.amaterno_personal,
          gg.grado, gg.grupo, ae.id_arte_especialidad, ae.nombre_arte_especialidad
        FROM Personal_Arte_Especialidad pae
        JOIN Personal p ON pae.id_personal = p.id_personal
        JOIN Grado_grupo gg ON pae.id_grado_grupo = gg.id_grado_grupo
        JOIN Arte_Especialidad ae ON pae.id_arte_especialidad = ae.id_arte_especialidad
        WHERE gg.grado = ?
      `, [materia[0].grado_materia]);
    } else {
      [asignaciones] = await db.query(`
        SELECT gm.id_personal, gm.id_grado_grupo, gm.horas_materia, 
          p.nombre_personal, p.apaterno_personal, p.amaterno_personal,
          gg.grado, gg.grupo,
          pni.id_nivel_ingles, ni.nombre_nivel_ingles
        FROM Grupo_Materia gm
        JOIN Personal p ON gm.id_personal = p.id_personal
        JOIN Grado_grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
        LEFT JOIN Personal_Nivel_Ingles pni ON gm.id_personal = pni.id_personal AND gm.id_grado_grupo = pni.id_grado_grupo
        LEFT JOIN Nivel_Ingles ni ON pni.id_nivel_ingles = ni.id_nivel_ingles
        WHERE gm.id_materia = ?
      `, [id]);
    }
    res.json(asignaciones);
  } catch (error) {
    console.error('Error al obtener asignaciones:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener asignaciones' });
  }
});

// Obtener todas las academias
router.get('/academias', authMiddleware, async (req, res) => {
  try {
    const [academias] = await db.query('SELECT id_academia, nombre_academia, id_personal FROM Academia');
    res.json({ success: true, academias });
  } catch (error) {
    console.error('Error al obtener academias:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener academias' });
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

// Obtener personal por rol
router.get('/personal-por-rol/:id_rol', authMiddleware, async (req, res) => {
  const { id_rol } = req.params;
  try {
    const [personal] = await db.query(`
      SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal
      FROM Personal p
      JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
      WHERE pr.id_rol = ? AND p.estado_personal = 1
    `, [id_rol]);
    res.json(personal);
  } catch (error) {
    console.error('Error al obtener personal por rol:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener personal por rol' });
  }
});

// Obtener todos los grados y grupos
router.get('/grados-grupos', authMiddleware, async (req, res) => {
  try {
    const [gradosGrupos] = await db.query('SELECT id_grado_grupo, grado, grupo FROM Grado_grupo');
    res.json(gradosGrupos);
  } catch (error) {
    console.error('Error al obtener grados y grupos:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener grados y grupos' });
  }
});

// Obtener todos los niveles de inglés
router.get('/niveles-ingles', authMiddleware, async (req, res) => {
  try {
    const [niveles] = await db.query('SELECT id_nivel_ingles, nombre_nivel_ingles FROM Nivel_Ingles');
    res.json(niveles);
  } catch (error) {
    console.error('Error al obtener niveles de inglés:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener niveles de inglés' });
  }
});

// Agregar una nueva materia
router.post('/materias', authMiddleware, async (req, res) => {
  const { nombre_materia, modelo_materia, grado_materia, id_academia } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validar academia
    const [academia] = await connection.query('SELECT id_academia FROM Academia WHERE id_academia = ?', [id_academia]);
    if (!academia.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'La academia seleccionada no existe' });
    }

    // Validar modelo
    if (!['NUEVO', 'VIEJO'].includes(modelo_materia)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Modelo inválido. Debe ser NUEVO o VIEJO' });
    }

    // Validar grado_materia
    if (grado_materia < 1 || grado_materia > 6 || !Number.isInteger(Number(grado_materia))) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El grado debe estar entre 1 y 6' });
    }

    // Insertar materia
    const [result] = await connection.query(
      'INSERT INTO Materia (nombre_materia, modelo_materia, grado_materia, id_academia) VALUES (?, ?, ?, ?)',
      [nombre_materia, modelo_materia, grado_materia, id_academia]
    );

    await connection.commit();
    res.json({ success: true, message: 'Materia agregada exitosamente', id_materia: result.insertId });
  } catch (error) {
    console.error('Error al agregar materia:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: 'Error interno al agregar materia' });
  } finally {
    if (connection) connection.release();
  }
});

// Actualizar una materia existente
router.put('/materias/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { nombre_materia, modelo_materia, grado_materia, id_academia } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validar materia
    const [materia] = await connection.query('SELECT id_materia FROM Materia WHERE id_materia = ?', [id]);
    if (!materia.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Materia no encontrada' });
    }

    // Validar academia
    const [academia] = await connection.query('SELECT id_academia FROM Academia WHERE id_academia = ?', [id_academia]);
    if (!academia.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'La academia seleccionada no existe' });
    }

    // Validar modelo
    if (!['NUEVO', 'VIEJO'].includes(modelo_materia)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Modelo inválido. Debe ser NUEVO o VIEJO' });
    }

    // Validar grado_materia
    if (grado_materia < 1 || grado_materia > 6 || !Number.isInteger(Number(grado_materia))) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El grado debe estar entre 1 y 6' });
    }

    // Actualizar materia
    await connection.query(
      'UPDATE Materia SET nombre_materia = ?, modelo_materia = ?, grado_materia = ?, id_academia = ? WHERE id_materia = ?',
      [nombre_materia, modelo_materia, grado_materia, id_academia, id]
    );

    await connection.commit();
    res.json({ success: true, message: 'Materia actualizada correctamente' });
  } catch (error) {
    console.error('Error al actualizar materia:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: 'Error interno al actualizar materia' });
  } finally {
    if (connection) connection.release();
  }
});

// Eliminar una materia
router.delete('/materias/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validar materia
    const [materia] = await connection.query('SELECT id_materia FROM Materia WHERE id_materia = ?', [id]);
    if (!materia.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Materia no encontrada' });
    }

    // Eliminar asignaciones relacionadas
    await connection.query('DELETE FROM Grupo_Materia WHERE id_materia = ?', [id]);
    await connection.query('DELETE FROM Personal_Nivel_Ingles WHERE id_grado_grupo IN (SELECT id_grado_grupo FROM Grupo_Materia WHERE id_materia = ?)', [id]);
    await connection.query('DELETE FROM Personal_Arte_Especialidad WHERE id_grado_grupo IN (SELECT id_grado_grupo FROM Grupo_Materia WHERE id_materia = ?)', [id]);

    // Eliminar materia
    await connection.query('DELETE FROM Materia WHERE id_materia = ?', [id]);

    await connection.commit();
    res.json({ success: true, message: 'Materia eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar materia:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: 'Error interno al eliminar materia' });
  } finally {
    if (connection) connection.release();
  }
});

// Asignar un profesor a una materia
router.post('/materias/:id/asignaciones', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { id_personal, id_grado_grupo, horas_materia, id_nivel_ingles, id_arte_especialidad } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validar materia
    const [materia] = await db.query('SELECT id_materia, nombre_materia, grado_materia FROM Materia WHERE id_materia = ?', [id]);
    if (!materia.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Materia no encontrada' });
    }

    // Validar personal
    const [personal] = await db.query('SELECT id_personal FROM Personal WHERE id_personal = ?', [id_personal]);
    if (!personal.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El profesor seleccionado no existe' });
    }

    // Validar grado_grupo
    const [gradoGrupo] = await db.query('SELECT id_grado_grupo, grado FROM Grado_grupo WHERE id_grado_grupo = ?', [id_grado_grupo]);
    if (!gradoGrupo.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El grupo seleccionado no existe' });
    }

    // Validar que el grado del grupo coincide con grado_materia
    const gradoGrupoNum = Number(gradoGrupo[0].grado);
    const gradoMateriaNum = Number(materia[0].grado_materia);
    console.log(`Validating: gradoGrupo=${gradoGrupoNum} (${typeof gradoGrupoNum}), gradoMateria=${gradoMateriaNum} (${typeof gradoMateriaNum}), id_grado_grupo=${id_grado_grupo}, id_materia=${id}`);
    if (gradoGrupoNum !== gradoMateriaNum) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: `El grupo seleccionado no pertenece al grado de la materia (Grupo grado: ${gradoGrupoNum}, Materia grado: ${gradoMateriaNum})` 
      });
    }

    // Validar horas_materia
    if (horas_materia && (horas_materia < 1 || !Number.isInteger(Number(horas_materia)))) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Las horas deben ser un número entero positivo' });
    }

    // Validar nivel de inglés si es necesario
    const isIngles = materia[0].nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('ingles');
    const isArte = materia[0].nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('arte');
    if (isIngles && !id_nivel_ingles) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Debe seleccionar un nivel de inglés para materias de inglés' });
    }
    if (id_nivel_ingles) {
      const [nivel] = await db.query('SELECT id_nivel_ingles FROM Nivel_Ingles WHERE id_nivel_ingles = ?', [id_nivel_ingles]);
      if (!nivel.length) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'El nivel de inglés seleccionado no existe' });
      }
    }

    // Validar arte especialidad si es necesario
    if (isArte && id_arte_especialidad) {
      const [arte] = await db.query('SELECT id_arte_especialidad FROM Arte_Especialidad WHERE id_arte_especialidad = ?', [id_arte_especialidad]);
      if (!arte.length) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'La especialidad de arte seleccionada no existe' });
      }
    }

    // Insertar en Grupo_Materia
    await connection.query(
      'INSERT INTO Grupo_Materia (id_materia, id_personal, id_grado_grupo, horas_materia) VALUES (?, ?, ?, ?)',
      [id, id_personal, id_grado_grupo, horas_materia || null]
    );

    if (isArte && id_arte_especialidad) {
      await connection.query(
        'INSERT INTO Personal_Arte_Especialidad (id_personal, id_arte_especialidad, id_grado_grupo) VALUES (?, ?, ?)',
        [id_personal, id_arte_especialidad, id_grado_grupo]
      );
    } else if (id_nivel_ingles) {
      await connection.query(
        'INSERT INTO Personal_Nivel_Ingles (id_personal, id_nivel_ingles, id_grado_grupo) VALUES (?, ?, ?)',
        [id_personal, id_nivel_ingles, id_grado_grupo]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Profesor asignado exitosamente' });
  } catch (error) {
    console.error('Error al asignar profesor:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: 'Error interno al asignar profesor' });
  } finally {
    if (connection) connection.release();
  }
});

// Eliminar una asignación
router.delete('/materias/:id/asignaciones', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { id_personal, id_grado_grupo, id_nivel_ingles, id_arte_especialidad } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validar materia
    const [materia] = await db.query('SELECT id_materia, nombre_materia FROM Materia WHERE id_materia = ?', [id]);
    if (!materia.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Materia no encontrada' });
    }

    const isArte = materia[0].nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('arte');

    if (isArte && id_arte_especialidad) {
      // Validar asignación en Personal_Arte_Especialidad
      const [asignacion] = await db.query(
        'SELECT id_personal FROM Personal_Arte_Especialidad WHERE id_personal = ? AND id_grado_grupo = ? AND id_arte_especialidad = ?',
        [id_personal, id_grado_grupo, id_arte_especialidad]
      );
      if (!asignacion.length) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
      }

      await connection.query(
        'DELETE FROM Personal_Arte_Especialidad WHERE id_personal = ? AND id_grado_grupo = ? AND id_arte_especialidad = ?',
        [id_personal, id_grado_grupo, id_arte_especialidad]
      );
    }

    // Validar asignación en Grupo_Materia
    const [asignacion] = await db.query(
      'SELECT id_materia FROM Grupo_Materia WHERE id_materia = ? AND id_personal = ? AND id_grado_grupo = ?',
      [id, id_personal, id_grado_grupo]
    );
    if (!asignacion.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Asignación no encontrada en Grupo_Materia' });
    }

    // Eliminar de Grupo_Materia
    await connection.query(
      'DELETE FROM Grupo_Materia WHERE id_materia = ? AND id_personal = ? AND id_grado_grupo = ?',
      [id, id_personal, id_grado_grupo]
    );

    // Eliminar de Personal_Nivel_Ingles si es necesario
    if (id_nivel_ingles) {
      await connection.query(
        'DELETE FROM Personal_Nivel_Ingles WHERE id_personal = ? AND id_nivel_ingles = ? AND id_grado_grupo = ?',
        [id_personal, id_nivel_ingles, id_grado_grupo]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Asignación eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar asignación:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: 'Error interno al eliminar asignación' });
  } finally {
    if (connection) connection.release();
  }
});

// Agregar una nueva especialidad de arte
router.post('/arte-especialidades', authMiddleware, async (req, res) => {
  const { nombre_arte_especialidad, id_rol_arte, id_personal_arte } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validar rol
    const [rol] = await connection.query('SELECT id_rol FROM Rol WHERE id_rol = ?', [id_rol_arte]);
    if (!rol.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El rol seleccionado no existe' });
    }

    // Validar personal
    const [personal] = await connection.query(
      'SELECT id_personal FROM Personal WHERE id_personal = ? AND id_puesto IN (SELECT id_puesto FROM Puesto_Rol WHERE id_rol = ?)',
      [id_personal_arte, id_rol_arte]
    );
    if (!personal.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'El profesor seleccionado no existe o no tiene el rol especificado' });
    }

    // Insertar especialidad de arte
    const [result] = await connection.query(
      'INSERT INTO Arte_Especialidad (nombre_arte_especialidad) VALUES (?)',
      [nombre_arte_especialidad]
    );
    const id_arte_especialidad = result.insertId;

    // Obtener todas las materias de arte
    const [materiasArte] = await connection.query(`
      SELECT DISTINCT m.id_materia, m.grado_materia
      FROM Materia m
      WHERE LOWER(m.nombre_materia) LIKE '%arte%'
    `);
    console.log('Materias de arte encontradas:', materiasArte);

    // Obtener todos los grupos para los grados de las materias de arte
    const [gradosGrupos] = await connection.query(`
      SELECT id_grado_grupo, grado, grupo
      FROM Grado_grupo
      WHERE grado IN (SELECT DISTINCT grado_materia FROM Materia WHERE LOWER(nombre_materia) LIKE '%arte%')
    `);
    console.log('Grados y grupos disponibles:', gradosGrupos);

    // Insertar en Personal_Arte_Especialidad y Grupo_Materia
    if (materiasArte.length > 0 && gradosGrupos.length > 0) {
      const paeValues = [];
      const gmValues = [];
      const uniquePaeKeys = new Set(); // Para evitar duplicados en Personal_Arte_Especialidad

      for (const materia of materiasArte) {
        const gruposRelevantes = gradosGrupos.filter(g => Number(g.grado) === Number(materia.grado_materia));
        console.log(`Procesando materia ${materia.id_materia}, grado ${materia.grado_materia}:`, gruposRelevantes);

        for (const grupo of gruposRelevantes) {
          // Clave única para Personal_Arte_Especialidad: id_personal + id_arte_especialidad + id_grado_grupo
          const paeKey = `${id_personal_arte}-${id_arte_especialidad}-${grupo.id_grado_grupo}`;
          if (!uniquePaeKeys.has(paeKey)) {
            paeValues.push([id_personal_arte, id_arte_especialidad, grupo.id_grado_grupo]);
            uniquePaeKeys.add(paeKey);
          }

          // Insertar en Grupo_Materia para cada materia y grupo
          gmValues.push([materia.id_materia, id_personal_arte, grupo.id_grado_grupo, null]);
        }
      }

      if (paeValues.length > 0) {
        await connection.query(
          'INSERT IGNORE INTO Personal_Arte_Especialidad (id_personal, id_arte_especialidad, id_grado_grupo) VALUES ?',
          [paeValues]
        );
        console.log('Insertados en Personal_Arte_Especialidad:', paeValues);
      }
      if (gmValues.length > 0) {
        await connection.query(
          'INSERT IGNORE INTO Grupo_Materia (id_materia, id_personal, id_grado_grupo, horas_materia) VALUES ?',
          [gmValues]
        );
        console.log('Insertados en Grupo_Materia:', gmValues);
      }
    } else {
      console.log('No se encontraron materias de arte o grupos para asignar.');
    }

    await connection.commit();
    res.json({ success: true, message: 'Especialidad de arte agregada y asignada exitosamente', id_arte_especialidad });
  } catch (error) {
    console.error('Error al agregar especialidad de arte:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, message: 'Error interno al agregar especialidad de arte' });
  } finally {
    if (connection) connection.release();
  }
});


//FIN RUTAS DE MATERIAS

//RUTAS DE RESULTADOS

/*router.get('/roles', authMiddleware, async (req, res) => {
  try {
    const [roles] = await db.query('SELECT id_rol, nombre_rol FROM Rol');
    res.json(roles);
  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener roles' });
  }
});*/

router.get('/personal-por-rol-resultados/:id_rol', authMiddleware, async (req, res) => {
  const { id_rol } = req.params;
  try {
    const [personal] = await db.query(`
      SELECT 
        p.id_personal, 
        p.nombre_personal, 
        p.apaterno_personal, 
        p.amaterno_personal, 
        p.img_personal, 
        pu.nombre_puesto,
        GROUP_CONCAT(r.nombre_rol ORDER BY r.nombre_rol SEPARATOR ', ') AS roles_puesto
      FROM Personal p
      JOIN Puesto pu ON p.id_puesto = pu.id_puesto
      JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
      JOIN Rol r ON pr.id_rol = r.id_rol
      WHERE pr.id_rol = ? AND p.estado_personal = 1
      GROUP BY p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, pu.nombre_puesto
    `, [id_rol]);
    res.json(personal);
  } catch (error) {
    console.error('Error al obtener personal por rol:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener personal por rol' });
  }
});

router.get('/personal-resultados', authMiddleware, async (req, res) => {
  try {
    const [personal] = await db.query(`
      SELECT 
        p.id_personal, 
        p.nombre_personal, 
        p.apaterno_personal, 
        p.amaterno_personal, 
        p.img_personal, 
        pu.nombre_puesto,
        GROUP_CONCAT(r.nombre_rol ORDER BY r.nombre_rol SEPARATOR ', ') AS roles_puesto
      FROM Personal p
      JOIN Puesto pu ON p.id_puesto = pu.id_puesto
      LEFT JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
      LEFT JOIN Rol r ON pr.id_rol = r.id_rol
      WHERE p.estado_personal = 1
      GROUP BY p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, pu.nombre_puesto
    `);
    res.json(personal);
  } catch (error) {
    console.error('Error al obtener personal:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener personal' });
  }
});

router.get('/personal-resultados/:id_personal', authMiddleware, async (req, res) => {
  const { id_personal } = req.params;
  try {
    const [personal] = await db.query(`
      SELECT 
        p.id_personal, 
        p.nombre_personal, 
        p.apaterno_personal, 
        p.amaterno_personal, 
        p.telefono_personal, 
        p.fecha_nacimiento_personal, 
        p.img_personal, 
        pu.nombre_puesto,
        GROUP_CONCAT(r.nombre_rol ORDER BY r.nombre_rol SEPARATOR ', ') AS roles_puesto
      FROM Personal p
      JOIN Puesto pu ON p.id_puesto = pu.id_puesto
      LEFT JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
      LEFT JOIN Rol r ON pr.id_rol = r.id_rol
      WHERE p.id_personal = ? AND p.estado_personal = 1
      GROUP BY p.id_personal
    `, [id_personal]);

    if (personal.length === 0) {
      return res.status(404).json({ success: false, message: 'Personal no encontrado' });
    }

    const [materias] = await db.query(`
      SELECT 
        m.nombre_materia, 
        m.modelo_materia, 
        m.grado_materia, 
        gm.horas_materia, 
        gg.grupo
      FROM Grupo_Materia gm
      JOIN Materia m ON gm.id_materia = m.id_materia
      JOIN Grado_grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
      WHERE gm.id_personal = ?
      ORDER BY m.grado_materia, m.nombre_materia
    `, [id_personal]);

    const [talleres] = await db.query(`
      SELECT t.nombre_taller
      FROM Personal_taller pt
      JOIN Taller t ON pt.id_taller = t.id_taller
      WHERE pt.id_personal = ?
      ORDER BY t.nombre_taller
    `, [id_personal]);

    res.json({
      ...personal[0],
      materias: materias || [],
      talleres: talleres || []
    });
  } catch (error) {
    console.error('Error al obtener datos del personal:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener datos del personal' });
  }
});

router.get('/personal-kpis/:id_personal', authMiddleware, async (req, res) => {
  const { id_personal } = req.params;
  try {
    const [categorias] = await db.query(`
      SELECT 
        pc.id_categoria_kpi,
        ck.nombre_categoria_kpi,
        pc.porcentaje_categoria
      FROM Puesto_Categoria pc
      JOIN Categoria_Kpi ck ON pc.id_categoria_kpi = ck.id_categoria_kpi
      JOIN Personal p ON pc.id_puesto = p.id_puesto
      WHERE p.id_personal = ? AND p.estado_personal = 1
    `, [id_personal]);

    const kpiData = [];
    for (const categoria of categorias) {
      const [kpis] = await db.query(`
        SELECT 
          k.id_kpi,
          k.nombre_kpi,
          k.meta_kpi,
          k.tipo_kpi,
          ae.nombre_area_estrategica,
          ae.siglas_area_estrategica,
          ik.nombre_indicador_kpi,
          ik.sigla_indicador_kpi,
          r.nombre_rol AS responsable_medicion,
          rk.resultado_kpi
        FROM Puesto_Kpi pk
        JOIN Kpi k ON pk.id_kpi = k.id_kpi
        JOIN Area_Estrategica ae ON k.id_area_estrategica = ae.id_area_estrategica
        JOIN Indicador_Kpi ik ON k.id_indicador_kpi = ik.id_indicador_kpi
        LEFT JOIN Rol r ON k.id_rol = r.id_rol
        LEFT JOIN Resultado_Kpi rk ON k.id_kpi = rk.id_kpi AND rk.id_personal = ?
        JOIN Personal p ON pk.id_puesto = p.id_puesto
        WHERE p.id_personal = ? AND k.id_categoria_kpi = ?
        ORDER BY k.id_kpi
      `, [id_personal, id_personal, categoria.id_categoria_kpi]);

      kpiData.push({
        ...categoria,
        kpis: kpis.map(kpi => ({
          ...kpi,
          resultado_kpi: kpi.resultado_kpi !== null ? kpi.resultado_kpi : 'No evaluado'
        }))
      });
    }

    res.json(kpiData);
  } catch (error) {
    console.error('Error al obtener KPIs del personal:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener KPIs' });
  }
});

router.get('/personal-evaluaciones-types/:id_personal', authMiddleware, async (req, res) => {
  const { id_personal } = req.params;
  try {
    const tipos = [];

    // Obtener el puesto del personal
    const [personalPuesto] = await db.query(`
      SELECT pu.nombre_puesto
      FROM Personal p
      JOIN Puesto pu ON p.id_puesto = pu.id_puesto
      WHERE p.id_personal = ?
    `, [id_personal]);
    if (personalPuesto.length === 0) {
      console.log(`No se encontró personal con id_personal: ${id_personal}`);
      return res.json([]);
    }
    const nombrePuesto = personalPuesto[0].nombre_puesto.toLowerCase();

    // Obtener roles del personal
    const [rolesPersonal] = await db.query(`
      SELECT r.nombre_rol
      FROM Personal p
      JOIN Puesto pu ON p.id_puesto = pu.id_puesto
      JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
      JOIN Rol r ON pr.id_rol = r.id_rol
      WHERE p.id_personal = ?
    `, [id_personal]);
    const roles = rolesPersonal.map(r => r.nombre_rol.toLowerCase());

    // Check for materias
    const [materiasCount] = await db.query(`
      SELECT COUNT(*) as count FROM Grupo_Materia WHERE id_personal = ?
    `, [id_personal]);
    if (materiasCount[0].count > 0) {
      console.log(`Materias encontradas para id_personal: ${id_personal}`);
      tipos.push('materias');
    }

    // Check for talleres
    const [talleresCount] = await db.query(`
      SELECT COUNT(*) as count FROM Personal_taller WHERE id_personal = ?
    `, [id_personal]);
    if (talleresCount[0].count > 0) {
      console.log(`Talleres encontrados para id_personal: ${id_personal}`);
      tipos.push('talleres');
    }

    // Check for artes (usando Personal_Arte_Especialidad)
    const [artesCount] = await db.query(`
      SELECT COUNT(*) as count FROM Personal_Arte_Especialidad WHERE id_personal = ?
    `, [id_personal]);
    if (artesCount[0].count > 0) {
      console.log(`Especialidades de arte encontradas para id_personal: ${id_personal}`);
      tipos.push('artes');
    }

    // Check for niveles de inglés
    const [inglesCount] = await db.query(`
      SELECT COUNT(*) as count FROM Personal_Nivel_Ingles WHERE id_personal = ?
    `, [id_personal]);
    if (inglesCount[0].count > 0) {
      console.log(`Niveles de inglés encontrados para id_personal: ${id_personal}`);
      tipos.push('ingles');
    }

    // Check for pares
    const [paresCount] = await db.query(`
      SELECT COUNT(*) as count FROM Personal_Par WHERE id_personal = ?
    `, [id_personal]);
    if (paresCount[0].count > 0) {
      console.log(`Pares encontrados para id_personal: ${id_personal}`);
      tipos.push('pares');
    }

    // Check for jefes
    const [jefesCount] = await db.query(`
      SELECT COUNT(*) as count FROM Personal_Jefe WHERE id_personal = ?
    `, [id_personal]);
    if (jefesCount[0].count > 0) {
      console.log(`Jefes encontrados para id_personal: ${id_personal}`);
      tipos.push('jefes');
    }

    // Check for subordinados
    const [subordinadosCount] = await db.query(`
      SELECT COUNT(*) as count FROM Personal_Subordinado WHERE id_personal = ?
    `, [id_personal]);
    if (subordinadosCount[0].count > 0) {
      console.log(`Subordinados encontrados para id_personal: ${id_personal}`);
      tipos.push('subordinados');
    }

    // Check for coordinadores
    const [coordinadoresCount] = await db.query(`
      SELECT COUNT(*) as count FROM Personal_Coordinador WHERE id_personal = ?
    `, [id_personal]);
    if (coordinadoresCount[0].count > 0) {
      console.log(`Coordinadores encontrados para id_personal: ${id_personal}`);
      tipos.push('coordinadores');
    }

    // Check for 360
    const [tres60Count] = await db.query(`
      SELECT COUNT(*) as count FROM Personal_360 WHERE id_personal = ?
    `, [id_personal]);
    if (tres60Count[0].count > 0) {
      console.log(`Evaluaciones 360 encontradas para id_personal: ${id_personal}`);
      tipos.push('360');
    }

    // Ajustes basados en roles/puesto (ejemplo para subdirectores que dan clases)
    if (roles.some(r => r.includes('subdirector')) && (materiasCount[0].count > 0 || talleresCount[0].count > 0 || inglesCount[0].count > 0 || artesCount[0].count > 0)) {
      console.log(`Subdirector con actividades docentes encontrado para id_personal: ${id_personal}`);
      tipos.push('alumnos');
    }

    // Elimina duplicados
    const uniqueTipos = [...new Set(tipos)];
    console.log(`Tipos de evaluaciones finales para id_personal ${id_personal}:`, uniqueTipos);

    res.json(uniqueTipos);
  } catch (error) {
    console.error('Error al obtener tipos de evaluaciones:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener tipos de evaluaciones' });
  }
});

// Obtener personal asociado a un rol específico
router.get('/personal-by-role-permisos/:roleId', async (req, res) => {
    const { roleId } = req.params;
    try {
        const [personal] = await db.query(
            `SELECT DISTINCT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.id_usuario
             FROM Personal p
             JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
             WHERE pr.id_rol = ?`,
            [roleId]
        );
        res.json({ success: true, personal });
    } catch (error) {
        console.error('Error fetching personal by role:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta.' });
    }
});

// Fetch all roles
router.get('/personal-roles', authMiddleware, async (req, res) => {
    try {
        const [roles] = await db.query('SELECT id_rol, nombre_rol FROM Rol');
        res.json({ success: true, roles });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta de roles.' });
    }
});

// Fetch all categories with their roles
router.get('/personal-categories', authMiddleware, async (req, res) => {
    try {
        const [categories] = await db.query(`
            SELECT r.id_rol, r.nombre_rol, p.nombre_puesto
            FROM Rol r
            JOIN Puesto_Rol pr ON r.id_rol = pr.id_rol
            JOIN Puesto p ON pr.id_puesto = p.id_puesto
        `);
        const roleCategories = [
            { name: 'Dirección', roleIds: [3, 12] },
            { name: 'Subdirección', roleIds: [4, 5, 8, 11, 16, 18, 21, 23, 37] },
            { name: 'Docentes', roleIds: [1, 2, 15, 19, 30, 31, 36] },
            { name: 'Servicios', roleIds: [9, 10, 20, 24, 27] },
            { name: 'Otros', roleIds: [6, 7, 13, 14, 17, 22, 25, 26, 28, 29, 32, 33, 34, 35] }
        ];
        res.json({ success: true, categories: roleCategories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta de categorías.' });
    }
});

// Fetch personal by role
router.get('/personal-by-role/:roleId', authMiddleware, async (req, res) => {
    const { roleId } = req.params;
    try {
        const [personal] = await db.query(`
            SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.telefono_personal, p.id_usuario, p.id_puesto, p.img_personal
            FROM Personal p
            JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
            WHERE pr.id_rol = ? AND p.estado_personal = 1
        `, [roleId]);
        res.json({ success: true, personal });
    } catch (error) {
        console.error('Error fetching personal:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta de personal.' });
    }
});

// Fetch KPI results for a personal with responsible role
router.get('/personal-kpi-results/:id_personal', authMiddleware, async (req, res) => {
    const { id_personal } = req.params;
    try {
        const [results] = await db.query(`
            SELECT rk.id_resultado_kpi, rk.resultado_kpi, k.nombre_kpi, k.meta_kpi, k.tipo_kpi, ck.nombre_categoria_kpi, pc.porcentaje_categoria, r.nombre_rol AS responsable
            FROM Resultado_Kpi rk
            JOIN Kpi k ON rk.id_kpi = k.id_kpi
            JOIN Categoria_Kpi ck ON k.id_categoria_kpi = ck.id_categoria_kpi
            JOIN Puesto_Kpi pk ON k.id_kpi = pk.id_kpi
            JOIN Puesto_Categoria pc ON pk.id_puesto = pc.id_puesto AND k.id_categoria_kpi = pc.id_categoria_kpi
            JOIN Personal p ON rk.id_personal = p.id_personal
            JOIN Rol r ON k.id_rol = r.id_rol
            WHERE rk.id_personal = ? AND p.id_puesto = pk.id_puesto
        `, [id_personal]);
        res.json({ success: true, results });
    } catch (error) {
        console.error('Error fetching KPI results:', error);
        res.status(500).json({ success: false, message: 'Error en la consulta de resultados KPI.' });
    }
});

router.get('/personal-evaluaciones-results/:id_personal/:tipo', authMiddleware, async (req, res) => {
  const { id_personal, tipo } = req.params;
  const idTipoPregunta = req.query.id_tipo_pregunta;
  try {
    if (!idTipoPregunta) {
      return res.status(400).json({ success: false, message: 'id_tipo_pregunta requerido' });
    }

    // Nombre del personal
    const [personal] = await db.query(`
      SELECT nombre_personal, apaterno_personal, amaterno_personal
      FROM Personal
      WHERE id_personal = ?
    `, [id_personal]);
    if (personal.length === 0) {
      return res.status(404).json({ success: false, message: 'Personal no encontrado' });
    }
    const teacherName = `${personal[0].nombre_personal} ${personal[0].apaterno_personal} ${personal[0].amaterno_personal}`.toUpperCase();

    // Fetch preguntas (criterios)
    const [questions] = await db.query(`
      SELECT id_pregunta, nombre_pregunta
      FROM Pregunta
      WHERE id_tipo_pregunta = ?
      ORDER BY id_pregunta
    `, [idTipoPregunta]);
    if (questions.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay preguntas para este tipo de evaluación' });
    }

    let subjects = [];
    let comments = [];
    let isMultiple = false;

    // Define table mappings for each tipo
    const responseTables = {
      materias: 'Respuesta_Alumno_Docente',
      talleres: 'Respuesta_Alumno_Taller',
      counselors: 'Respuesta_Alumno_Counselor',
      coordinadores: 'Respuesta_Personal',
      subordinados: 'Respuesta_Personal',
      '360': 'Respuesta_Personal',
      pares: 'Respuesta_Personal',
      jefes: 'Respuesta_Personal',
      servicios: 'Respuesta_Alumno_Servicio',
      instalaciones: 'Respuesta_Alumno_Servicio',
      ingles: 'Respuesta_Alumno_Docente_Ingles',
      artes: 'Respuesta_Alumno_Docente_Arte',
      psicopedagogico: 'Respuesta_Alumno_Psicopedagogico',
    };

    const commentTables = {
      materias: 'Comentario_Docente',
      talleres: 'Comentario_Taller',
      counselors: 'Comentario_Counselor',
      coordinadores: 'Comentario_Personal',
      subordinados: 'Comentario_Personal',
      '360': 'Comentario_Personal',
      pares: 'Comentario_Personal',
      jefes: 'Comentario_Personal',
      servicios: 'Comentario_Servicio',
      instalaciones: 'Comentario_Servicio',
      ingles: 'Comentario_Docente_Ingles',
      artes: 'Comentario_Docente_Arte',
      psicopedagogico: 'Comentario_Psicopedagogico',
    };

    const commentColumnNames = {
      materias: 'comentario_docente',
      talleres: 'comentario_taller',
      counselors: 'comentario_counselor',
      coordinadores: 'comentario_personal',
      subordinados: 'comentario_personal',
      '360': 'comentario_personal',
      pares: 'comentario_personal',
      jefes: 'comentario_personal',
      servicios: 'comentario_servicio',
      instalaciones: 'comentario_servicio',
      ingles: 'comentario_docente_ingles',
      artes: 'comentario_docente_arte',
      psicopedagogico: 'comentario_servicio',
    };

    // Logic for each evaluation type
    if (tipo === 'materias') {
      const [materias] = await db.query(`
        SELECT DISTINCT m.id_materia, m.nombre_materia
        FROM Grupo_Materia gm
        JOIN Materia m ON gm.id_materia = m.id_materia
        WHERE gm.id_personal = ?
      `, [id_personal]);
      isMultiple = materias.length > 1;

      for (const materia of materias) {
        const [totalAlumnos] = await db.query(`
          SELECT COUNT(DISTINCT id_alumno) as total
          FROM Respuesta_Alumno_Docente
          WHERE id_personal = ? AND id_materia = ?
        `, [id_personal, materia.id_materia]);
        const total = totalAlumnos[0].total;

        const criteria = [];
        let sumAvgSi = 0;

        for (const [index, q] of questions.entries()) {
          const [counts] = await db.query(`
            SELECT r.nombre_respuesta, COUNT(*) as count
            FROM Respuesta_Alumno_Docente rad
            JOIN Respuesta r ON rad.id_respuesta = r.id_respuesta
            WHERE rad.id_personal = ? AND rad.id_materia = ? AND rad.id_pregunta = ?
            GROUP BY r.nombre_respuesta
          `, [id_personal, materia.id_materia, q.id_pregunta]);

          let si = 0, no = 0;
          counts.forEach(c => {
            if (c.nombre_respuesta === 'Si') si = c.count;
            if (c.nombre_respuesta === 'No') no = c.count;
          });
          const totalResponses = si + no;
          const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
          const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

          criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
          sumAvgSi += parseFloat(pctSi);
        }

        const avgSi = (sumAvgSi / questions.length).toFixed(2);
        const avgNo = (100 - avgSi).toFixed(2);

        subjects.push({ name: materia.nombre_materia.toUpperCase(), totalAlumnos: total, criteria, avgSi, avgNo });

        const [commentsData] = await db.query(`
          SELECT comentario_docente
          FROM Comentario_Docente
          WHERE id_personal = ? AND id_materia = ?
        `, [id_personal, materia.id_materia]);
        comments = comments.concat(commentsData.map(c => c.comentario_docente));
      }
    } else if (tipo === 'talleres') {
      const [talleres] = await db.query(`
        SELECT DISTINCT t.id_taller, t.nombre_taller
        FROM Personal_taller pt
        JOIN Taller t ON pt.id_taller = t.id_taller
        WHERE pt.id_personal = ?
      `, [id_personal]);
      isMultiple = talleres.length > 1;

      for (const taller of talleres) {
        const [totalAlumnos] = await db.query(`
          SELECT COUNT(DISTINCT id_alumno) as total
          FROM Respuesta_Alumno_Taller
          WHERE id_personal = ? AND id_taller = ?
        `, [id_personal, taller.id_taller]);
        const total = totalAlumnos[0].total;

        const criteria = [];
        let sumAvgSi = 0;

        for (const [index, q] of questions.entries()) {
          const [counts] = await db.query(`
            SELECT r.nombre_respuesta, COUNT(*) as count
            FROM Respuesta_Alumno_Taller rat
            JOIN Respuesta r ON rat.id_respuesta = r.id_respuesta
            WHERE rat.id_personal = ? AND rat.id_taller = ? AND rat.id_pregunta = ?
            GROUP BY r.nombre_respuesta
          `, [id_personal, taller.id_taller, q.id_pregunta]);

          let si = 0, no = 0;
          counts.forEach(c => {
            if (c.nombre_respuesta === 'Si') si = c.count;
            if (c.nombre_respuesta === 'No') no = c.count;
          });
          const totalResponses = si + no;
          const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
          const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

          criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
          sumAvgSi += parseFloat(pctSi);
        }

        const avgSi = (sumAvgSi / questions.length).toFixed(2);
        const avgNo = (100 - avgSi).toFixed(2);

        subjects.push({ name: taller.nombre_taller.toUpperCase(), totalAlumnos: total, criteria, avgSi, avgNo });

        const [commentsData] = await db.query(`
          SELECT comentario_taller
          FROM Comentario_Taller
          WHERE id_personal = ? AND id_taller = ?
        `, [id_personal, taller.id_taller]);
        comments = comments.concat(commentsData.map(c => c.comentario_taller));
      }
    } else if (tipo === 'counselors') {
      const [totalAlumnos] = await db.query(`
        SELECT COUNT(DISTINCT id_alumno) as total
        FROM Respuesta_Alumno_Counselor
        WHERE id_personal = ?
      `, [id_personal]);
      const total = totalAlumnos[0].total;

      const criteria = [];
      let sumAvgSi = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.nombre_respuesta, COUNT(*) as count
          FROM Respuesta_Alumno_Counselor rac
          JOIN Respuesta r ON rac.id_respuesta = r.id_respuesta
          WHERE rac.id_personal = ? AND rac.id_pregunta = ?
          GROUP BY r.nombre_respuesta
        `, [id_personal, q.id_pregunta]);

        let si = 0, no = 0;
        counts.forEach(c => {
          if (c.nombre_respuesta === 'Si') si = c.count;
          if (c.nombre_respuesta === 'No') no = c.count;
        });
        const totalResponses = si + no;
        const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
        const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        sumAvgSi += parseFloat(pctSi);
      }

      const avgSi = (sumAvgSi / questions.length).toFixed(2);
      const avgNo = (100 - avgSi).toFixed(2);

      subjects.push({ name: 'COUNSELOR', totalAlumnos: total, criteria, avgSi, avgNo });

      const [commentsData] = await db.query(`
        SELECT comentario_counselor
        FROM Comentario_Counselor
        WHERE id_personal = ?
      `, [id_personal]);
      comments = comments.concat(commentsData.map(c => c.comentario_counselor));
    } else if (tipo === '360') {
      // Explicit handling for 360 evaluations with id_tipo_pregunta = 5
      const [totalEvaluadores] = await db.query(`
        SELECT COUNT(DISTINCT id_evaluador) as total
        FROM Respuesta_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, 5]);
      const total = totalEvaluadores[0].total;

      const criteria = [];
      let sumAvgSi = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.nombre_respuesta, COUNT(*) as count
          FROM Respuesta_Personal rp
          JOIN Respuesta r ON rp.id_respuesta = r.id_respuesta
          WHERE rp.id_personal = ? AND rp.id_tipo_pregunta = ? AND rp.id_pregunta = ?
          GROUP BY r.nombre_respuesta
        `, [id_personal, 5, q.id_pregunta]);

        let si = 0, no = 0;
        counts.forEach(c => {
          if (c.nombre_respuesta === 'Si') si = c.count;
          if (c.nombre_respuesta === 'No') no = c.count;
        });
        const totalResponses = si + no;
        const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
        const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        sumAvgSi += parseFloat(pctSi);
      }

      const avgSi = (sumAvgSi / questions.length).toFixed(2);
      const avgNo = (100 - avgSi).toFixed(2);

      subjects.push({ name: 'EVALUACIÓN 360', totalAlumnos: total, criteria, avgSi, avgNo });

      const [commentsData] = await db.query(`
        SELECT comentario_personal
        FROM Comentario_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, 5]);
      comments = comments.concat(commentsData.map(c => c.comentario_personal));
    } else if (tipo === 'subordinados') {
      const [totalEvaluadores] = await db.query(`
        SELECT COUNT(DISTINCT id_evaluador) as total
        FROM Respuesta_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, idTipoPregunta]);
      const total = totalEvaluadores[0].total;

      const criteria = [];
      let sumAvgSi = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.nombre_respuesta, COUNT(*) as count
          FROM Respuesta_Personal rp
          JOIN Respuesta r ON rp.id_respuesta = r.id_respuesta
          WHERE rp.id_personal = ? AND rp.id_tipo_pregunta = ? AND rp.id_pregunta = ?
          GROUP BY r.nombre_respuesta
        `, [id_personal, idTipoPregunta, q.id_pregunta]);

        let si = 0, no = 0;
        counts.forEach(c => {
          if (c.nombre_respuesta === 'Si') si = c.count;
          if (c.nombre_respuesta === 'No') no = c.count;
        });
        const totalResponses = si + no;
        const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
        const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        sumAvgSi += parseFloat(pctSi);
      }

      const avgSi = (sumAvgSi / questions.length).toFixed(2);
      const avgNo = (100 - avgSi).toFixed(2);

      subjects.push({ name: 'SUBORDINADOS', totalAlumnos: total, criteria, avgSi, avgNo });

      const [commentsData] = await db.query(`
        SELECT comentario_personal
        FROM Comentario_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, idTipoPregunta]);
      comments = comments.concat(commentsData.map(c => c.comentario_personal));
    } else if (tipo === 'pares') {
      const [totalEvaluadores] = await db.query(`
        SELECT COUNT(DISTINCT id_evaluador) as total
        FROM Respuesta_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, idTipoPregunta]);
      const total = totalEvaluadores[0].total;

      const criteria = [];
      let sumAvgSi = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.nombre_respuesta, COUNT(*) as count
          FROM Respuesta_Personal rp
          JOIN Respuesta r ON rp.id_respuesta = r.id_respuesta
          WHERE rp.id_personal = ? AND rp.id_tipo_pregunta = ? AND rp.id_pregunta = ?
          GROUP BY r.nombre_respuesta
        `, [id_personal, idTipoPregunta, q.id_pregunta]);

        let si = 0, no = 0;
        counts.forEach(c => {
          if (c.nombre_respuesta === 'Si') si = c.count;
          if (c.nombre_respuesta === 'No') no = c.count;
        });
        const totalResponses = si + no;
        const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
        const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        sumAvgSi += parseFloat(pctSi);
      }

      const avgSi = (sumAvgSi / questions.length).toFixed(2);
      const avgNo = (100 - avgSi).toFixed(2);

      subjects.push({ name: 'PARES', totalAlumnos: total, criteria, avgSi, avgNo });

      const [commentsData] = await db.query(`
        SELECT comentario_personal
        FROM Comentario_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, idTipoPregunta]);
      comments = comments.concat(commentsData.map(c => c.comentario_personal));
    } else if (tipo === 'jefes') {
      const [totalEvaluadores] = await db.query(`
        SELECT COUNT(DISTINCT id_evaluador) as total
        FROM Respuesta_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, idTipoPregunta]);
      const total = totalEvaluadores[0].total;

      const criteria = [];
      let sumAvgSi = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.nombre_respuesta, COUNT(*) as count
          FROM Respuesta_Personal rp
          JOIN Respuesta r ON rp.id_respuesta = r.id_respuesta
          WHERE rp.id_personal = ? AND rp.id_tipo_pregunta = ? AND rp.id_pregunta = ?
          GROUP BY r.nombre_respuesta
        `, [id_personal, idTipoPregunta, q.id_pregunta]);

        let si = 0, no = 0;
        counts.forEach(c => {
          if (c.nombre_respuesta === 'Si') si = c.count;
          if (c.nombre_respuesta === 'No') no = c.count;
        });
        const totalResponses = si + no;
        const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
        const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        sumAvgSi += parseFloat(pctSi);
      }

      const avgSi = (sumAvgSi / questions.length).toFixed(2);
      const avgNo = (100 - avgSi).toFixed(2);

      subjects.push({ name: 'JEFES', totalAlumnos: total, criteria, avgSi, avgNo });

      const [commentsData] = await db.query(`
        SELECT comentario_personal
        FROM Comentario_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, idTipoPregunta]);
      comments = comments.concat(commentsData.map(c => c.comentario_personal));
    } else if (tipo === 'coordinadores') {
      const [totalEvaluadores] = await db.query(`
        SELECT COUNT(DISTINCT id_evaluador) as total
        FROM Respuesta_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, idTipoPregunta]);
      const total = totalEvaluadores[0].total;

      const criteria = [];
      let sumAvgSi = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.nombre_respuesta, COUNT(*) as count
          FROM Respuesta_Personal rp
          JOIN Respuesta r ON rp.id_respuesta = r.id_respuesta
          WHERE rp.id_personal = ? AND rp.id_tipo_pregunta = ? AND rp.id_pregunta = ?
          GROUP BY r.nombre_respuesta
        `, [id_personal, idTipoPregunta, q.id_pregunta]);

        let si = 0, no = 0;
        counts.forEach(c => {
          if (c.nombre_respuesta === 'Si') si = c.count;
          if (c.nombre_respuesta === 'No') no = c.count;
        });
        const totalResponses = si + no;
        const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
        const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        sumAvgSi += parseFloat(pctSi);
      }

      const avgSi = (sumAvgSi / questions.length).toFixed(2);
      const avgNo = (100 - avgSi).toFixed(2);

      subjects.push({ name: 'COORDINADORES', totalAlumnos: total, criteria, avgSi, avgNo });

      const [commentsData] = await db.query(`
        SELECT comentario_personal
        FROM Comentario_Personal
        WHERE id_personal = ? AND id_tipo_pregunta = ?
      `, [id_personal, idTipoPregunta]);
      comments = comments.concat(commentsData.map(c => c.comentario_personal));
    } else if (tipo === 'servicios' || tipo === 'instalaciones') {
      const [servicios] = await db.query(`
        SELECT DISTINCT s.id_servicio, s.nombre_servicio
        FROM Servicio s
        JOIN Respuesta_Alumno_Servicio ras ON s.id_servicio = ras.id_servicio
        WHERE ras.id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = ?)
      `, [idTipoPregunta]);
      isMultiple = servicios.length > 1;

      for (const servicio of servicios) {
        const [totalAlumnos] = await db.query(`
          SELECT COUNT(DISTINCT id_alumno) as total
          FROM Respuesta_Alumno_Servicio
          WHERE id_servicio = ?
        `, [servicio.id_servicio]);
        const total = totalAlumnos[0].total;

        const criteria = [];
        let sumAvgSi = 0;

        for (const [index, q] of questions.entries()) {
          const [counts] = await db.query(`
            SELECT r.nombre_respuesta, COUNT(*) as count
            FROM Respuesta_Alumno_Servicio ras
            JOIN Respuesta r ON ras.id_respuesta = r.id_respuesta
            WHERE ras.id_servicio = ? AND ras.id_pregunta = ?
            GROUP BY r.nombre_respuesta
          `, [servicio.id_servicio, q.id_pregunta]);

          let si = 0, no = 0;
          counts.forEach(c => {
            if (c.nombre_respuesta === 'Si') si = c.count;
            if (c.nombre_respuesta === 'No') no = c.count;
          });
          const totalResponses = si + no;
          const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
          const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

          criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
          sumAvgSi += parseFloat(pctSi);
        }

        const avgSi = (sumAvgSi / questions.length).toFixed(2);
        const avgNo = (100 - avgSi).toFixed(2);

        subjects.push({ name: servicio.nombre_servicio.toUpperCase(), totalAlumnos: total, criteria, avgSi, avgNo });

        const [commentsData] = await db.query(`
          SELECT comentario_servicio
          FROM Comentario_Servicio
          WHERE id_servicio = ?
        `, [servicio.id_servicio]);
        comments = comments.concat(commentsData.map(c => c.comentario_servicio));
      }
    } else if (tipo === 'ingles') {
      const [niveles] = await db.query(`
        SELECT DISTINCT ni.id_nivel_ingles, ni.nombre_nivel
        FROM Nivel_Ingles ni
        JOIN Respuesta_Alumno_Docente_Ingles radi ON ni.id_nivel_ingles = radi.id_nivel_ingles
        WHERE radi.id_personal = ?
      `, [id_personal]);
      isMultiple = niveles.length > 1;

      for (const nivel of niveles) {
        const [totalAlumnos] = await db.query(`
          SELECT COUNT(DISTINCT id_alumno) as total
          FROM Respuesta_Alumno_Docente_Ingles
          WHERE id_personal = ? AND id_nivel_ingles = ?
        `, [id_personal, nivel.id_nivel_ingles]);
        const total = totalAlumnos[0].total;

        const criteria = [];
        let sumAvgSi = 0;

        for (const [index, q] of questions.entries()) {
          const [counts] = await db.query(`
            SELECT r.nombre_respuesta, COUNT(*) as count
            FROM Respuesta_Alumno_Docente_Ingles radi
            JOIN Respuesta r ON radi.id_respuesta = r.id_respuesta
            WHERE radi.id_personal = ? AND radi.id_nivel_ingles = ? AND radi.id_pregunta = ?
            GROUP BY r.nombre_respuesta
          `, [id_personal, nivel.id_nivel_ingles, q.id_pregunta]);

          let si = 0, no = 0;
          counts.forEach(c => {
            if (c.nombre_respuesta === 'Si') si = c.count;
            if (c.nombre_respuesta === 'No') no = c.count;
          });
          const totalResponses = si + no;
          const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
          const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

          criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
          sumAvgSi += parseFloat(pctSi);
        }

        const avgSi = (sumAvgSi / questions.length).toFixed(2);
        const avgNo = (100 - avgSi).toFixed(2);

        subjects.push({ name: nivel.nombre_nivel.toUpperCase(), totalAlumnos: total, criteria, avgSi, avgNo });

        const [commentsData] = await db.query(`
          SELECT comentario_docente_ingles
          FROM Comentario_Docente_Ingles
          WHERE id_personal = ? AND id_nivel_ingles = ?
        `, [id_personal, nivel.id_nivel_ingles]);
        comments = comments.concat(commentsData.map(c => c.comentario_docente_ingles));
      }
    } else if (tipo === 'artes') {
      const [especialidades] = await db.query(`
        SELECT DISTINCT ae.id_arte_especialidad, ae.nombre_especialidad
        FROM Arte_Especialidad ae
        JOIN Respuesta_Alumno_Docente_Arte rada ON ae.id_arte_especialidad = rada.id_arte_especialidad
        WHERE rada.id_personal = ?
      `, [id_personal]);
      isMultiple = especialidades.length > 1;

      for (const especialidad of especialidades) {
        const [totalAlumnos] = await db.query(`
          SELECT COUNT(DISTINCT id_alumno) as total
          FROM Respuesta_Alumno_Docente_Arte
          WHERE id_personal = ? AND id_arte_especialidad = ?
        `, [id_personal, especialidad.id_arte_especialidad]);
        const total = totalAlumnos[0].total;

        const criteria = [];
        let sumAvgSi = 0;

        for (const [index, q] of questions.entries()) {
          const [counts] = await db.query(`
            SELECT r.nombre_respuesta, COUNT(*) as count
            FROM Respuesta_Alumno_Docente_Arte rada
            JOIN Respuesta r ON rada.id_respuesta = r.id_respuesta
            WHERE rada.id_personal = ? AND rada.id_arte_especialidad = ? AND rada.id_pregunta = ?
            GROUP BY r.nombre_respuesta
          `, [id_personal, especialidad.id_arte_especialidad, q.id_pregunta]);

          let si = 0, no = 0;
          counts.forEach(c => {
            if (c.nombre_respuesta === 'Si') si = c.count;
            if (c.nombre_respuesta === 'No') no = c.count;
          });
          const totalResponses = si + no;
          const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
          const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

          criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
          sumAvgSi += parseFloat(pctSi);
        }

        const avgSi = (sumAvgSi / questions.length).toFixed(2);
        const avgNo = (100 - avgSi).toFixed(2);

        subjects.push({ name: especialidad.nombre_especialidad.toUpperCase(), totalAlumnos: total, criteria, avgSi, avgNo });

        const [commentsData] = await db.query(`
          SELECT comentario_docente_arte
          FROM Comentario_Docente_Arte
          WHERE id_personal = ? AND id_arte_especialidad = ?
        `, [id_personal, especialidad.id_arte_especialidad]);
        comments = comments.concat(commentsData.map(c => c.comentario_docente_arte));
      }
    } else if (tipo === 'psicopedagogico') {
      const [totalAlumnos] = await db.query(`
        SELECT COUNT(DISTINCT id_alumno) as total
        FROM Respuesta_Alumno_Psicopedagogico
        WHERE id_personal = ?
      `, [id_personal]);
      const total = totalAlumnos[0].total;

      const criteria = [];
      let sumAvgSi = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.nombre_respuesta, COUNT(*) as count
          FROM Respuesta_Alumno_Psicopedagogico rap
          JOIN Respuesta r ON rap.id_respuesta = r.id_respuesta
          WHERE rap.id_personal = ? AND rap.id_pregunta = ?
          GROUP BY r.nombre_respuesta
        `, [id_personal, q.id_pregunta]);

        let si = 0, no = 0;
        counts.forEach(c => {
          if (c.nombre_respuesta === 'Si') si = c.count;
          if (c.nombre_respuesta === 'No') no = c.count;
        });
        const totalResponses = si + no;
        const pctSi = totalResponses ? ((si / totalResponses) * 100).toFixed(2) : 0;
        const pctNo = totalResponses ? ((no / totalResponses) * 100).toFixed(2) : 0;

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        sumAvgSi += parseFloat(pctSi);
      }

      const avgSi = (sumAvgSi / questions.length).toFixed(2);
      const avgNo = (100 - avgSi).toFixed(2);

      subjects.push({ name: 'PSICOPEDAGOGICO', totalAlumnos: total, criteria, avgSi, avgNo });

      const [commentsData] = await db.query(`
        SELECT comentario_servicio
        FROM Comentario_Psicopedagogico
        WHERE id_personal = ?
      `, [id_personal]);
      comments = comments.concat(commentsData.map(c => c.comentario_servicio));
    } else {
      return res.status(400).json({ success: false, message: 'Tipo de evaluación no soportado' });
    }

    // Calcular promedios por criterio
    const criteria = questions.map((q, index) => {
      let sumPctSi = 0;
      subjects.forEach(s => sumPctSi += parseFloat(s.criteria[index]?.pctSi || 0));
      const promedio = subjects.length ? (sumPctSi / subjects.length).toFixed(2) : 0;
      return { no: index + 1, criterio: q.nombre_pregunta, promedio };
    });

    const generalAverage = subjects.length
      ? (subjects.reduce((sum, s) => sum + parseFloat(s.avgSi), 0) / subjects.length).toFixed(2)
      : 0;

    res.json({ teacherName, isMultiple, subjects, criteria, generalAverage, comments });
  } catch (error) {
    console.error('Error al obtener resultados de evaluaciones:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener resultados', error: error.message });
  }
});

//FIN RUTAS DE RESULTADOS

// HACER CIERRE DE CICLO
router.post('/guardarDatosCiclo', authMiddleware, async (req, res) => {
  const { ciclo } = req.body;

  // Lista de tablas a respaldar
  const tablas = [
    'Resultado_Kpi',
    'Personal_Nivel_Ingles',
    'Alumno_Nivel_Ingles',
    'Alumno_Materia',
    'Grupo_Materia',
    'Alumno_Taller',
    'Alumno_Arte_Especialidad',
    'Respuesta_Alumno_Docente',
    'Respuesta_Alumno_Docente_Ingles',
    'Respuesta_Alumno_Docente_Arte',
    'Respuesta_Alumno_Servicio',
    'Respuesta_Alumno_Taller',
    'Respuesta_Alumno_Counselor',
    'Respuesta_Personal',
    'Respuesta_Alumno_Psicopedagogico',
    'Comentario_Docente',
    'Comentario_Docente_Ingles',
    'Comentario_Docente_Arte',
    'Comentario_Servicio',
    'Comentario_Taller',
    'Comentario_Counselor',
    'Comentario_Personal',
    'Comentario_Psicopedagogico'
  ];

  try {
    for (const tabla of tablas) {
      const historico = `${tabla}_Historico`;

      // Respaldar datos
      const insertQuery = `
        INSERT INTO ${historico}
        SELECT *, ? AS ciclo, NOW() AS fecha_respaldo
        FROM ${tabla};
      `;
      await db.query(insertQuery, [ciclo]);

      // Vaciar tabla original
      await db.query(`TRUNCATE TABLE ${tabla}`);
    }

    const query = 'SELECT ';

    res.json({ success: true, message: 'Ciclo cerrado correctamente!' });

  } catch (error) {
    console.error('Error al cerrar ciclo:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor. Intenta más tarde' });
  }
});

// Alumno: Se pasa de grupo
// Alumno_Taller: Cuando el alumno sale de 6to se elimina
// Alumno_Arte_Especialidad: Cuando pasen a 4to se eliminan


//RUTA PARA PRUEBA NADAMÁS
router.get('/debug', (req, res) => {
  res.send('Rutas funcionando');
});


module.exports = router;

