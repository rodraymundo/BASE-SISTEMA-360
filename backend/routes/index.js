  const express = require('express');
  const router = express.Router();
  const path = require('path');
  const db = require('../config/db'); // Asegúrate de que esta importación sea correcta
  const authMiddleware = require('../middleware/auth');
  const bcrypt = require('bcryptjs');
  const { permisoMiddleware } = require('../middleware/permisosMiddleware'); 
  const { bloquearAlumnos } = require('../middleware/bloquearAlumnosMiddleware'); // Middleware para bloquear 
  const { SoloPrimerosTresGrados } = require('../middleware/elecciontaller'); // Middleware para permitir solo a 1º, 2º y 3º
  const permitirRoles = require('../middleware/roles');
  const multer = require('multer');
  const streamifier = require('streamifier');
  const cloudinary = require('cloudinary').v2;

  
// Configura Cloudinary con variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Guardar en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

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
    const user = req.session.user;

    if (!user || user.userType !== 'alumno') {
      return res.status(403).send('Acceso denegado');
    }

    // Si ya tiene ambos registrados, no debe ver la pantalla
    if (user.tieneArte && user.tieneTaller) {
      return res.redirect('/Dashboard');
    }

    // Si le falta alguno, puede entrar a la vista combinada
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

  router.get('/Mis-Evaluaciones-Dir-General', bloquearAlumnos, authMiddleware, (req, res)  => {
    res.sendFile(path.join(__dirname, '../../public/html/Evaluaciones360.html'));
  });

  router.get('/Historico-Evaluaciones', authMiddleware, bloquearAlumnos, permitirRoles('Director General', 'Fundador'), (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/Historico-Evaluaciones.html'));
  });

  router.get('/Gestion-Personal-Resultados', authMiddleware, bloquearAlumnos, permitirRoles('Director General', 'Fundador'), (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/Gestion-Personal-Resultados.html'));
  });

  router.get('/Gestion-Permisos', authMiddleware, bloquearAlumnos, permitirRoles('Director General', 'Fundador'), (req, res) => {
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
    try {
      // Si la sesión ya tiene token, usa ese
      if (!req.session.csrfToken) {
        req.session.csrfToken = req.csrfToken();
      }
      res.json({ csrfToken: req.session.csrfToken });
    } catch (err) {
      console.error('Error generando CSRF token:', err);
      res.status(500).json({ csrfToken: null });
    }
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
      const [alumno] = await db.query(`
      SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, 
            a.id_personal, a.id_grado_grupo, g.grado, g.grupo
      FROM Alumno a
      JOIN Grado_Grupo g ON a.id_grado_grupo = g.id_grado_grupo
      WHERE a.id_usuario = ?`, [user.id_usuario]);
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
          [user.id_usuario] 
        );
        const permisos = permisosRows[0] || {};


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

          // 🔹 Verificar si ya tiene arte
          const [arteRows] = await db.query(
            'SELECT COUNT(*) AS cnt FROM Alumno_Arte_Especialidad WHERE id_alumno = ?',
            [id_alumno]
          );
          const tieneArte = arteRows[0].cnt > 0;

          // 🔹 Verificar si ya tiene taller
          const [tallerRows] = await db.query(
            'SELECT COUNT(*) AS cnt FROM Alumno_Taller WHERE id_alumno = ?',
            [id_alumno]
          );
          const tieneTaller = tallerRows[0].cnt > 0;

          req.session.user = {
            id_usuario: user.id_usuario,
            email: user.correo_usuario,
            userType,
            id_alumno,
            nombre_completo,
            id_personal,
            id_grado_grupo: alumno[0].id_grado_grupo,
            grado: alumno[0].grado,
            grupo: alumno[0].grupo,
            tieneArte,
            tieneTaller
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

  router.get('/mi-alumno', async (req, res) => {
  // Verificamos que el usuario esté autenticado y sea alumno
  if (!req.session.user || req.session.user.userType !== 'alumno') {
    return res.status(401).json({ success: false, message: 'No autorizado' });
  }

  try {
    // Tomamos los datos que ya guardaste en la sesión
    const alumno = {
      id_alumno: req.session.user.id_alumno,
      nombre_completo: req.session.user.nombre_completo,
      grado: req.session.user.grado,
      grupo: req.session.user.grupo,
      id_grado_grupo: req.session.user.id_grado_grupo,
      tieneArte: req.session.user.tieneArte,
      tieneTaller: req.session.user.tieneTaller
    };

    res.json({ success: true, alumno });
  } catch (error) {
    console.error('Error en /mi-alumno:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});


  //CERRAR SESIÓN
  router.post('/logout', (req, res) => {
    req.session = null; // borra toda la sesión
    res.json({ success: true, redirect: '/' });
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
        LEFT JOIN Grado_Grupo gg ON gg.id_grado_grupo = a.id_grado_grupo
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
          MAX(gm.id_materia) AS id_materia
        FROM Personal_Arte_Especialidad pa
        JOIN Arte_Especialidad a ON a.id_arte_especialidad = pa.id_arte_especialidad
        LEFT JOIN Personal p ON p.id_personal = pa.id_personal
        LEFT JOIN Grupo_Materia gm 
          ON gm.id_personal = pa.id_personal 
          AND gm.id_grado_grupo = pa.id_grado_grupo
        WHERE pa.id_grado_grupo = '15'
        GROUP BY a.id_arte_especialidad, pa.id_personal, a.nombre_arte_especialidad, p.nombre_personal, p.apaterno_personal
        ORDER BY a.nombre_arte_especialidad;
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
        const [profesores] = await connection.query(`SELECT id_personal FROM Personal_Taller WHERE id_taller = ?`, [id_taller]);

        let id_personal = null;
        if (profesores.length > 0) {
          // Contador global por taller (puede ser un campo en memoria o simple random si quieres)
          // Aquí simplemente asignamos el profesor con menos alumnos
          const [conteos] = await connection.query(`
            SELECT p.id_personal, COUNT(at.id_alumno) AS total
            FROM Personal_Taller p
            LEFT JOIN Alumno_Taller at 
              ON p.id_personal = at.id_personal AND at.id_taller = ?
            WHERE p.id_taller = ?
            GROUP BY p.id_personal
            ORDER BY total ASC
          `, [id_taller, id_taller]);


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

  // DELETE lógico de un taller (marcar como inactivo)
  router.delete('/talleres/:id_taller', authMiddleware, async (req, res) => {
    const { id_taller } = req.params;

    try {
      // Solo marcar como inactivo
      await db.query(
        'UPDATE Taller SET estado = 0 WHERE id_taller = ?',
        [id_taller]
      );

      // También puedes opcionalmente desasignar a los alumnos y profesores
      await db.query('DELETE FROM Alumno_Taller WHERE id_taller = ?', [id_taller]);
      await db.query('DELETE FROM Personal_Taller WHERE id_taller = ?', [id_taller]);

      res.json({
        success: true,
        message: 'Taller marcado como inactivo y relaciones eliminadas.'
      });
    } catch (error) {
      console.error('Error al desactivar taller:', error);
      res.status(500).json({
        success: false,
        message: 'Error al desactivar taller.'
      });
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
          p_evaluado.id_personal,
          p_evaluado.nombre_personal,
          p_evaluado.apaterno_personal,
          p_evaluado.amaterno_personal,
          pu_eval.id_puesto,
          pu_eval.nombre_puesto,
          k.id_kpi,
          k.nombre_kpi,
          c.id_categoria_kpi,
          c.nombre_categoria_kpi,
          pc.porcentaje_categoria,
          k.meta_kpi,
          k.tipo_kpi,
          ek.id_evaluador AS asignado_evaluador_id,
          rk.resultado_kpi
        FROM Personal pevaluador

        -- obtenemos el id_evaluador que corresponde al usuario en sesión: (REQUIRED)
        INNER JOIN Evaluador ev ON ev.id_personal = pevaluador.id_personal

        -- roles del puesto del evaluador -> KPIs por rol
        JOIN Puesto_Rol pr ON pr.id_puesto = pevaluador.id_puesto
        JOIN Kpi k ON k.id_rol = pr.id_rol

        JOIN Categoria_Kpi c ON c.id_categoria_kpi = k.id_categoria_kpi
        JOIN Puesto_Kpi pk ON pk.id_kpi = k.id_kpi
        JOIN Puesto pu_eval ON pu_eval.id_puesto = pk.id_puesto
        JOIN Personal p_evaluado ON p_evaluado.id_puesto = pu_eval.id_puesto
        JOIN Puesto_Categoria pc ON pc.id_puesto = pu_eval.id_puesto AND pc.id_categoria_kpi = c.id_categoria_kpi

        -- SOLO KPIs **asignados explícitamente** al evaluador (ek debe existir)
        INNER JOIN Evaluador_Kpi ek
          ON ek.id_kpi = k.id_kpi
        AND ek.id_personal = p_evaluado.id_personal
        AND ek.id_evaluador = ev.id_evaluador

        -- resultado si ya lo dejó este evaluador (puede ser NULL)
        LEFT JOIN Resultado_Kpi rk
          ON rk.id_personal = p_evaluado.id_personal
        AND rk.id_kpi = k.id_kpi
        AND rk.id_evaluador = ev.id_evaluador

        WHERE pevaluador.id_personal = ?
          AND p_evaluado.id_personal <> pevaluador.id_personal

        -- ordenar
        ORDER BY p_evaluado.nombre_personal, c.id_categoria_kpi, k.id_kpi;
      `, [id_personal]);

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
            id_categoria_kpi: row.id_categoria_kpi,
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
          resultado_kpi: row.resultado_kpi || null,
          asignado_evaluador_id: row.asignado_evaluador_id || null,
          asignado_a_mi: !!row.asignado_evaluador_id
        });

        return acc;
      }, {});

      const evaluadorNombre = evaluador.length
        ? `${evaluador[0].nombre_personal} ${evaluador[0].apaterno_personal} ${evaluador[0].amaterno_personal || ''}`.trim()
        : '';

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
        FROM Grado_Grupo gg 
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

 // OBTENER ALUMNOS POR GRUPO
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
      JOIN Grado_Grupo g ON a.id_grado_grupo = g.id_grado_grupo
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
      ORDER BY
        COALESCE(MAX(a.apaterno_alumno), '') COLLATE utf8mb4_unicode_ci ASC,
        COALESCE(MAX(a.amaterno_alumno), '') COLLATE utf8mb4_unicode_ci ASC,
        COALESCE(MAX(a.nombre_alumno), '') COLLATE utf8mb4_unicode_ci ASC
    `, [id_grado_grupo]);

    console.log('Alumnos por grupo (ordenados):', alumnos.map(a => `${a.apaterno_alumno || ''} ${a.amaterno_alumno || ''}, ${a.nombre_alumno || ''}`));
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
        INSERT INTO Personal_Taller (id_personal, id_taller)
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
        JOIN Grado_Grupo g ON a.id_grado_grupo = g.id_grado_grupo
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
            SELECT id_personal FROM Personal_Taller
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
        'SELECT id_grado_grupo, grado, grupo FROM Grado_Grupo WHERE grado = ? ORDER BY grupo',
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
        LEFT JOIN Grado_Grupo g ON a.id_grado_grupo = g.id_grado_grupo
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
          SELECT id_personal FROM Personal_Taller WHERE id_taller = ?
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
        `SELECT grado FROM Grado_Grupo WHERE id_grado_grupo = ? LIMIT 1`, 
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
        JOIN Grado_Grupo g ON a.id_grado_grupo = g.id_grado_grupo
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
      const [rows] = await db.query('SELECT DISTINCT grado FROM Grado_Grupo ORDER BY grado');
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
      const [rows] = await db.query('SELECT id_grado_grupo, grupo FROM Grado_Grupo WHERE grado = ?', [grado]);
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
      JOIN Grado_Grupo g ON a.id_grado_grupo = g.id_grado_grupo
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
        JOIN Grado_Grupo g ON a.id_grado_grupo = g.id_grado_grupo
      `);

      // Obtener todos los grupos posibles
      const [todosGrupos] = await db.query(`
        SELECT id_grado_grupo, CAST(grado AS UNSIGNED) AS grado, UPPER(grupo) AS grupo
        FROM Grado_Grupo
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

// OBTENER TODOS LAS DISCIPLINAS DEPORTIVAS PARA LA LOMA
router.get('/getDisciplinasDeportivas', authMiddleware, async (req, res) => {
  const query = 'SELECT dd.id_disciplina_deportiva, dd.nombre_disciplina_deportiva FROM Disciplina_Deportiva dd '; // OBTENER LAS DISCIPLINAS DEPORTIVAS

  try {
    const [disciplinasDeportivas] = await db.query(query);
    res.json({ success: true, disciplinasDeportivas});
  } catch (error) {
    console.error('Error al obtener disciplinas deportivas:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// OBTENER TODOS LAS LIGAS DEPORTIVAS PARA LIGAS DEPORTIVAS
router.get('/getLigasDeportivas', authMiddleware, async (req, res) => {
  const query = 'SELECT ld.id_liga_deportiva, ld.nombre_liga_deportiva FROM Liga_Deportiva ld'; // OBTENER LAS DISCIPLINAS DEPORTIVAS

  try {
    const [ligasDeportivas] = await db.query(query);
    res.json({ success: true, ligasDeportivas});
  } catch (error) {
    console.error('Error al obtener disciplinas deportivas:', error);
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

// GUARDAR RESPUESTA A SERVICIO DE LA LOMA POR PARTE DE ALUMNOS 
router.post('/postRespuestasServicioLoma', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 
  const {id_servicio,respuestas,comentarios} = req.body;
  let valoresRespuestas = [];
  let valoresComentarios = [];
  let query = '';
  let query2 = '';
  let query3 = '';

  //  NO SE OCUPA HACER EL RESPUESTAS!=NULL PARA HACER LO DE NO SE UTILIZO PUES ESO YA LO HACE LA RUTA postRespuestasServicioLoma QUE ES LA QUE SE OCUPA PARA ESE BOTON
  valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_alumno,
    respuesta.id_disciplina_deportiva,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_alumno,
    comentario.id_disciplina_deportiva,
    comentario.tipo_comentario,
    comentario.comentario_servicio
  ]);
  query = "INSERT INTO Respuesta_Alumno_Disciplina_Deportiva (id_alumno, id_disciplina_deportiva, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
  query2 = "INSERT INTO Comentario_Disciplina_Deportiva (id_alumno, id_disciplina_deportiva, tipo_comentario, comentario_servicio) VALUES ?";  // AGREGAR EL COMENTARIO
  query3 = "UPDATE Alumno_Servicio set estado_evaluacion_servicio=1 WHERE id_alumno=? AND id_servicio=?" // ACTUALIZAR EL ESTADO DE EVALUACION

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

// GUARDAR RESPUESTA A SERVICIO DE LA LOMA POR PARTE DE ALUMNOS 
router.post('/postRespuestasServicioLigasDeportivas', authMiddleware, async (req, res) => {
  const id_alumno = req.session.user.id_alumno; // SE AGREGO A LA SESSION DE USUARIO AL INICIAR SESION 
  const {id_servicio,respuestas,comentarios} = req.body;
  let valoresRespuestas = [];
  let valoresComentarios = [];
  let query = '';
  let query2 = '';
  let query3 = '';

  //  NO SE OCUPA HACER EL RESPUESTAS!=NULL PARA HACER LO DE NO SE UTILIZO PUES ESO YA LO HACE LA RUTA postRespuestasServicioLoma QUE ES LA QUE SE OCUPA PARA ESE BOTON
  valoresRespuestas = respuestas.map(respuesta => [ // AGREGAR TODOS LOS VALORES DE LAS PTEGUNTAS NECESARIOS EN EL INSERT
    id_alumno,
    respuesta.id_liga_deportiva,
    respuesta.id_pregunta,
    respuesta.id_respuesta
  ]);
  valoresComentarios = comentarios.map(comentario => [ // AGREGAR TODOS LOS VALORES DE LAS COMENTARIOS NECESARIOS EN EL INSERT
    id_alumno,
    comentario.id_liga_deportiva,
    comentario.tipo_comentario,
    comentario.comentario_servicio
  ]);
  query = "INSERT INTO Respuesta_Alumno_Liga_Deportiva (id_alumno, id_liga_deportiva, id_pregunta, id_respuesta) VALUES ?"; // AGREGAR LA RESPUESTA DE LA PREGUNTA
  query2 = "INSERT INTO Comentario_Liga_Deportiva (id_alumno, id_liga_deportiva, tipo_comentario, comentario_servicio) VALUES ?";  // AGREGAR EL COMENTARIO
  query3 = "UPDATE Alumno_Servicio set estado_evaluacion_servicio=1 WHERE id_alumno=? AND id_servicio=?" // ACTUALIZAR EL ESTADO DE EVALUACION
  
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
  console.log('iialum',id_alumno);
  const query = "SELECT t.id_taller, t.nombre_taller, t.img_taller, ta.estado_evaluacion_taller, p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal FROM Taller t, Alumno_Taller ta, Personal p WHERE p.id_personal=ta.id_personal AND ta.id_taller=ta.id_taller AND t.id_taller=ta.id_taller AND ta.id_alumno=?"; // OBTENER LOS TALLERES A LOS QUE ESTA INSCRITO
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
    const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM Pregunta p, Respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=9"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
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
    const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM Pregunta p, Respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=2"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
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
    const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM Pregunta p, Respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=1"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
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
    const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM Pregunta p, Respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=3"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
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

    const query = "SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, pp.estado_evaluacion_par, pp.id_evaluador, pu.nombre_puesto FROM Personal p, Personal_Par pp, Puesto pu WHERE p.id_personal=pp.id_personal AND p.id_puesto=pu.id_puesto AND p.id_personal<>pp.id_evaluador AND pp.id_evaluador=?"; // OBTENER PARES A EVALUAR
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
    const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM Pregunta p, Respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=6"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
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
    const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM Pregunta p, Respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=5"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
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
    const tipo_pregunta = 5; // EL TIPO DE PREGUNTA DE 360
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
    const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM Pregunta p, Respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=7"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
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
    const tipo_pregunta = 7; // EL TIPO DE PREGUNTA DE JEFE
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
    const query2 = "SELECT p.id_pregunta, r.id_respuesta, r.nombre_respuesta FROM Pregunta p, Respuesta r WHERE p.id_grupo_respuesta=r.id_grupo_respuesta AND id_tipo_pregunta=4"; // OBTENER LAS RESPUESTAS A LAS PREGUNTAS
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
    const tipo_pregunta = 4; // EL TIPO DE PREGUNTA DE SUBORDINADO
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
              p.img_personal AS foto_url, 
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
              p.img_personal AS foto_url, 
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
    const {
      nombre,
      apaterno,
      amaterno,
      fecha_nacimiento,
      telefono,
      estado,      // opcional desde frontend (puede venir undefined)
      id_puesto,
      correo,
      contrasena
    } = req.body;

    console.log('Datos recibidos para personal:', { nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado, id_puesto, correo, contrasena });

    let connection;
    try {
      // Validaciones mínimas
      if (!nombre || !apaterno || !correo) {
        return res.status(400).json({ success: false, message: 'Faltan datos obligatorios (nombre, apellidos, correo o contraseña).' });
      }

      // Normalizar/decidir valor de estado para almacenar en BD (default = activo)
      const estado_personal = (typeof estado === 'undefined' || estado === null || estado === '')
        ? 1
        : (String(estado).toLowerCase() === 'activo' || String(estado) === '1' || String(estado).toLowerCase() === 'true' ? 1 : 0);

      connection = await db.getConnection();
      await connection.beginTransaction();

      // Validate id_puesto exists and is numeric
      if (!id_puesto || isNaN(parseInt(id_puesto, 10))) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Puesto inválido' });
      }
      const [puestoRows] = await connection.query('SELECT id_puesto FROM Puesto WHERE id_puesto = ?', [id_puesto]);
      if (!puestoRows || puestoRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'El puesto seleccionado no existe' });
      }

      // Verificar que no exista ya el correo en Usuario
      const [correoExistente] = await connection.query('SELECT 1 FROM Usuario WHERE correo_usuario = ?', [correo]);
      if (correoExistente.length > 0) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Ya existe un usuario con ese correo.' });
      }

      // Si no se envió contraseña, generar una por defecto.
      let generatedPassword = null;
      let plainPasswordToHash = contrasena && String(contrasena).trim() !== '' ? contrasena : null;
      if (!plainPasswordToHash) {
        // Intentar crear una password basada en la parte local del correo
        const local = (correo && correo.split && correo.split('@')[0]) ? correo.split('@')[0] : null;
        if (local) {
          // ejemplo: pass<usuario>
          generatedPassword = `pass${local}`.slice(0, 60); // límite por si el local es muy largo
        } else {
          // fallback: aleatoria
          const rnd = () => Math.random().toString(36).slice(2, 10);
          generatedPassword = `p${rnd()}`;
        }
        plainPasswordToHash = generatedPassword;
      }

      // Hash de la contraseña
      const hashed = await bcrypt.hash(plainPasswordToHash, 10);

      // Insert Usuario (dejar que la BD asigne id_usuario si es AUTO_INCREMENT)
      const [userResult] = await connection.query(
        'INSERT INTO Usuario (correo_usuario, contraseña_usuario) VALUES (?, ?)',
        [correo, hashed]
      );
      const id_usuario = userResult.insertId;


      // Insert personal con estado_personal normalizado
      const [personalResult] = await connection.query(
        `INSERT INTO Personal
          (nombre_personal, apaterno_personal, amaterno_personal, fecha_nacimiento_personal, telefono_personal, estado_personal, id_puesto, id_usuario)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado_personal, id_puesto, id_usuario]
      );
      const id_personal = personalResult.insertId;

      // Insert Evaluador
      const [evaluadorResult] = await connection.query('INSERT INTO Evaluador (id_personal) VALUES (?)', [id_personal]);
      const id_evaluador = evaluadorResult.insertId;

      // Personal_360: seleccionar 5 aleatorios excluyendo al nuevo (misma lógica tuya)
      const count = 5;
      const [personals] = await connection.query('SELECT id_personal FROM Personal WHERE id_personal != ?', [id_personal]);
      const availableIds = (personals || []).map(p => p.id_personal);
      if (availableIds.length < count) {
        // Mantengo tu comportamiento: rollback y error si no hay suficientes
        await connection.rollback();
        return res.status(400).json({ success: false, message: `No hay suficientes personas disponibles para seleccionar ${count}. Solo hay ${availableIds.length}.` });
      }
      // Shuffle (Fisher–Yates) y tomar los primeros `count`
      for (let i = availableIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
      }
      const randomPersonalIds = availableIds.slice(0, count);
      console.log('Personas seleccionadas para Personal_360:', randomPersonalIds);

      await Promise.all(randomPersonalIds.map(id_personal_evaluado =>
        connection.query(
          'INSERT INTO Personal_360 (id_evaluador, id_personal, estado_evaluacion_360) VALUES (?, ?, 0)',
          [id_evaluador, id_personal_evaluado]
        )
      ));

      // Obtener roles asociados al puesto
      const [rolesRows] = await connection.query('SELECT id_rol FROM Puesto_Rol WHERE id_puesto = ?', [id_puesto]);
      const roleIds = (rolesRows || []).map(r => r.id_rol);

      // Personal_Jefe (buscar jefes según Jerarquia)
      if (roleIds.length > 0) {
        const [jerarquia] = await connection.query('SELECT id_rol, id_jefe FROM Jerarquia WHERE id_rol IN (?)', [roleIds]);
        const bossRoleIds = (jerarquia || []).map(j => j.id_jefe).filter(id => id !== null);

        if (bossRoleIds.length > 0) {
          const [bossPersonals] = await connection.query(`
            SELECT DISTINCT p.id_personal
            FROM Personal p
            JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
            WHERE pr.id_rol IN (?) AND p.id_personal != ?
          `, [bossRoleIds, id_personal]);

          await Promise.all(bossPersonals.map(async ({ id_personal: bossId }) => {
            await connection.query(
              'INSERT INTO Personal_Jefe (id_evaluador, id_personal, estado_evaluacion_jefe) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_jefe = 0',
              [id_evaluador, bossId]
            );
          }));
        }
      }

      // Personal_Subordinado (buscar subordinates según Jerarquia)
      if (roleIds.length > 0) {
        const [subordinateRoles] = await connection.query('SELECT id_rol FROM Jerarquia WHERE id_jefe IN (?)', [roleIds]);
        const subordinateRoleIds = (subordinateRoles || []).map(r => r.id_rol);

        if (subordinateRoleIds.length > 0) {
          const [subordinatePersonals] = await connection.query(`
            SELECT DISTINCT p.id_personal
            FROM Personal p
            JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
            WHERE pr.id_rol IN (?) AND p.id_personal != ?
          `, [subordinateRoleIds, id_personal]);

          await Promise.all(subordinatePersonals.map(async ({ id_personal: subordinateId }) => {
            await connection.query(
              'INSERT INTO Personal_Subordinado (id_evaluador, id_personal, estado_evaluacion_subordinado) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_subordinado = 0',
              [id_evaluador, subordinateId]
            );
          }));
        }
      }

      // Personal_Par (pares - hasta 5 aleatorios con roles iguales)
      if (roleIds.length > 0) {
        const [peerPersonals] = await connection.query(`
          SELECT DISTINCT p.id_personal
          FROM Personal p
          JOIN Puesto_Rol pr ON p.id_puesto = pr.id_puesto
          WHERE pr.id_rol IN (?) AND p.id_personal != ?
        `, [roleIds, id_personal]);

        const peerIds = (peerPersonals || []).map(p => p.id_personal);
        const maxPeers = 5;
        let selectedPeerIds = peerIds;
        if (peerIds.length > maxPeers) {
          for (let i = peerIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [peerIds[i], peerIds[j]] = [peerIds[j], peerIds[i]];
          }
          selectedPeerIds = peerIds.slice(0, maxPeers);
        }
        console.log('Pares seleccionados para Personal_Par:', selectedPeerIds);

        await Promise.all(selectedPeerIds.map(async peerId =>
          connection.query(
            'INSERT INTO Personal_Par (id_evaluador, id_personal, estado_evaluacion_par) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE estado_evaluacion_par = 0',
            [id_evaluador, peerId]
          )
        ));
      }

      await connection.commit();
      return res.json({ success: true, message: 'Personal agregado exitosamente', id_personal });
    } catch (error) {
      console.error('Error al agregar personal:', error);
      if (connection) {
        try { await connection.rollback(); } catch (rbErr) { console.error('Rollback error', rbErr); }
      }
      return res.status(500).json({ success: false, message: `Error interno al agregar personal: ${error.message}` });
    } finally {
      if (connection) {
        try { connection.release(); } catch (relErr) { console.error('Release connection error', relErr); }
      }
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
      // 1) Obtener talleres activos y número de alumnos
      const [tallerRows] = await db.query(`
        SELECT t.id_taller, t.nombre_taller, COUNT(at.id_alumno) AS num_alumnos
        FROM Taller t
        LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller
        WHERE t.estado_taller = 1
        GROUP BY t.id_taller, t.nombre_taller
        ORDER BY t.nombre_taller
      `);

      const tallerIds = tallerRows.map(r => r.id_taller);
      if (tallerIds.length === 0) {
        return res.json({ success: true, talleres: [] });
      }

      // 2) Obtener todos los instructores para esos talleres activos
      const [instrRows] = await db.query(`
        SELECT pt.id_taller, p.id_personal, CONCAT(p.nombre_personal, ' ', p.apaterno_personal) AS nombre_personal
        FROM Personal_Taller pt
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
        LEFT JOIN Personal_Taller pt ON t.id_taller = pt.id_taller
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
        JOIN Grado_Grupo g ON a.id_grado_grupo = g.id_grado_grupo
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

      if (req.body.id_taller) {
          return res.status(400).json({ success: false, message: 'No se puede especificar un ID para crear un nuevo taller.' });
      }

      if (!nombre_taller) {
          return res.status(400).json({ success: false, message: 'El nombre del taller es obligatorio.' });
      }

      try {
          await db.query('START TRANSACTION');

          // Revisar si el taller ya existe (ignorar mayúsculas/minúsculas y espacios extra)
          const [tallerExistente] = await db.query(
              'SELECT id_taller FROM Taller WHERE LOWER(TRIM(nombre_taller)) = LOWER(TRIM(?))',
              [nombre_taller]
          );

          if (tallerExistente.length > 0) {
              await db.query('ROLLBACK');
              return res.status(400).json({ success: false, message: 'Ya existe un taller con ese nombre.' });
          }

          const nombreMayus = nombre_taller.trim().toUpperCase();

          // Insertar el nuevo taller
          const [result] = await db.query(
              'INSERT INTO Taller (nombre_taller) VALUES (?)',

              [nombreMayus]
          );
          const id_taller = result.insertId;

          // Si se manda un id_personal, validar y asociar
          if (id_personal) {
              const [personalCheck] = await db.query(
                  'SELECT id_personal FROM Personal WHERE id_personal = ?',
                  [id_personal]
              );

              if (personalCheck.length === 0) {
                  await db.query('ROLLBACK');
                  return res.status(400).json({ success: false, message: 'El ID de personal especificado no existe.' });
              }

              await db.query(
                  'INSERT INTO Personal_Taller (id_personal, id_taller) VALUES (?, ?)',
                  [id_personal, id_taller]
              );
          }

          await db.query('COMMIT');

          // Obtener el taller recién creado
          const [newTaller] = await db.query(
              `SELECT t.id_taller, t.nombre_taller, p.id_personal, 
                      CONCAT(p.nombre_personal, " ", COALESCE(p.apaterno_personal, "")) AS profesor
              FROM Taller t
              LEFT JOIN Personal_Taller pt ON t.id_taller = pt.id_taller
              LEFT JOIN Personal p ON pt.id_personal = p.id_personal
              WHERE t.id_taller = ?`,
              [id_taller]
          );

          res.json({ success: true, taller: newTaller[0] });
      } catch (error) {
          await db.query('ROLLBACK');
          console.error('Error al crear taller:', error);
          res.status(500).json({ success: false, message: error.message || 'Error en el servidor.' });
      }
  });


  // Agregar un profesor a un taller
  router.post('/talleres-personal-alumnos/:id_taller/instructor', authMiddleware, async (req, res) => {
    const { id_taller } = req.params;
    const { id_personal } = req.body;

    if (!id_personal) {
      return res.status(400).json({ success: false, message: 'Debes enviar un profesor válido.' });
    }

    try {
      // Verificar que el profesor exista
      const [profCheck] = await db.query('SELECT id_personal FROM Personal WHERE id_personal = ?', [id_personal]);
      if (profCheck.length === 0) {
        return res.status(404).json({ success: false, message: 'El profesor no existe.' });
      }

      // Verificar que ya no esté asignado
      const [exists] = await db.query(
        'SELECT * FROM Personal_Taller WHERE id_personal = ? AND id_taller = ?',
        [id_personal, id_taller]
      );
      if (exists.length > 0) {
        return res.status(400).json({ success: false, message: 'Este profesor ya imparte el taller.' });
      }

      // Insertar en la tabla intermedia
      await db.query(
        'INSERT INTO Personal_Taller (id_personal, id_taller) VALUES (?, ?)',
        [id_personal, id_taller]
      );

      res.json({ success: true, message: 'Profesor agregado al taller correctamente.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Error en el servidor.' });
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
      const [existingPersonal] = await db.query('SELECT id_personal FROM Personal_Taller WHERE id_taller = ?', [id_taller]);
      if (existingPersonal.length > 0) {
        await db.query('UPDATE Personal_Taller SET id_personal = ? WHERE id_taller = ?', [id_personal, id_taller]);
      } else {
        await db.query('INSERT INTO Personal_Taller (id_personal, id_taller) VALUES (?, ?)', [id_personal, id_taller]);
      }

      // Devolver el taller actualizado
      const [updatedTaller] = await db.query(
        'SELECT t.id_taller, t.nombre_taller, p.id_personal, CONCAT(p.nombre_personal, " ", p.apaterno_personal) AS profesor, COUNT(at.id_alumno) AS num_alumnos ' +
        'FROM Taller t ' +
        'LEFT JOIN Personal_Taller pt ON t.id_taller = pt.id_taller ' +
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

  // PUT /talleres-personal-alumnos/:id_taller/instructor
  router.put('/talleres-personal-alumnos/:id_taller/instructor', authMiddleware, async (req, res) => {
    const { id_taller } = req.params;
    const { old_id_personal, new_id_personal, propagate = true } = req.body;

    if (!new_id_personal) return res.status(400).json({ success: false, message: 'Falta new_id_personal' });

    try {
      // 1) comprobar taller
      const [tallerRows] = await db.query('SELECT id_taller FROM Taller WHERE id_taller = ?', [id_taller]);
      if (tallerRows.length === 0) return res.status(404).json({ success: false, message: 'Taller no encontrado' });

      // 2) actualizar o insertar en Personal_Taller
      const [exists] = await db.query('SELECT id_personal FROM Personal_Taller WHERE id_taller = ? AND id_personal = ?', [id_taller, new_id_personal]);
      if (exists.length === 0) {
        // si old_id_personal existe, podemos actualizar ese registro; sino insertamos nuevo
        if (old_id_personal) {
          const [updated] = await db.query('UPDATE Personal_Taller SET id_personal = ? WHERE id_taller = ? AND id_personal = ?', [new_id_personal, id_taller, old_id_personal]);
          if (updated.affectedRows === 0) {
            await db.query('INSERT INTO Personal_Taller (id_personal, id_taller) VALUES (?, ?)', [new_id_personal, id_taller]);
          }
        } else {
          await db.query('INSERT INTO Personal_Taller (id_personal, id_taller) VALUES (?, ?)', [new_id_personal, id_taller]);
        }
      }

      // 3) (opcional) propagar a los alumnos que tenían old_id_personal -> new_id_personal
      if (propagate && old_id_personal) {
        await db.query('UPDATE Alumno_Taller SET id_personal = ? WHERE id_taller = ? AND id_personal = ?', [new_id_personal, id_taller, old_id_personal]);
      }

      // 4) devolver estado actualizado (puedes ajustar la consulta para devolver la info que quieras)
      const [tallerActual] = await db.query(
        `SELECT t.id_taller, t.nombre_taller, p.id_personal, CONCAT(p.nombre_personal, ' ', p.apaterno_personal) AS profesor,
                COUNT(at.id_alumno) AS num_alumnos
        FROM Taller t
        LEFT JOIN Personal_Taller pt ON t.id_taller = pt.id_taller
        LEFT JOIN Personal p ON pt.id_personal = p.id_personal
        LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller
        WHERE t.id_taller = ?
        GROUP BY t.id_taller, t.nombre_taller, p.id_personal, p.nombre_personal, p.apaterno_personal`,
        [id_taller]
      );

      res.json({ success: true, taller: tallerActual[0] });
    } catch (err) {
      console.error('Error reemplazando instructor:', err);
      res.status(500).json({ success: false, message: err.message || 'Error del servidor' });
    }
  });

  // RUTA PARA ELIMINAR UN TALLER
  router.delete('/talleres-personal-alumnos/:id_taller', authMiddleware, async (req, res) => {
    const { id_taller } = req.params;
    try {
      await db.query('DELETE FROM Personal_Taller WHERE id_taller = ?', [id_taller]);
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
        `SELECT 
            t.id_taller, 
            t.nombre_taller, 
            p.id_personal, 
            CONCAT(p.nombre_personal, " ", p.apaterno_personal) AS profesor, 
            COUNT(at.id_alumno) AS num_alumnos
        FROM Taller t
        LEFT JOIN Personal_Taller pt ON t.id_taller = pt.id_taller
        LEFT JOIN Personal p ON pt.id_personal = p.id_personal
        LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller
        WHERE t.estado_taller = 1
          AND (LOWER(t.nombre_taller) LIKE ? 
                OR LOWER(CONCAT(p.nombre_personal, " ", p.apaterno_personal)) LIKE ?)
        GROUP BY t.id_taller, t.nombre_taller, p.id_personal, p.nombre_personal, p.apaterno_personal
        ORDER BY t.nombre_taller`,
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
          const [rows] = await db.query(
            `SELECT 
                t.id_taller, 
                t.nombre_taller,
                p.id_personal,
                p.nombre_personal,
                p.apaterno_personal,
                COUNT(DISTINCT at.id_alumno) AS num_alumnos
            FROM Taller t
            LEFT JOIN Personal_Taller pt ON t.id_taller = pt.id_taller
            LEFT JOIN Personal p ON pt.id_personal = p.id_personal
            LEFT JOIN Alumno_Taller at ON t.id_taller = at.id_taller
            WHERE t.nombre_taller LIKE ? 
                OR p.nombre_personal LIKE ? 
                OR p.apaterno_personal LIKE ?
            GROUP BY t.id_taller, t.nombre_taller, p.id_personal, p.nombre_personal, p.apaterno_personal`,
            [likeTerm, likeTerm, likeTerm]
          );

          // Transformar filas planas en talleres únicos con array de instructores
          const talleresMap = new Map();
          rows.forEach(r => {
              if (!talleresMap.has(r.id_taller)) {
                  talleresMap.set(r.id_taller, {
                      id_taller: r.id_taller,
                      nombre_taller: r.nombre_taller,
                      num_alumnos: r.num_alumnos || 0,
                      instructors: []
                  });
              }
              if (r.id_personal) {
                  talleresMap.get(r.id_taller).instructors.push({
                      id_personal: r.id_personal,
                      nombre_personal: r.nombre_personal,
                      apaterno_personal: r.apaterno_personal
                  });
              }
          });

          const talleres = Array.from(talleresMap.values());
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
              SELECT m.*, a.nombre_academia, gg.grado, gg.grupo, p.nombre_personal, p.apaterno_personal AS profesor, gm.id_grado_grupo, gm.id_personal
              FROM Materia m
              LEFT JOIN Academia a ON m.id_academia = a.id_academia
              LEFT JOIN Grupo_Materia gm ON m.id_materia = gm.id_materia
              LEFT JOIN Grado_Grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
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
                      profesor: `${m.nombre_personal} ${m.profesor || ''}`
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
              SELECT m.*, a.nombre_academia, gg.grado, gg.grupo, p.nombre_personal, p.apaterno_personal AS profesor, gm.id_grado_grupo, gm.id_personal
              FROM Materia m
              LEFT JOIN Academia a ON m.id_academia = a.id_academia
              LEFT JOIN Grupo_Materia gm ON m.id_materia = gm.id_materia
              LEFT JOIN Grado_Grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
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
                      profesor: `${m.nombre_personal} ${m.profesor || ''}`
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
          const { id_materia, id_grado_grupo, id_personal} = req.body;
          await db.query('INSERT INTO Grupo_Materia (id_grado_grupo, id_materia, id_personal) VALUES (?, ?, ?)', [id_grado_grupo, id_materia, id_personal]);
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
          const [grado_grupos] = await db.query('SELECT * FROM Grado_Grupo');
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
          const { id_materia, id_grado_grupo, id_personal} = req.body;
          if (!id_materia || !id_grado_grupo || !id_personal) {
              return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
          }
          await db.query('INSERT INTO Asignaciones (id_materia, id_grado_grupo, id_personal) VALUES (?, ?, ?)', [id_materia, id_grado_grupo, id_personal]);
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
              SELECT gm.id_grado_grupo, gg.grado, gg.grupo, p.nombre_personal AS profesor, p.apaterno_personal, gm.id_personal
              FROM Grupo_Materia gm
              LEFT JOIN Grado_Grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
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

// INICIO RUTAS DASHBOARD DIRECTOR

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

// Reemplaza tu handler /personnel-director por este
router.get('/personnel-director', authMiddleware, async (req, res) => {
    const { role, group, sort } = req.query;
    let baseQuery = `
        SELECT 
            p.id_personal,
            p.nombre_personal,
            p.apaterno_personal,
            p.amaterno_personal,
            p.telefono_personal,
            p.fecha_nacimiento_personal,
            p.img_personal,
            pu.id_puesto,
            pu.nombre_puesto
        FROM Personal p
        JOIN Puesto pu ON p.id_puesto = pu.id_puesto
    `;
    let whereClause = ' WHERE p.estado_personal = 1';
    const queryParams = [];

    if (group) {
        let keyword;
        switch (group.toLowerCase()) {
            case 'profesores': keyword = '%PROF%'; break;
            case 'subdirectores': keyword = '%SUB%'; break;
            case 'coordinadores': keyword = '%COOR%'; break;
            case 'counselors': keyword = '%COUNSELOR%'; break;
            case 'encargados': keyword = '%ENCARGADO%'; break;
            case 'otros':
                whereClause += ` AND pu.nombre_puesto NOT LIKE '%PROF%' 
                                 AND pu.nombre_puesto NOT LIKE '%SUB%' 
                                 AND pu.nombre_puesto NOT LIKE '%COOR%' 
                                 AND pu.nombre_puesto NOT LIKE '%COUNSELOR%' 
                                 AND pu.nombre_puesto NOT LIKE '%ENCARGADO%'`;
                break;
            default:
                return res.status(400).json({ success: false, message: 'Grupo no válido' });
        }
        if (keyword) {
            whereClause += ` AND pu.nombre_puesto LIKE ?`;
            queryParams.push(keyword);
        }
    } else if (role) {
        const roles = role.split(',');
        baseQuery += `
            JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
            JOIN Rol r ON pr.id_rol = r.id_rol
        `;
        whereClause += ` AND r.nombre_rol IN (${roles.map(() => '?').join(',')})`;
        queryParams.push(...roles);
    }

    const finalQuery = baseQuery + whereClause;

    try {
        const [personnelRows] = await db.query(finalQuery, queryParams);
        if (!personnelRows || personnelRows.length === 0) {
            return res.json({ success: true, personnel: [] });
        }

        const puestoIds = [...new Set(personnelRows.map(p => p.id_puesto).filter(Boolean))];
        const personalIds = personnelRows.map(p => p.id_personal);

        // 1) Roles por puesto en lote
        const [rolesRows] = await db.query(
            `SELECT pr.id_puesto, r.nombre_rol
             FROM Puesto_Rol pr
             JOIN Rol r ON pr.id_rol = r.id_rol
             WHERE pr.id_puesto IN (?)`,
            [puestoIds]
        );

        const rolesByPuesto = {};
        (rolesRows || []).forEach(r => {
            rolesByPuesto[r.id_puesto] = rolesByPuesto[r.id_puesto] || [];
            rolesByPuesto[r.id_puesto].push(r.nombre_rol);
        });

        // 2) Materias por personal en lote
        const [subjectsRows] = await db.query(
            `SELECT gm.id_personal, m.nombre_materia
             FROM Grupo_Materia gm
             JOIN Materia m ON gm.id_materia = m.id_materia
             WHERE gm.id_personal IN (?)`,
            [personalIds]
        );

        const subjectsByPersonal = {};
        (subjectsRows || []).forEach(s => {
            subjectsByPersonal[s.id_personal] = subjectsByPersonal[s.id_personal] || [];
            subjectsByPersonal[s.id_personal].push(s.nombre_materia);
        });

        // 3) Evaluaciones: ejecutarlas en paralelo (las queries ya las tienes)
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

        // Build array of promises and run in parallel
        const evalPromises = [];
        for (let i = 0; i < evalQueries.length; i += 2) {
            evalPromises.push(db.query(evalQueries[i], [personalIds, positiveResponses])); // positive
            evalPromises.push(db.query(evalQueries[i + 1], [personalIds])); // total
        }

        const evalResults = await Promise.all(evalPromises); // array of [rows, fields] results
        // Flatten results to rows
        let allEvaluations = [];
        evalResults.forEach(([rows]) => {
            allEvaluations = allEvaluations.concat(rows || []);
        });

        // Aggregate
        const aggregatedEvaluations = {};
        allEvaluations.forEach(evaluation => {
            if (!aggregatedEvaluations[evaluation.id_personal]) aggregatedEvaluations[evaluation.id_personal] = { positive_count: 0, total_count: 0 };
            if (evaluation.positive_count !== undefined) aggregatedEvaluations[evaluation.id_personal].positive_count += evaluation.positive_count || 0;
            if (evaluation.total_count !== undefined) aggregatedEvaluations[evaluation.id_personal].total_count += evaluation.total_count || 0;
        });

        // Compose final result
        const personnelWithDetails = personnelRows.map(p => {
            const evalInfo = aggregatedEvaluations[p.id_personal] || { positive_count: 0, total_count: 0 };
            const percentage = evalInfo.total_count > 0 ? Math.round((evalInfo.positive_count / evalInfo.total_count) * 100) : 0;
            return {
                ...p,
                roles: rolesByPuesto[p.id_puesto] || [],
                subjects: subjectsByPersonal[p.id_personal] || [],
                evaluationPercentage: percentage,
                goalAchievement: Math.floor(Math.random() * 20 + 80) // mock; reemplazar si tienes tabla Metas
            };
        });

        // sorting & slicing
        let sortedPersonnel = personnelWithDetails.sort((a,b) => b.evaluationPercentage - a.evaluationPercentage);
        if (sort === 'top') sortedPersonnel = sortedPersonnel.slice(0,3);
        else if (sort === 'bottom') sortedPersonnel = personnelWithDetails.sort((a,b) => a.evaluationPercentage - b.evaluationPercentage).slice(0,3);
        // 'all' => no slice

        res.json({ success: true, personnel: sortedPersonnel });
    } catch (error) {
        console.error('Error al obtener personal:', {
            message: error.message, stack: error.stack, code: error.code, sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error en el servidor.', error: error.message });
    }
});


router.get('/evaluations-director-full', authMiddleware, async (req, res) => {
    const { ids } = req.query;
    if (!ids) return res.status(400).json({ success: false, message: 'IDs de personal requeridos' });

    // Sanear y convertir a enteros válidos
    const idArray = ids
        .split(',')
        .map(id => parseInt(id))
        .filter(Number.isFinite);

    if (idArray.length === 0) return res.status(400).json({ success: false, message: 'IDs de personal inválidos' });

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
        // Construir promesas para todas las queries (positive y total) y ejecutarlas en paralelo
        const promises = [];
        for (let i = 0; i < queries.length; i += 2) {
            // positive (usa positiveResponses)
            promises.push(db.query(queries[i], [idArray, positiveResponses]));
            // total
            promises.push(db.query(queries[i + 1], [idArray]));
        }

        // results = array de [rows, fields]
        const results = await Promise.all(promises);

        // Aplanar todos los rows
        let allEvaluations = [];
        results.forEach(([rows]) => {
            if (Array.isArray(rows) && rows.length > 0) {
                allEvaluations = allEvaluations.concat(rows);
            }
        });

        // Agregación por id_personal
        const aggregatedEvaluations = {};
        allEvaluations.forEach(evaluation => {
            const pid = evaluation.id_personal;
            if (!aggregatedEvaluations[pid]) {
                aggregatedEvaluations[pid] = { positive_count: 0, total_count: 0 };
            }
            if (evaluation.positive_count !== undefined) {
                aggregatedEvaluations[pid].positive_count += evaluation.positive_count || 0;
            }
            if (evaluation.total_count !== undefined) {
                aggregatedEvaluations[pid].total_count += evaluation.total_count || 0;
            }
        });

        // Construir respuesta en el mismo orden de ids pedidos
        const evaluations = idArray.map(id => {
            const agg = aggregatedEvaluations[id] || { positive_count: 0, total_count: 0 };
            // Asegurar total_count al menos 1 para evitar divisiones por cero en frontend (si así lo quieres)
            const totalCount = Math.max(agg.total_count || 1, 1);
            return {
                id_personal: id,
                positive_count: agg.positive_count || 0,
                total_count: totalCount
            };
        });

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


router.get('/comments-director', authMiddleware, async (req, res) => {
    const { id_personal, type } = req.query;
    if (!id_personal || !type) return res.status(400).json({ success: false, message: 'id_personal y type son requeridos' });

    const isPositive = type === 'positive' ? 1 : 0;
    const queries = [
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cd.comentario_docente as comment 
         FROM Comentario_Docente cd 
         JOIN Alumno a ON cd.id_alumno = a.id_alumno 
         JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE cd.id_personal = ? AND cd.tipo_comentario = ?`,
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cdi.comentario_docente_ingles as comment 
         FROM Comentario_Docente_Ingles cdi 
         JOIN Alumno a ON cdi.id_alumno = a.id_alumno 
         JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE cdi.id_personal = ? AND cdi.tipo_comentario = ?`,
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cda.comentario_docente_arte as comment 
         FROM Comentario_Docente_Arte cda 
         JOIN Alumno a ON cda.id_alumno = a.id_alumno 
         JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE cda.id_personal = ? AND cda.tipo_comentario = ?`,
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, ct.comentario_taller as comment 
         FROM Comentario_Taller ct 
         JOIN Alumno a ON ct.id_alumno = a.id_alumno 
         JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE ct.id_personal = ? AND ct.tipo_comentario = ?`,
        `SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cc.comentario_counselor as comment 
         FROM Comentario_Counselor cc 
         JOIN Alumno a ON cc.id_alumno = a.id_alumno 
         JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
         WHERE cc.id_personal = ? AND cc.tipo_comentario = ?`,
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

router.get('/comments-servicio', authMiddleware, async (req, res) => {
    const { id, type } = req.query;
    if (!id || !type) return res.status(400).json({ success: false, message: 'id y type son requeridos' });

    const isPositive = type === 'positive' ? 1 : 0;
    const query = `
        SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cs.comentario_servicio as comment
        FROM Comentario_Servicio cs
        JOIN Alumno a ON cs.id_alumno = a.id_alumno
        JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo
        WHERE cs.id_servicio = ? AND cs.tipo_comentario = ?
    `;

    try {
        const [results] = await db.query(query, [id, isPositive]);
        const comments = results.map(row => ({
            commenter: `${row.nombre_alumno} ${row.apaterno_alumno} ${row.amaterno_alumno} (Grupo ${row.grupo})`,
            comment: row.comment
        }));
        res.json({ success: true, comments });
    } catch (error) {
        console.error('Error al obtener comentarios de servicio:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error en el servidor.', error: error.message });
    }
});

router.get('/comments-liga-deportiva', authMiddleware, async (req, res) => {
    const { id, type } = req.query;
    if (!id || !type) return res.status(400).json({ success: false, message: 'id y type son requeridos' });

    const isPositive = type === 'positive' ? 1 : 0;
    const query = `
        SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cld.comentario_servicio as comment
        FROM Comentario_Liga_Deportiva cld
        JOIN Alumno a ON cld.id_alumno = a.id_alumno
        JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo
        WHERE cld.id_liga_deportiva = ? AND cld.tipo_comentario = ?
    `;

    try {
        const [results] = await db.query(query, [id, isPositive]);
        const comments = results.map(row => ({
            commenter: `${row.nombre_alumno} ${row.apaterno_alumno} ${row.amaterno_alumno} (Grupo ${row.grupo})`,
            comment: row.comment
        }));
        res.json({ success: true, comments });
    } catch (error) {
        console.error('Error al obtener comentarios de liga deportiva:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error en el servidor.', error: error.message });
    }
});

router.get('/comments-disciplina-deportiva', authMiddleware, async (req, res) => {
    const { id, type } = req.query;
    if (!id || !type) return res.status(400).json({ success: false, message: 'id y type son requeridos' });

    const isPositive = type === 'positive' ? 1 : 0;
    const query = `
        SELECT a.id_alumno, a.nombre_alumno, a.apaterno_alumno, a.amaterno_alumno, gg.grupo, cdd.comentario_servicio as comment
        FROM Comentario_Disciplina_Deportiva cdd
        JOIN Alumno a ON cdd.id_alumno = a.id_alumno
        JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo
        WHERE cdd.id_disciplina_deportiva = ? AND cdd.tipo_comentario = ?
    `;

    try {
        const [results] = await db.query(query, [id, isPositive]);
        const comments = results.map(row => ({
            commenter: `${row.nombre_alumno} ${row.apaterno_alumno} ${row.amaterno_alumno} (Grupo ${row.grupo})`,
            comment: row.comment
        }));
        res.json({ success: true, comments });
    } catch (error) {
        console.error('Error al obtener comentarios de disciplina deportiva:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error en el servidor.', error: error.message });
    }
});

router.get('/personal-dashboard/:id/:type', authMiddleware, async (req, res) => {
    const { id, type } = req.params;
    const idPregunta = req.query.id_tipo_pregunta;
    try {
        const tipoToId = { '360': 5, 'pares': 6, 'jefes': 7, 'subordinado': 4 };
        let query;
        let queryParams;
        switch (type.toLowerCase()) {
            case 'materias':
            case 'artes':
            case 'disciplina_deportiva':
            case 'liga_deportiva':
            case 'psicopedagogico':
                query = `
                    SELECT AVG(id_respuesta) as generalAverage
                    FROM Respuesta_Alumno_Docente
                    WHERE id_personal = ? AND id_pregunta = ?
                `;
                queryParams = [id, idPregunta];
                break;
            case 'ingles':
                query = `
                    SELECT AVG(id_respuesta) as generalAverage
                    FROM Respuesta_Alumno_Docente_Ingles
                    WHERE id_personal = ? AND id_pregunta = ?
                `;
                queryParams = [id, idPregunta];
                break;
            case 'talleres':
                query = `
                    SELECT AVG(id_respuesta) as generalAverage
                    FROM Respuesta_Alumno_Taller
                    WHERE id_personal = ? AND id_pregunta = ?
                `;
                queryParams = [id, idPregunta];
                break;
            case 'counselors':
                query = `
                    SELECT AVG(id_respuesta) as generalAverage
                    FROM Respuesta_Alumno_Counselor
                    WHERE id_personal = ? AND id_pregunta = ?
                `;
                queryParams = [id, idPregunta];
                break;
            case '360':
            case 'pares':
            case 'jefes':
            case 'subordinado':
                query = `
                    SELECT AVG(id_respuesta) as generalAverage
                    FROM Respuesta_Personal
                    WHERE id_personal = ? AND id_pregunta = ? AND id_tipo_pregunta = ?
                `;
                queryParams = [id, idPregunta, tipoToId[type.toLowerCase()]];
                break;
            default:
                console.warn(`[id_personal=${id}, type=${type}] Unsupported evaluation type`);
                return res.json({ generalAverage: '0' });
        }

        const [results] = await db.query(query, queryParams);
        const generalAverage = results[0]?.generalAverage ? (parseFloat(results[0].generalAverage) * 100).toFixed(2) : '0';
        console.log(`[id_personal=${id}, type=${type}, id_pregunta=${idPregunta}, id_tipo_pregunta=${tipoToId[type.toLowerCase()] || 'N/A'}] General average:`, generalAverage);
        res.json({ generalAverage });
    } catch (error) {
        console.error(`[id_personal=${id}, type=${type}] Error fetching evaluation results:`, {
            message: error.message,
            stack: error.stack,
            code: error.code,
            sqlMessage: error.sqlMessage || 'N/A'
        });
        res.status(500).json({ success: false, message: 'Error fetching evaluation results', error: error.message });
    }
});

// FIN RUTAS DASHBOARD DIRECTOR

  //GESTION DE PERMISOS

  // Obtener permisos de un usuario específico
  router.get('/permissions-permisos/:id_usuario', authMiddleware, async (req, res) => {
      const { id_usuario } = req.params;
      try {
          const [rows] = await db.query('SELECT * FROM Permisos WHERE id_usuario = ?', [id_usuario]);
          res.json({ success: true, data: rows.length > 0 ? rows[0] : { id_usuario: parseInt(id_usuario), permiso_materias: 1, permiso_kpis: 0, permiso_grupos: 0, permiso_personal: 0, permiso_talleres: 0, permiso_alumnos: 0 } });
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

// GET /personal-search?q=texto
router.get('/personal-search', authMiddleware, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ personal: [] });

  try {
    const like = `%${q}%`;
    const [rows] = await db.query(
      `SELECT 
         p.id_personal,
         p.id_usuario,
         p.nombre_personal,
         p.apaterno_personal,
         p.amaterno_personal,
         u.correo_usuario AS mail,
         NULL AS matricula
       FROM Personal p
       LEFT JOIN Usuario u ON p.id_usuario = u.id_usuario
       WHERE (CONCAT(p.nombre_personal, ' ', p.apaterno_personal, ' ', IFNULL(p.amaterno_personal,'')) LIKE ?)
         OR (u.correo_usuario LIKE ?)
       AND p.estado_personal = 1
       LIMIT 12`,
      [like, like]
    );

    // Normalizar: si prefieres devolver id_usuario como 'id_usuario' (ya lo hay)
    res.json({ personal: rows });
  } catch (error) {
    console.error('Error in personal-search:', error);
    res.status(500).json({ personal: [] });
  }
});

// GET /personal-by-id/:id  (id can be id_usuario or id_personal — we assume id_usuario here)
router.get('/personal-by-id/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    // Intentamos buscar por id_usuario primero; si no, por id_personal.
    const [rowsByUsuario] = await db.query(
      `SELECT p.id_personal, p.id_usuario, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, u.correo_usuario AS mail
       FROM Personal p
       LEFT JOIN Usuario u ON p.id_usuario = u.id_usuario
       WHERE p.id_usuario = ? LIMIT 1`, [id]
    );

    if (rowsByUsuario.length > 0) {
      return res.json({ personal: rowsByUsuario[0] });
    }

    // Si no encontramos por id_usuario, intentamos por id_personal
    const [rowsByPersonal] = await db.query(
      `SELECT p.id_personal, p.id_usuario, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, u.correo_usuario AS mail
       FROM Personal p
       LEFT JOIN Usuario u ON p.id_usuario = u.id_usuario
       WHERE p.id_personal = ? LIMIT 1`, [id]
    );

    if (rowsByPersonal.length > 0) {
      return res.json({ personal: rowsByPersonal[0] });
    }

    return res.status(404).json({ error: 'No encontrado' });
  } catch (error) {
    console.error('Error in personal-by-id:', error);
    res.status(500).json({ error: 'Error servidor' });
  }
});


//FIN GESTION DE PERMISOS

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

  // GET /puesto-categorias?puesto=17
  router.get('/puesto-categorias', async (req, res) => {
    try {
      const puesto = parseInt(req.query.puesto);
      if (!puesto) return res.status(400).json({ success: false, message: 'Falta parámetro puesto' });

      const [rows] = await db.query(
        `SELECT pc.id_puesto,
                pc.id_categoria_kpi,
                pc.porcentaje_categoria,
                ck.nombre_categoria_kpi
        FROM Puesto_Categoria pc
        JOIN Categoria_Kpi ck ON pc.id_categoria_kpi = ck.id_categoria_kpi
        WHERE pc.id_puesto = ?`,
        [puesto]
      );

      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Error en /puesto-categorias:', err);
      return res.status(500).json({ success: false, message: 'Error interno' });
    }
  });


  // GET /kpis?categoria=3
  // GET /kpis?categoria=3&puesto=17
  router.get('/kpis', async (req, res) => {
    try {
      const categoria = parseInt(req.query.categoria);
      const puesto = req.query.puesto ? parseInt(req.query.puesto) : null;

      if (!categoria) {
        return res.status(400).json({ success: false, message: 'Falta parámetro categoria' });
      }

      let sql, params;
      if (puesto) {
        // Trae sólo KPIs de la categoría que estén vinculados al puesto en Puesto_Kpi
        sql = `
          SELECT k.id_kpi, k.nombre_kpi, k.meta_kpi, k.tipo_kpi, k.id_rol, k.id_categoria_kpi
          FROM Kpi k
          INNER JOIN Puesto_Kpi pk ON pk.id_kpi = k.id_kpi
          WHERE k.id_categoria_kpi = ? AND pk.id_puesto = ?
          ORDER BY k.id_kpi;
        `;
        params = [categoria, puesto];
      } else {
        // fallback: todos los KPIs de la categoría (compatibilidad)
        sql = `
          SELECT id_kpi, nombre_kpi, meta_kpi, tipo_kpi, id_rol, id_categoria_kpi
          FROM Kpi
          WHERE id_categoria_kpi = ?
          ORDER BY id_kpi;
        `;
        params = [categoria];
      }

      const [rows] = await db.query(sql, params);
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error('Error en /kpis:', err);
      return res.status(500).json({ success: false, message: 'Error interno' });
    }
  });


  // GET /evaluador_kpi?personal=25
  router.get('/evaluador_kpi', async (req, res) => {
    try {
      const personal = parseInt(req.query.personal);
      if (!personal) return res.status(400).json({ success: false, message: 'Falta parámetro personal' });

      const [rows] = await db.query(
        `SELECT ek.id_kpi,
                ek.id_evaluador,
                e.id_personal AS evaluador_personal_id,
                CONCAT(p.nombre_personal, ' ', IFNULL(p.apaterno_personal,''), ' ', IFNULL(p.amaterno_personal,'')) AS evaluador_nombre
        FROM Evaluador_Kpi ek
        JOIN Evaluador e ON ek.id_evaluador = e.id_evaluador
        JOIN Personal p ON e.id_personal = p.id_personal
        WHERE ek.id_personal = ?`,
        [personal]
      );

      return res.json(rows);
    } catch (err) {
      console.error('Error en /evaluador_kpi:', err);
      return res.status(500).json({ success: false, message: 'Error interno' });
    }
  });

  // POST /evaluador_kpi
  router.post('/evaluador_kpi', async (req, res) => {
    const { id_kpi, id_personal_target, id_personal_evaluador } = req.body;
    if (!id_kpi || !id_personal_target) return res.status(400).json({ success: false, message: 'Faltan datos' });

    const conn = await db.getConnection(); // 👈 también aquí
    try {
      await conn.beginTransaction();

      if (id_personal_evaluador == null) {
        await conn.query(`DELETE FROM Evaluador_Kpi WHERE id_kpi = ? AND id_personal = ?`, [id_kpi, id_personal_target]);
        await conn.commit();
        return res.json({ success: true, message: 'Asignación eliminada' });
      }

      const [pers] = await conn.query(
        `SELECT id_personal, id_puesto, nombre_personal, apaterno_personal 
        FROM Personal 
        WHERE id_personal = ?`,
        [id_personal_evaluador]
      );

      if (!pers.length) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Persona evaluadora no existe' });
      }

      let [rows] = await conn.query(`SELECT id_evaluador FROM Evaluador WHERE id_personal = ?`, [id_personal_evaluador]);
      let id_evaluador;
      if (rows.length) {
        id_evaluador = rows[0].id_evaluador;
      } else {
        const [ins] = await conn.query(`INSERT INTO Evaluador (id_personal) VALUES (?)`, [id_personal_evaluador]);
        id_evaluador = ins.insertId;
      }

      await conn.query(
        `INSERT INTO Evaluador_Kpi (id_kpi, id_personal, id_evaluador)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE id_evaluador = VALUES(id_evaluador)`,
        [id_kpi, id_personal_target, id_evaluador]
      );

      await conn.commit();
      return res.json({ success: true, message: 'Asignación guardada', data: { id_kpi, id_personal_target, id_personal_evaluador } });
    } catch (err) {
      await conn.rollback();
      console.error('Error en POST /evaluador_kpi:', err);
      return res.status(500).json({ success: false, message: 'Error interno' });
    } finally {
      conn.release();
    }
  });

  // Existing routes (only showing the new route for brevity)
router.get('/puesto-kpi', async (req, res) => {
  try {
    const puesto = parseInt(req.query.puesto);
    if (!puesto) return res.status(400).json({ success: false, message: 'Falta parámetro puesto' });

    const [rows] = await db.query(
      `SELECT id_puesto, id_kpi
       FROM Puesto_Kpi
       WHERE id_puesto = ?`,
      [puesto]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error en /puesto-kpi:', err);
    return res.status(500).json({ success: false, message: 'Error interno' });
  }
});

router.post('/puesto-kpi', async (req, res) => {
  const { id_puesto, id_kpi } = req.body;
  if (!id_puesto || !id_kpi) return res.status(400).json({ success: false, message: 'Faltan datos' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO Puesto_Kpi (id_puesto, id_kpi)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE id_puesto = id_puesto`, // Prevent duplicate entries
      [id_puesto, id_kpi]
    );

    await conn.commit();
    return res.json({ success: true, message: 'KPI asignado al puesto' });
  } catch (err) {
    await conn.rollback();
    console.error('Error en POST /puesto-kpi:', err);
    return res.status(500).json({ success: false, message: 'Error interno' });
  } finally {
    conn.release();
  }
});

router.delete('/puesto-kpi', async (req, res) => {
  const { id_puesto, id_kpi } = req.body;
  if (!id_puesto || !id_kpi) return res.status(400).json({ success: false, message: 'Faltan datos' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `DELETE FROM Puesto_Kpi
       WHERE id_puesto = ? AND id_kpi = ?`,
      [id_puesto, id_kpi]
    );

    await conn.commit();
    return res.json({ success: true, message: 'Asignación de KPI eliminada' });
  } catch (err) {
    await conn.rollback();
    console.error('Error en DELETE /puesto-kpi:', err);
    return res.status(500).json({ success: false, message: 'Error interno' });
  } finally {
    conn.release();
  }
});



  //FIN DE RUTAS DE PERSONAL

  //RUTAS DE KPIS

  // Obtener todos los KPIs
  router.get('/kpis-gestion', authMiddleware, async (req, res) => {
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
        SELECT 
          m.id_materia,
          m.nombre_materia,
          m.modelo_materia,
          m.grado_materia,
          a.nombre_academia,

          -- concatenamos 3 sub-listas: asignaciones "normales", english (Personal_Nivel_Ingles), arte (Personal_Arte_Especialidad)
          TRIM(BOTH '; ' FROM CONCAT_WS('; ',
            (SELECT GROUP_CONCAT(DISTINCT CONCAT(
              p.nombre_personal, ' ', p.apaterno_personal, ' ', IFNULL(p.amaterno_personal,''),
              ' - ',
              (SELECT GROUP_CONCAT(gg2.grupo ORDER BY gg2.grupo SEPARATOR ', ')
                FROM Grupo_Materia gm2
                JOIN Grado_Grupo gg2 ON gm2.id_grado_grupo = gg2.id_grado_grupo
                WHERE gm2.id_personal = gm.id_personal AND gm2.id_materia = gm.id_materia
              ),
              IFNULL(CONCAT(' · ', ni.nombre_nivel_ingles), '')
            ) SEPARATOR '; ')
            FROM Grupo_Materia gm
            JOIN Personal p ON gm.id_personal = p.id_personal
            LEFT JOIN Personal_Nivel_Ingles pni ON pni.id_personal = gm.id_personal AND pni.id_grado_grupo = gm.id_grado_grupo AND pni.id_materia = gm.id_materia
            LEFT JOIN Nivel_Ingles ni ON pni.id_nivel_ingles = ni.id_nivel_ingles
            WHERE gm.id_materia = m.id_materia),

            (SELECT GROUP_CONCAT(DISTINCT CONCAT(
              p.nombre_personal, ' ', p.apaterno_personal, ' ', IFNULL(p.amaterno_personal,''),
              ' (', IFNULL(ni.nombre_nivel_ingles,'NIVEL'), ') - ',
              (SELECT GROUP_CONCAT(gg3.grupo ORDER BY gg3.grupo SEPARATOR ', ')
                FROM Grado_Grupo gg3
                WHERE gg3.id_grado_grupo = pni.id_grado_grupo
              )
            ) SEPARATOR '; ')
            FROM Personal_Nivel_Ingles pni
            JOIN Personal p ON pni.id_personal = p.id_personal
            LEFT JOIN Nivel_Ingles ni ON pni.id_nivel_ingles = ni.id_nivel_ingles
            WHERE pni.id_materia = m.id_materia),

            (SELECT GROUP_CONCAT(DISTINCT CONCAT(
              p.nombre_personal, ' ', p.apaterno_personal, ' ', IFNULL(p.amaterno_personal,''),
              ' (', ae.nombre_arte_especialidad, ') - ',
              (SELECT GROUP_CONCAT(gg4.grupo ORDER BY gg4.grupo SEPARATOR ', ')
                FROM Grado_Grupo gg4
                WHERE gg4.id_grado_grupo = pae.id_grado_grupo
              )
            ) SEPARATOR '; ')
            FROM Personal_Arte_Especialidad pae
            JOIN Personal p ON pae.id_personal = p.id_personal
            JOIN Arte_Especialidad ae ON pae.id_arte_especialidad = ae.id_arte_especialidad
            WHERE pae.id_materia = m.id_materia)
          )) AS profesores_grupos,

          -- ids de grupos (concatena los ids que aparezcan en las 3 tablas)
          TRIM(BOTH ',' FROM CONCAT_WS(',',
            (SELECT GROUP_CONCAT(DISTINCT gm.id_grado_grupo SEPARATOR ',') FROM Grupo_Materia gm WHERE gm.id_materia = m.id_materia),
            (SELECT GROUP_CONCAT(DISTINCT pni.id_grado_grupo SEPARATOR ',') FROM Personal_Nivel_Ingles pni WHERE pni.id_materia = m.id_materia),
            (SELECT GROUP_CONCAT(DISTINCT pae.id_grado_grupo SEPARATOR ',') FROM Personal_Arte_Especialidad pae WHERE pae.id_materia = m.id_materia)
          )) AS grupos_ids

        FROM Materia m
        LEFT JOIN Academia a ON m.id_academia = a.id_academia
        GROUP BY m.id_materia, m.nombre_materia, m.modelo_materia, m.grado_materia, a.nombre_academia
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
  const id_grado_grupo = req.query.grupo || null;

  try {
    const [materia] = await db.query('SELECT nombre_materia, grado_materia FROM Materia WHERE id_materia = ?', [id]);
    if (!materia.length) {
      return res.status(404).json({ success: false, message: 'Materia no encontrada' });
    }

    const query = `
      -- Asignaciones normales (Grupo_Materia)
      SELECT 
        gm.id_personal,
        gm.id_grado_grupo,
        p.nombre_personal,
        p.apaterno_personal,
        p.amaterno_personal,
        gg.grado,
        gg.grupo,
        NULL AS id_nivel_ingles,
        NULL AS nombre_nivel_ingles,
        NULL AS id_arte_especialidad,
        NULL AS nombre_arte_especialidad
      FROM Grupo_Materia gm
      JOIN Personal p ON gm.id_personal = p.id_personal
      JOIN Grado_Grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
      WHERE gm.id_materia = ? ${id_grado_grupo ? 'AND gm.id_grado_grupo = ?' : ''}

      UNION

      -- Asignaciones de inglés (Personal_Nivel_Ingles)
      SELECT 
        pni.id_personal,
        pni.id_grado_grupo,
        p.nombre_personal,
        p.apaterno_personal,
        p.amaterno_personal,
        gg.grado,
        gg.grupo,
        pni.id_nivel_ingles,
        ni.nombre_nivel_ingles,
        NULL AS id_arte_especialidad,
        NULL AS nombre_arte_especialidad
      FROM Personal_Nivel_Ingles pni
      JOIN Personal p ON pni.id_personal = p.id_personal
      JOIN Grado_Grupo gg ON pni.id_grado_grupo = gg.id_grado_grupo
      LEFT JOIN Nivel_Ingles ni ON pni.id_nivel_ingles = ni.id_nivel_ingles
      LEFT JOIN Grupo_Materia gm ON gm.id_materia = pni.id_materia 
        AND gm.id_grado_grupo = pni.id_grado_grupo 
        AND gm.id_personal = pni.id_personal
      WHERE pni.id_materia = ? ${id_grado_grupo ? 'AND pni.id_grado_grupo = ?' : ''}

      UNION

      -- Asignaciones de arte (Personal_Arte_Especialidad)
      SELECT 
        pae.id_personal,
        pae.id_grado_grupo,
        p.nombre_personal,
        p.apaterno_personal,
        p.amaterno_personal,
        gg.grado,
        gg.grupo,
        NULL AS id_nivel_ingles,
        NULL AS nombre_nivel_ingles,
        pae.id_arte_especialidad,
        ae.nombre_arte_especialidad
      FROM Personal_Arte_Especialidad pae
      JOIN Personal p ON pae.id_personal = p.id_personal
      JOIN Grado_Grupo gg ON pae.id_grado_grupo = gg.id_grado_grupo
      JOIN Arte_Especialidad ae ON pae.id_arte_especialidad = ae.id_arte_especialidad
      LEFT JOIN Grupo_Materia gm ON gm.id_materia = pae.id_materia 
        AND gm.id_grado_grupo = pae.id_grado_grupo 
        AND gm.id_personal = pae.id_personal
      WHERE pae.id_materia = ? ${id_grado_grupo ? 'AND pae.id_grado_grupo = ?' : ''}
    `;

    const params = id_grado_grupo 
      ? [id, id_grado_grupo, id, id_grado_grupo, id, id_grado_grupo]
      : [id, id, id];

    const [asignaciones] = await db.query(query, params);

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
      const [gradosGrupos] = await db.query('SELECT id_grado_grupo, grado, grupo FROM Grado_Grupo');
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
  // POST /materias/:id/asignaciones
router.post('/materias/:id/asignaciones', authMiddleware, async (req, res) => {
  const id_materia = req.params.id;
  const {
    id_personal,
    id_grado_grupo,
    id_nivel_ingles,
    id_arte_especialidad,
    horas_materia // opcional: si quieres manejar horas desde el front al crear asignación
  } = req.body;

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // --- validaciones básicas ---
    const [mRows] = await conn.query('SELECT id_materia, nombre_materia, grado_materia FROM Materia WHERE id_materia = ?', [id_materia]);
    if (!mRows.length) {
      await conn.rollback();
      return res.status(404).json({ success:false, message:'Materia no encontrada' });
    }
    const materia = mRows[0];

    const [pRows] = await conn.query('SELECT id_personal FROM Personal WHERE id_personal = ?', [id_personal]);
    if (!pRows.length) {
      await conn.rollback();
      return res.status(400).json({ success:false, message:'Profesor no encontrado' });
    }

    const [gRows] = await conn.query('SELECT id_grado_grupo, grado FROM Grado_Grupo WHERE id_grado_grupo = ?', [id_grado_grupo]);
    if (!gRows.length) {
      await conn.rollback();
      return res.status(400).json({ success:false, message:'Grupo no encontrado' });
    }

    // validar que el grado coincide (si tu negocio lo exige)
    const gradoGrupoNum = Number(gRows[0].grado);
    const gradoMateriaNum = Number(materia.grado_materia);
    if (gradoGrupoNum !== gradoMateriaNum) {
      await conn.rollback();
      return res.status(400).json({
        success:false,
        message: `El grupo seleccionado no pertenece al grado de la materia (Grupo grado: ${gradoGrupoNum}, Materia grado: ${gradoMateriaNum})`
      });
    }

    const isIngles = !!id_nivel_ingles;
    const isArte = !!id_arte_especialidad;

    // --- caso INGLÉS ---
    if (isIngles) {
      // validar nivel
      const [nivRows] = await conn.query('SELECT id_nivel_ingles FROM Nivel_Ingles WHERE id_nivel_ingles = ?', [id_nivel_ingles]);
      if (!nivRows.length) {
        await conn.rollback();
        return res.status(400).json({ success:false, message:'Nivel de inglés no encontrado' });
      }

      // borrar asignación previa para ese nivel+grupo+materia (sea quien sea el profesor)
      await conn.query(
        `DELETE FROM Personal_Nivel_Ingles
         WHERE id_nivel_ingles = ? AND id_grado_grupo = ? AND id_materia = ?`,
        [id_nivel_ingles, id_grado_grupo, id_materia]
      );

      // comprobar si la tabla Personal_Nivel_Ingles tiene columna horas_materia (opcional)
      const [colCheck] = await conn.query("SHOW COLUMNS FROM Personal_Nivel_Ingles LIKE 'horas_materia'");
      if (colCheck.length) {
        await conn.query(
          `INSERT INTO Personal_Nivel_Ingles (id_personal, id_nivel_ingles, id_grado_grupo, id_materia, horas_materia)
           VALUES (?, ?, ?, ?, ?)`,
          [id_personal, id_nivel_ingles, id_grado_grupo, id_materia, (typeof horas_materia !== 'undefined' ? horas_materia : null)]
        );
      } else {
        await conn.query(
          `INSERT INTO Personal_Nivel_Ingles (id_personal, id_nivel_ingles, id_grado_grupo, id_materia)
           VALUES (?, ?, ?, ?)`,
          [id_personal, id_nivel_ingles, id_grado_grupo, id_materia]
        );
      }

      await conn.commit();
      return res.json({ success:true, message:'Asignación de inglés actualizada' });
    }

    // --- caso ARTE ---
    if (isArte) {
      // validar especialidad
      const [artRows] = await conn.query('SELECT id_arte_especialidad FROM Arte_Especialidad WHERE id_arte_especialidad = ?', [id_arte_especialidad]);
      if (!artRows.length) {
        await conn.rollback();
        return res.status(400).json({ success:false, message:'Especialidad de arte no encontrada' });
      }

      // borrar asignación previa para esa especialidad+grupo+materia
      await conn.query(
        `DELETE FROM Personal_Arte_Especialidad
         WHERE id_arte_especialidad = ? AND id_grado_grupo = ? AND id_materia = ?`,
        [id_arte_especialidad, id_grado_grupo, id_materia]
      );

      // comprobar si la tabla Personal_Arte_Especialidad tiene columna horas_materia (opcional)
      const [colCheck] = await conn.query("SHOW COLUMNS FROM Personal_Arte_Especialidad LIKE 'horas_materia'");
      if (colCheck.length) {
        await conn.query(
          `INSERT INTO Personal_Arte_Especialidad (id_personal, id_arte_especialidad, id_grado_grupo, id_materia, horas_materia)
           VALUES (?, ?, ?, ?, ?)`,
          [id_personal, id_arte_especialidad, id_grado_grupo, id_materia, (typeof horas_materia !== 'undefined' ? horas_materia : null)]
        );
      } else {
        await conn.query(
          `INSERT INTO Personal_Arte_Especialidad (id_personal, id_arte_especialidad, id_grado_grupo, id_materia)
           VALUES (?, ?, ?, ?)`,
          [id_personal, id_arte_especialidad, id_grado_grupo, id_materia]
        );
      }

      await conn.commit();
      return res.json({ success:true, message:'Asignación de arte actualizada' });
    }

    // --- caso NORMAL (usar Grupo_Materia) ---
    // si ya existe registro para materia+grupo => actualizar id_personal (y horas si vienen)
    const [gmEx] = await conn.query('SELECT * FROM Grupo_Materia WHERE id_materia = ? AND id_grado_grupo = ?', [id_materia, id_grado_grupo]);
    if (gmEx.length) {
      if (typeof horas_materia !== 'undefined') {
        await conn.query('UPDATE Grupo_Materia SET id_personal = ?, horas_materia = ? WHERE id_materia = ? AND id_grado_grupo = ?', [id_personal, horas_materia, id_materia, id_grado_grupo]);
      } else {
        await conn.query('UPDATE Grupo_Materia SET id_personal = ? WHERE id_materia = ? AND id_grado_grupo = ?', [id_personal, id_materia, id_grado_grupo]);
      }
    } else {
      // insertar; si horas no viene, poner 0 para evitar errores si la columna no admite NULL/DEFAULT
      const hm = (typeof horas_materia !== 'undefined') ? horas_materia : 0;
      await conn.query('INSERT INTO Grupo_Materia (id_materia, id_personal, id_grado_grupo, horas_materia) VALUES (?, ?, ?, ?)', [id_materia, id_personal, id_grado_grupo, hm]);
    }

    await conn.commit();
    return res.json({ success:true, message:'Asignación normal actualizada' });

  } catch (err) {
    console.error('Error al asignar profesor:', err);
    if (conn) await conn.rollback();
    return res.status(500).json({ success:false, message:'Error interno al asignar profesor', error: err.message });
  } finally {
    if (conn) conn.release();
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
        FROM Grado_Grupo
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
            'INSERT IGNORE INTO Grupo_Materia (id_materia, id_personal, id_grado_grupo) VALUES ?',
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
        gg.grupo
      FROM Grupo_Materia gm
      JOIN Materia m ON gm.id_materia = m.id_materia
      JOIN Grado_Grupo gg ON gm.id_grado_grupo = gg.id_grado_grupo
      WHERE gm.id_personal = ?
      ORDER BY m.grado_materia, m.nombre_materia
    `, [id_personal]);

    const [talleres] = await db.query(`
      SELECT t.nombre_taller
      FROM Personal_Taller pt
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
      SELECT COUNT(*) as count FROM Personal_Taller WHERE id_personal = ?
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

router.get('/personal-evaluaciones-results/:idPersonal/:type', async (req, res) => {
  const { idPersonal, type } = req.params;
  const idTipoPregunta = req.query.id_tipo_pregunta;
  const goodIds = [1, 5, 6, 9, 10]; // SÍ, 3-4, >5, BUENO, EXCELENTE

  try {
    if (!idTipoPregunta) {
      return res.status(400).json({ success: false, message: 'id_tipo_pregunta requerido' });
    }

    // Obtener nombre del personal
    const [personal] = await db.query(`
      SELECT CONCAT(nombre_personal, ' ', apaterno_personal, ' ', amaterno_personal) AS teacherName
      FROM Personal WHERE id_personal = ?
    `, [idPersonal]);
    const teacherName = personal[0]?.teacherName?.toUpperCase() || '';
    console.log(`[idPersonal=${idPersonal}, type=${type}, idTipoPregunta=${idTipoPregunta}] Teacher name: ${teacherName}`);

    // Obtener preguntas (criterios)
    const [questions] = await db.query(`
      SELECT id_pregunta, nombre_pregunta
      FROM Pregunta
      WHERE id_tipo_pregunta = ?
      ORDER BY id_pregunta
    `, [idTipoPregunta]);
    if (questions.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay preguntas para este tipo de evaluación' });
    }

    let isMultiple = false;
    let subjects = [];
    let totalAlumnos = 0;
    let comments = [];

    // Definir mapeos de tablas
    // Mapeos de tablas
const responseTables = {
  'materias': { table: 'Respuesta_Alumno_Docente', idField: 'id_materia', nameField: 'nombre_materia', joinTable: 'Materia', joinCondition: 'id_materia' },
  'ingles': { table: 'Respuesta_Alumno_Docente_Ingles', idField: 'id_nivel_ingles', nameField: 'nombre_nivel_ingles', joinTable: 'Nivel_Ingles', joinCondition: 'id_nivel_ingles' },
  'artes': { table: 'Respuesta_Alumno_Docente_Arte', idField: 'id_arte_especialidad', nameField: 'nombre_arte_especialidad', joinTable: 'Arte_Especialidad', joinCondition: 'id_arte_especialidad' },
  'servicios': { table: 'Respuesta_Alumno_Servicio', idField: 'id_servicio', nameField: 'nombre_servicio', joinTable: 'Servicio', joinCondition: 'id_servicio' },
  'talleres': { table: 'Respuesta_Alumno_Taller', idField: 'id_taller', nameField: 'nombre_taller', joinTable: 'Taller', joinCondition: 'id_taller', personalTable: 'Personal_Taller' },
  'counselors': { table: 'Respuesta_Alumno_Counselor', single: true },
  'psicopedagogico': { table: 'Respuesta_Alumno_Psicopedagogico', single: true },
  'coordinadores': { table: 'Respuesta_Personal', single: true, idField: 'id_personal', tipoPregunta: true },
  '360': { table: 'Respuesta_Personal', single: true, idField: 'id_personal', tipoPregunta: true, fixedTipoPregunta: 5 },
  'pares': { table: 'Respuesta_Personal', single: true, idField: 'id_personal', tipoPregunta: true },
  'jefes': { table: 'Respuesta_Personal', single: true, idField: 'id_personal', tipoPregunta: true },
  'subordinados': { table: 'Respuesta_Personal', single: true, idField: 'id_personal', tipoPregunta: true },  // Agregado aquí
  'disciplina_deportiva': { table: 'Respuesta_Alumno_Disciplina_Deportiva', single: true, idField: 'id_disciplia_deportiva' },
  'liga_deportiva': { table: 'Respuesta_Alumno_Liga_Deportiva', single: true, idField: 'id_liga_deportiva' }
};

const commentTables = {
  'materias': 'Comentario_Docente',
  'ingles': 'Comentario_Docente_Ingles',
  'artes': 'Comentario_Docente_Arte',
  'servicios': 'Comentario_Servicio',
  'talleres': 'Comentario_Taller',
  'counselors': 'Comentario_Counselor',
  'psicopedagogico': 'Comentario_Psicopedagogico',
  'coordinadores': 'Comentario_Personal',
  '360': 'Comentario_Personal',
  'pares': 'Comentario_Personal',
  'jefes': 'Comentario_Personal',
  'subordinados': 'Comentario_Personal',  // Agregado aquí
  'disciplina_deportiva': 'Comentario_Disciplina_Deportiva',
  'liga_deportiva': 'Comentario_Liga_Deportiva'
};

const commentColumnNames = {
  'materias': 'comentario_docente',
  'ingles': 'comentario_docente_ingles',
  'artes': 'comentario_docente_arte',
  'servicios': 'comentario_servicio',
  'talleres': 'comentario_taller',
  'counselors': 'comentario_counselor',
  'psicopedagogico': 'comentario_psicopedagogico',
  'coordinadores': 'comentario_personal',
  '360': 'comentario_personal',
  'pares': 'comentario_personal',
  'jefes': 'comentario_personal',
  'subordinados': 'comentario_personal',  // Agregado aquí
  'disciplina_deportiva': 'comentario_disciplina_deportiva',
  'liga_deportiva': 'comentario_liga_deportiva'
};

    const tableConfig = responseTables[type.toLowerCase()];
    if (!tableConfig) {
      return res.status(400).json({ success: false, message: `Invalid evaluation type: ${type}` });
    }

    if (!tableConfig.single) {
      // Manejo de evaluaciones múltiples (materias, ingles, artes, servicios, talleres)
      let subjectsDataQuery = '';
      if (type.toLowerCase() === 'talleres') {
        subjectsDataQuery = `
          SELECT DISTINCT t.${tableConfig.idField}, t.${tableConfig.nameField} AS name
          FROM ${tableConfig.personalTable} pt
          JOIN ${tableConfig.joinTable} t ON pt.${tableConfig.idField} = t.${tableConfig.idField}
          WHERE pt.id_personal = ?
        `;
      } else {
        subjectsDataQuery = `
          SELECT DISTINCT t.${tableConfig.idField}, t.${tableConfig.nameField} AS name
          FROM ${tableConfig.table} rad
          JOIN ${tableConfig.joinTable} t ON rad.${tableConfig.idField} = t.${tableConfig.joinCondition}
          WHERE rad.id_personal = ? AND rad.id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = ?)
        `;
      }
      const [subjectsData] = await db.query(subjectsDataQuery, type.toLowerCase() === 'talleres' ? [idPersonal] : [idPersonal, idTipoPregunta]);
      console.log(`[${type}] Subjects found:`, JSON.stringify(subjectsData, null, 2));

      subjects = subjectsData;
      isMultiple = subjects.length > 1;

      for (const subject of subjects) {
        const [totalAlumnosData] = await db.query(`
          SELECT COUNT(DISTINCT id_alumno) as total
          FROM ${tableConfig.table}
          WHERE id_personal = ? AND ${tableConfig.idField} = ?
        `, [idPersonal, subject[tableConfig.idField]]);
        subject.totalAlumnos = totalAlumnosData[0].total;

        const criteria = [];
        let sumAvgSi = 0;
        let validCriteriaCount = 0;

        for (const [index, q] of questions.entries()) {
          const [counts] = await db.query(`
            SELECT r.id_respuesta, r.nombre_respuesta, COUNT(*) as count
            FROM ${tableConfig.table} rad
            JOIN Respuesta r ON rad.id_respuesta = r.id_respuesta
            WHERE rad.id_personal = ? AND rad.${tableConfig.idField} = ? AND rad.id_pregunta = ?
            GROUP BY r.id_respuesta, r.nombre_respuesta
          `, [idPersonal, subject[tableConfig.idField], q.id_pregunta]);

          let si_count = 0;
          counts.forEach(c => {
            if (goodIds.includes(c.id_respuesta)) {
              si_count += c.count;
            }
          });
          const total_count = counts.reduce((sum, c) => sum + c.count, 0);
          const pctSi = total_count > 0 ? (si_count / total_count * 100).toFixed(2) : 'N/A';
          const pctNo = total_count > 0 ? ((total_count - si_count) / total_count * 100).toFixed(2) : 'N/A';

          criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
          if (pctSi !== 'N/A') {
            sumAvgSi += parseFloat(pctSi);
            validCriteriaCount++;
          }
        }

        subject.criteria = criteria;
        subject.avgSi = validCriteriaCount > 0 ? (sumAvgSi / validCriteriaCount).toFixed(2) : 'N/A';
        subject.avgNo = subject.avgSi !== 'N/A' ? (100 - parseFloat(subject.avgSi)).toFixed(2) : 'N/A';
        console.log(`[${type}, ${subject.name}, ${tableConfig.idField}=${subject[tableConfig.idField]}] avgSi: ${subject.avgSi}, avgNo: ${subject.avgNo}`);

        const [commentsData] = await db.query(`
          SELECT ${commentColumnNames[type.toLowerCase()]} AS comment
          FROM ${commentTables[type.toLowerCase()]}
          WHERE id_personal = ? AND ${tableConfig.idField} = ?
        `, [idPersonal, subject[tableConfig.idField]]);
        comments = comments.concat(commentsData.map(c => c.comment));
        console.log(`[${type}] Comments:`, comments);
      }

      totalAlumnos = subjects.reduce((sum, s) => sum + s.totalAlumnos, 0) || 0;
    } else {
      // Manejo de evaluaciones individuales (counselors, psicopedagogico, coordinadores, 360, pares, jefes, disciplina_deportiva, liga_deportiva)
      const idField = tableConfig.idField || 'id_personal';
      const tipoPreguntaValue = tableConfig.fixedTipoPregunta || idTipoPregunta;

      const [data] = await db.query(`
        SELECT COUNT(DISTINCT ${type.toLowerCase() === 'coordinadores' || type.toLowerCase() === '360' || type.toLowerCase() === 'pares' || type.toLowerCase() === 'jefes' || type.toLowerCase() === 'subordinados' ? 'id_evaluador' : 'id_alumno'}) AS totalAlumnos,
        pr.id_pregunta AS no, pr.nombre_pregunta AS criterio,
        SUM(IF(r.id_respuesta IN (?), 1, 0)) AS si_count,
        COUNT(*) AS total_count
      FROM ${tableConfig.table} rad
      JOIN Pregunta pr ON rad.id_pregunta = pr.id_pregunta
      JOIN Respuesta r ON rad.id_respuesta = r.id_respuesta
      WHERE rad.${idField} = ? ${tableConfig.tipoPregunta ? `AND rad.id_tipo_pregunta = ?` : `AND pr.id_tipo_pregunta = ?`}
      GROUP BY pr.id_pregunta
      `, tableConfig.tipoPregunta ? [goodIds, idPersonal, tipoPreguntaValue] : [goodIds, idPersonal, idTipoPregunta]);
      console.log(`[${type}] Criteria data:`, JSON.stringify(data, null, 2));

      if (data.length === 0) {
        totalAlumnos = 0;
        subjects = [{ name: type.charAt(0).toUpperCase() + type.slice(1), totalAlumnos: 0, criteria: [], avgSi: 'N/A', avgNo: 'N/A' }];
      } else {
        totalAlumnos = data[0].totalAlumnos;
        const criteria = questions.map((q, index) => {
          const questionData = data.find(d => d.no === q.id_pregunta) || { si_count: 0, total_count: 0 };
          const pctSi = questionData.total_count > 0 ? (questionData.si_count / questionData.total_count * 100).toFixed(2) : 'N/A';
          const pctNo = questionData.total_count > 0 ? ((questionData.total_count - questionData.si_count) / questionData.total_count * 100).toFixed(2) : 'N/A';
          return { no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo };
        });

        const validCriteria = criteria.filter(c => c.pctSi !== 'N/A');
        const avgSi = validCriteria.length > 0 ? (validCriteria.reduce((sum, c) => sum + parseFloat(c.pctSi), 0) / validCriteria.length).toFixed(2) : 'N/A';
        const avgNo = avgSi !== 'N/A' ? (100 - parseFloat(avgSi)).toFixed(2) : 'N/A';
        subjects = [{ name: type.charAt(0).toUpperCase() + type.slice(1), totalAlumnos, criteria, avgSi, avgNo }];
      }

      const commentQuery = tableConfig.tipoPregunta
        ? `SELECT ${commentColumnNames[type.toLowerCase()]} AS comment FROM ${commentTables[type.toLowerCase()]} WHERE id_personal = ? AND id_tipo_pregunta = ?`
        : `SELECT ${commentColumnNames[type.toLowerCase()]} AS comment FROM ${commentTables[type.toLowerCase()]} WHERE ${idField} = ?`;
      const [commentsData] = await db.query(commentQuery, tableConfig.tipoPregunta ? [idPersonal, tipoPreguntaValue] : [idPersonal]);
      comments = commentsData.map(c => c.comment);
      console.log(`[${type}] Comments:`, comments);
    }

    // Calcular promedios por criterio
    const criteria = questions.map((q, index) => {
      let sumPctSi = 0;
      let validCount = 0;
      subjects.forEach(s => {
        const pctSi = s.criteria[index]?.pctSi;
        if (pctSi !== 'N/A') {
          sumPctSi += parseFloat(pctSi);
          validCount++;
        }
      });
      const promedio = validCount > 0 ? (sumPctSi / validCount).toFixed(2) : 'N/A';
      return { no: index + 1, criterio: q.nombre_pregunta, promedio };
    });

    const validSubjects = subjects.filter(s => s.avgSi !== 'N/A');
    const generalAverage = validSubjects.length > 0 ? (validSubjects.reduce((sum, s) => sum + parseFloat(s.avgSi), 0) / validSubjects.length).toFixed(2) : 'N/A';
    console.log(`[${type}] totalAlumnos: ${totalAlumnos}, generalAverage: ${generalAverage}`);

    res.json({
      success: true,
      teacherName,
      isMultiple,
      subjects,
      criteria,
      generalAverage,
      comments
    });
  } catch (error) {
    console.error(`[idPersonal=${idPersonal}, type=${type}, idTipoPregunta=${idTipoPregunta}] Error:`, error);
    res.status(500).json({ success: false, message: 'Error interno al obtener resultados', error: error.message });
  }
});

router.get('/personal-evaluaciones-types/:idPersonal', authMiddleware, async (req, res) => {
  const { idPersonal } = req.params;
  try {
    const types = [];
    const checks = [
      { type: 'materias', query: `SELECT 1 FROM Respuesta_Alumno_Docente WHERE id_personal = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` },
      { type: 'ingles', query: `SELECT 1 FROM Respuesta_Alumno_Docente_Ingles WHERE id_personal = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` },
      { type: 'artes', query: `SELECT 1 FROM Respuesta_Alumno_Docente_Arte WHERE id_personal = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` },
      { type: 'servicios', query: `SELECT 1 FROM Respuesta_Alumno_Servicio WHERE id_servicio = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 8) LIMIT 1` },
      { type: 'talleres', query: `SELECT 1 FROM Respuesta_Alumno_Taller WHERE id_personal = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 9) LIMIT 1` },
      { type: 'counselors', query: `SELECT 1 FROM Respuesta_Alumno_Counselor WHERE id_personal = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 2) LIMIT 1` },
      { type: 'psicopedagogico', query: `SELECT 1 FROM Respuesta_Alumno_Psicopedagogico WHERE id_personal = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` },
      { type: 'coordinadores', query: `SELECT 1 FROM Respuesta_Personal WHERE id_personal = ? AND id_tipo_pregunta = 3 LIMIT 1` },
      { type: '360', query: `SELECT 1 FROM Respuesta_Personal WHERE id_personal = ? AND id_tipo_pregunta = 5 LIMIT 1` },
      { type: 'pares', query: `SELECT 1 FROM Respuesta_Personal WHERE id_personal = ? AND id_tipo_pregunta = 6 LIMIT 1` },
      { type: 'jefes', query: `SELECT 1 FROM Respuesta_Personal WHERE id_personal = ? AND id_tipo_pregunta = 7 LIMIT 1` },
      { type: 'subordinados', query: `SELECT 1 FROM Respuesta_Personal WHERE id_personal = ? AND id_tipo_pregunta = 4 LIMIT 1` },
      { type: 'disciplina_deportiva', query: `SELECT 1 FROM Respuesta_Alumno_Disciplina_Deportiva WHERE id_disciplia_deportiva = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` },
      { type: 'liga_deportiva', query: `SELECT 1 FROM Respuesta_Alumno_Liga_Deportiva WHERE id_liga_deportiva = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` }
    ];

    for (const check of checks) {
      const [result] = await db.query(check.query, [idPersonal]);
      if (result.length > 0) {
        types.push(check.type);
      }
    }
    res.json(types);
  } catch (error) {
    console.error('Error al obtener tipos de evaluaciones:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener tipos de evaluaciones' });
  }
});


// Obtener todos los servicios
router.get('/servicios', async (req, res) => {
  try {
    const [servicios] = await db.query('SELECT id_servicio, nombre_servicio, img_servicio FROM Servicio');
    res.json(servicios);
  } catch (error) {
    console.error('Error al obtener servicios:', error);
    res.status(500).json({ success: false, message: 'Error al cargar servicios' });
  }
});

router.get('/servicios-resultados/:id_servicio', async (req, res) => {
  const { id_servicio } = req.params;
  const idTipoPregunta = req.query.id_tipo_pregunta;
  const goodIds = [1, 5, 6, 9, 10]; // SÍ, 3-4, >5, BUENO, EXCELENTE

  try {
    if (!idTipoPregunta) {
      return res.status(400).json({ success: false, message: 'id_tipo_pregunta requerido' });
    }

    let isMultiple = false;
    let subjects = [];
    let totalAlumnos = 0;
    let comments = [];
    let nombre_servicio = '';

    const tableConfig = {
      table: 'Respuesta_Alumno_Servicio',
      idField: 'id_servicio',
      nameField: 'nombre_servicio',
      joinTable: 'Servicio',
      joinCondition: 'id_servicio'
    };

    // Obtener preguntas (criterios)
    let questionsQuery = `
      SELECT id_pregunta, nombre_pregunta
      FROM Pregunta
      WHERE id_tipo_pregunta = ?
    `;
    let queryParams = [idTipoPregunta];

    if (id_servicio !== '0') {
      // Para un servicio específico, filtrar preguntas por id_servicio
      questionsQuery += ` AND id_servicio = ?`;
      queryParams.push(id_servicio);
    } else {
      // Para todos los servicios, incluir solo preguntas con id_servicio no nulo
      questionsQuery += ` AND id_servicio IS NOT NULL`;
    }

    questionsQuery += ` ORDER BY id_pregunta`;
    const [questions] = await db.query(questionsQuery, queryParams);
    if (questions.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay preguntas para este tipo de evaluación o servicio' });
    }

    if (id_servicio === '0') {
      // Manejo de todos los servicios (múltiples)
      const [subjectsData] = await db.query(`
        SELECT id_servicio AS ${tableConfig.idField}, ${tableConfig.nameField} AS name
        FROM ${tableConfig.joinTable}
        WHERE nombre_servicio NOT IN ('La Loma', 'Ligas Deportivas')
      `);
      subjects = subjectsData;
      isMultiple = subjects.length > 1;
      nombre_servicio = 'SERVICIOS GENERALES';
    } else {
      // Manejo de servicio individual
      const [servicioData] = await db.query(`
        SELECT ${tableConfig.nameField} AS name
        FROM ${tableConfig.joinTable}
        WHERE ${tableConfig.idField} = ?
      `, [id_servicio]);
      if (servicioData.length === 0) {
        return res.status(404).json({ success: false, message: 'Servicio no encontrado' });
      }
      subjects = [{ [tableConfig.idField]: id_servicio, name: servicioData[0].name }];
      isMultiple = false;
      nombre_servicio = servicioData[0].name.toUpperCase();
    }

    console.log(`[id_servicio=${id_servicio}, idTipoPregunta=${idTipoPregunta}] Servicio(s): ${nombre_servicio}, subjects: ${JSON.stringify(subjects, null, 2)}`);

    for (const subject of subjects) {
      const [totalAlumnosData] = await db.query(`
        SELECT COUNT(DISTINCT id_alumno) as total
        FROM ${tableConfig.table}
        WHERE ${tableConfig.idField} = ? AND id_pregunta IN (
          SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = ? AND (id_servicio = ? OR id_servicio IS NULL)
        )
      `, [subject[tableConfig.idField], idTipoPregunta, subject[tableConfig.idField]]);
      subject.totalAlumnos = totalAlumnosData[0].total;
      totalAlumnos += subject.totalAlumnos;

      const criteria = [];
      let sumAvgSi = 0;
      let validCriteriaCount = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.id_respuesta, r.nombre_respuesta, COUNT(*) as count
          FROM ${tableConfig.table} rad
          JOIN Respuesta r ON rad.id_respuesta = r.id_respuesta
          WHERE rad.${tableConfig.idField} = ? AND rad.id_pregunta = ?
          GROUP BY r.id_respuesta, r.nombre_respuesta
        `, [subject[tableConfig.idField], q.id_pregunta]);

        let si_count = 0;
        counts.forEach(c => {
          if (goodIds.includes(c.id_respuesta)) {
            si_count += c.count;
          }
        });
        const total_count = counts.reduce((sum, c) => sum + c.count, 0);
        const pctSi = total_count > 0 ? (si_count / total_count * 100).toFixed(2) : 'N/A';
        const pctNo = total_count > 0 ? ((total_count - si_count) / total_count * 100).toFixed(2) : 'N/A';

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        if (pctSi !== 'N/A') {
          sumAvgSi += parseFloat(pctSi);
          validCriteriaCount++;
        }
      }

      subject.criteria = criteria;
      subject.avgSi = validCriteriaCount > 0 ? (sumAvgSi / validCriteriaCount).toFixed(2) : 'N/A';
      subject.avgNo = subject.avgSi !== 'N/A' ? (100 - parseFloat(subject.avgSi)).toFixed(2) : 'N/A';
      console.log(`[servicio=${subject.name}, id=${subject[tableConfig.idField]}] avgSi: ${subject.avgSi}, avgNo: ${subject.avgNo}`);
    }

    // Calcular promedios por criterio
    const criteria = questions.map((q, index) => {
      let sumPctSi = 0;
      let validCount = 0;
      subjects.forEach(s => {
        const pctSi = s.criteria[index]?.pctSi;
        if (pctSi !== 'N/A') {
          sumPctSi += parseFloat(pctSi);
          validCount++;
        }
      });
      const promedio = validCount > 0 ? (sumPctSi / validCount).toFixed(2) : 'N/A';
      return { no: index + 1, criterio: q.nombre_pregunta, promedio };
    });

    const validSubjects = subjects.filter(s => s.avgSi !== 'N/A');
    const generalAverage = validSubjects.length > 0 ? (validSubjects.reduce((sum, s) => sum + parseFloat(s.avgSi), 0) / validSubjects.length).toFixed(2) : 'N/A';

    // Obtener comentarios
    if (id_servicio === '0') {
      const [commentsData] = await db.query(`
        SELECT comentario_servicio AS comment
        FROM Comentario_Servicio
        WHERE id_servicio IN (
          SELECT id_servicio FROM Servicio WHERE nombre_servicio NOT IN ('La Loma', 'Ligas Deportivas')
        )
      `);
      comments = commentsData.map(c => c.comment).filter(comment => comment && comment.trim() !== '');
    } else {
      const [commentsData] = await db.query(`
        SELECT comentario_servicio AS comment
        FROM Comentario_Servicio
        WHERE id_servicio = ?
      `, [id_servicio]);
      comments = commentsData.map(c => c.comment).filter(comment => comment && comment.trim() !== '');
    }
    console.log(`[id_servicio=${id_servicio}] Comments: ${JSON.stringify(comments)}`);

    console.log(`[id_servicio=${id_servicio}] totalAlumnos: ${totalAlumnos}, generalAverage: ${generalAverage}`);

    res.json({
      success: true,
      teacherName: nombre_servicio, // Usamos 'teacherName' para consistencia con el frontend
      isMultiple,
      subjects,
      criteria,
      generalAverage,
      comments
    });
  } catch (error) {
    console.error(`[id_servicio=${id_servicio}, idTipoPregunta=${idTipoPregunta}] Error:`, error);
    res.status(500).json({ success: false, message: 'Error interno al obtener resultados', error: error.message });
  }
});
// 1. Lista de Disciplinas Deportivas
router.get('/disciplinas-la-loma', async (req, res) => {
  try {
    const [disciplinas] = await db.query(`
      SELECT id_disciplina_deportiva AS id_disciplina, nombre_disciplina_deportiva AS nombre_disciplina
      FROM Disciplina_Deportiva
    `);
    res.json(disciplinas);
  } catch (error) {
    console.error('Error al obtener disciplinas deportivas:', error);
    res.status(500).json({ success: false, message: 'Error al cargar disciplinas deportivas' });
  }
});

// 2. Resultados de una Disciplina Deportiva
router.get('/disciplinas-la-loma-resultados/:id_disciplina', async (req, res) => {
  const { id_disciplina } = req.params;
  const idTipoPregunta = req.query.id_tipo_pregunta || 8;
  const goodIds = [1, 5, 6, 9, 10]; // SÍ, 3-4, >5, BUENO, EXCELENTE

  try {
    if (!idTipoPregunta) {
      return res.status(400).json({ success: false, message: 'id_tipo_pregunta requerido' });
    }

    let subjects = [];
    let totalAlumnos = 0;
    let comments = [];
    let nombre_disciplina = '';

    const tableConfig = {
      table: 'Respuesta_Alumno_Disciplina_Deportiva',
      idField: 'id_disciplina_deportiva',
      nameField: 'nombre_disciplina_deportiva',
      joinTable: 'Disciplina_Deportiva',
      joinCondition: 'id_disciplina_deportiva'
    };

    // Obtener preguntas (criterios) para id_servicio = 3
    const [questions] = await db.query(`
      SELECT id_pregunta, nombre_pregunta
      FROM Pregunta
      WHERE id_tipo_pregunta = ? AND id_servicio = 3
      ORDER BY id_pregunta
    `, [idTipoPregunta]);
    if (questions.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay preguntas para esta disciplina' });
    }

    // Obtener nombre de la disciplina
    const [disciplinaData] = await db.query(`
      SELECT ${tableConfig.nameField} AS name
      FROM ${tableConfig.joinTable}
      WHERE ${tableConfig.idField} = ?
    `, [id_disciplina]);
    if (disciplinaData.length === 0) {
      return res.status(404).json({ success: false, message: 'Disciplina no encontrada' });
    }
    subjects = [{ [tableConfig.idField]: id_disciplina, name: disciplinaData[0].name }];
    nombre_disciplina = disciplinaData[0].name.toUpperCase();
    const isMultiple = false; // Disciplinas are always single

    console.log(`[id_disciplina=${id_disciplina}, idTipoPregunta=${idTipoPregunta}] Disciplina: ${nombre_disciplina}, subjects: ${JSON.stringify(subjects, null, 2)}`);

    for (const subject of subjects) {
      // Obtener total de alumnos
      const [totalAlumnosData] = await db.query(`
        SELECT COUNT(DISTINCT id_alumno) as total
        FROM ${tableConfig.table}
        WHERE ${tableConfig.idField} = ? AND id_pregunta IN (
          SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = ? AND id_servicio = 3
        )
      `, [subject[tableConfig.idField], idTipoPregunta]);
      subject.totalAlumnos = totalAlumnosData[0].total;
      totalAlumnos += subject.totalAlumnos;

      const criteria = [];
      let sumAvgSi = 0;
      let validCriteriaCount = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.id_respuesta, r.nombre_respuesta, COUNT(*) as count
          FROM ${tableConfig.table} rad
          JOIN Respuesta r ON rad.id_respuesta = r.id_respuesta
          WHERE rad.${tableConfig.idField} = ? AND rad.id_pregunta = ?
          GROUP BY r.id_respuesta, r.nombre_respuesta
        `, [subject[tableConfig.idField], q.id_pregunta]);

        let si_count = 0;
        counts.forEach(c => {
          if (goodIds.includes(c.id_respuesta)) {
            si_count += c.count;
          }
        });
        const total_count = counts.reduce((sum, c) => sum + c.count, 0);
        const pctSi = total_count > 0 ? (si_count / total_count * 100).toFixed(2) : 'N/A';
        const pctNo = total_count > 0 ? ((total_count - si_count) / total_count * 100).toFixed(2) : 'N/A';

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        if (pctSi !== 'N/A') {
          sumAvgSi += parseFloat(pctSi);
          validCriteriaCount++;
        }
      }

      subject.criteria = criteria;
      subject.avgSi = validCriteriaCount > 0 ? (sumAvgSi / validCriteriaCount).toFixed(2) : 'N/A';
      subject.avgNo = subject.avgSi !== 'N/A' ? (100 - parseFloat(subject.avgSi)).toFixed(2) : 'N/A';
      console.log(`[disciplina=${subject.name}, id=${subject[tableConfig.idField]}] avgSi: ${subject.avgSi}, avgNo: ${subject.avgNo}`);
    }

    // Calcular promedios por criterio
    const criteria = questions.map((q, index) => {
      let sumPctSi = 0;
      let validCount = 0;
      subjects.forEach(s => {
        const pctSi = s.criteria[index]?.pctSi;
        if (pctSi !== 'N/A') {
          sumPctSi += parseFloat(pctSi);
          validCount++;
        }
      });
      const promedio = validCount > 0 ? (sumPctSi / validCount).toFixed(2) : 'N/A';
      return { no: index + 1, criterio: q.nombre_pregunta, promedio };
    });

    const validSubjects = subjects.filter(s => s.avgSi !== 'N/A');
    const generalAverage = validSubjects.length > 0 ? (validSubjects.reduce((sum, s) => sum + parseFloat(s.avgSi), 0) / validSubjects.length).toFixed(2) : 'N/A';

    // Obtener comentarios
    const [commentsData] = await db.query(`
      SELECT comentario_servicio AS comment
      FROM Comentario_Disciplina_Deportiva
      WHERE id_disciplina_deportiva = ?
    `, [id_disciplina]);
    comments = commentsData.map(c => c.comment).filter(comment => comment && comment.trim() !== '');

    console.log(`[id_disciplina=${id_disciplina}] totalAlumnos: ${totalAlumnos}, generalAverage: ${generalAverage}, comments: ${JSON.stringify(comments)}`);

    res.json({
      success: true,
      teacherName: nombre_disciplina, // Usamos 'teacherName' para consistencia con el frontend
      isMultiple: false,
      subjects,
      criteria,
      generalAverage,
      comments
    });
  } catch (error) {
    console.error(`[id_disciplina=${id_disciplina}, idTipoPregunta=${idTipoPregunta}] Error:`, error);
    res.status(500).json({ success: false, message: 'Error interno al obtener resultados', error: error.message });
  }
});
// 3. Lista de Ligas Deportivas
router.get('/ligas-deportivas', async (req, res) => {
  try {
    const [ligas] = await db.query(`
      SELECT id_liga_deportiva AS id_liga, nombre_liga_deportiva AS nombre_liga
      FROM Liga_Deportiva
    `);
    res.json(ligas);
  } catch (error) {
    console.error('Error al obtener ligas deportivas:', error);
    res.status(500).json({ success: false, message: 'Error al cargar ligas deportivas' });
  }
});

// 4. Resultados de una Liga Deportiva
router.get('/ligas-deportivas-resultados/:id_liga', async (req, res) => {
  const { id_liga } = req.params;
  const idTipoPregunta = req.query.id_tipo_pregunta || 8;
  const goodIds = [1, 5, 6, 9, 10]; // SÍ, 3-4, >5, BUENO, EXCELENTE

  try {
    if (!idTipoPregunta) {
      return res.status(400).json({ success: false, message: 'id_tipo_pregunta requerido' });
    }

    let subjects = [];
    let totalAlumnos = 0;
    let comments = [];
    let nombre_liga = '';

    const tableConfig = {
      table: 'Respuesta_Alumno_Liga_Deportiva',
      idField: 'id_liga_deportiva',
      nameField: 'nombre_liga_deportiva',
      joinTable: 'Liga_Deportiva',
      joinCondition: 'id_liga_deportiva'
    };

    // Obtener preguntas (criterios) para id_servicio = 8
    const [questions] = await db.query(`
      SELECT id_pregunta, nombre_pregunta
      FROM Pregunta
      WHERE id_tipo_pregunta = ? AND id_servicio = 8
      ORDER BY id_pregunta
    `, [idTipoPregunta]);
    if (questions.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay preguntas para esta liga' });
    }

    // Obtener nombre de la liga
    const [ligaData] = await db.query(`
      SELECT ${tableConfig.nameField} AS name
      FROM ${tableConfig.joinTable}
      WHERE ${tableConfig.idField} = ?
    `, [id_liga]);
    if (ligaData.length === 0) {
      return res.status(404).json({ success: false, message: 'Liga no encontrada' });
    }
    subjects = [{ [tableConfig.idField]: id_liga, name: ligaData[0].name }];
    nombre_liga = ligaData[0].name.toUpperCase();
    const isMultiple = false; // Ligas are always single

    console.log(`[id_liga=${id_liga}, idTipoPregunta=${idTipoPregunta}] Liga: ${nombre_liga}, subjects: ${JSON.stringify(subjects, null, 2)}`);

    for (const subject of subjects) {
      // Obtener total de alumnos
      const [totalAlumnosData] = await db.query(`
        SELECT COUNT(DISTINCT id_alumno) as total
        FROM ${tableConfig.table}
        WHERE ${tableConfig.idField} = ? AND id_pregunta IN (
          SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = ? AND id_servicio = 8
        )
      `, [subject[tableConfig.idField], idTipoPregunta]);
      subject.totalAlumnos = totalAlumnosData[0].total;
      totalAlumnos += subject.totalAlumnos;

      const criteria = [];
      let sumAvgSi = 0;
      let validCriteriaCount = 0;

      for (const [index, q] of questions.entries()) {
        const [counts] = await db.query(`
          SELECT r.id_respuesta, r.nombre_respuesta, COUNT(*) as count
          FROM ${tableConfig.table} rald
          JOIN Respuesta r ON rald.id_respuesta = r.id_respuesta
          WHERE rald.${tableConfig.idField} = ? AND rald.id_pregunta = ?
          GROUP BY r.id_respuesta, r.nombre_respuesta
        `, [subject[tableConfig.idField], q.id_pregunta]);

        let si_count = 0;
        counts.forEach(c => {
          if (goodIds.includes(c.id_respuesta)) {
            si_count += c.count;
          }
        });
        const total_count = counts.reduce((sum, c) => sum + c.count, 0);
        const pctSi = total_count > 0 ? (si_count / total_count * 100).toFixed(2) : 'N/A';
        const pctNo = total_count > 0 ? ((total_count - si_count) / total_count * 100).toFixed(2) : 'N/A';

        criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
        if (pctSi !== 'N/A') {
          sumAvgSi += parseFloat(pctSi);
          validCriteriaCount++;
        }
      }

      subject.criteria = criteria;
      subject.avgSi = validCriteriaCount > 0 ? (sumAvgSi / validCriteriaCount).toFixed(2) : 'N/A';
      subject.avgNo = subject.avgSi !== 'N/A' ? (100 - parseFloat(subject.avgSi)).toFixed(2) : 'N/A';
      console.log(`[liga=${subject.name}, id=${subject[tableConfig.idField]}] avgSi: ${subject.avgSi}, avgNo: ${subject.avgNo}`);
    }

    // Calcular promedios por criterio
    const criteria = questions.map((q, index) => {
      let sumPctSi = 0;
      let validCount = 0;
      subjects.forEach(s => {
        const pctSi = s.criteria[index]?.pctSi;
        if (pctSi !== 'N/A') {
          sumPctSi += parseFloat(pctSi);
          validCount++;
        }
      });
      const promedio = validCount > 0 ? (sumPctSi / validCount).toFixed(2) : 'N/A';
      return { no: index + 1, criterio: q.nombre_pregunta, promedio };
    });

    const validSubjects = subjects.filter(s => s.avgSi !== 'N/A');
    const generalAverage = validSubjects.length > 0 ? (validSubjects.reduce((sum, s) => sum + parseFloat(s.avgSi), 0) / validSubjects.length).toFixed(2) : 'N/A';

    // Obtener comentarios
    const [commentsData] = await db.query(`
      SELECT comentario_servicio AS comment
      FROM Comentario_Liga_Deportiva
      WHERE id_liga_deportiva = ?
    `, [id_liga]);
    comments = commentsData.map(c => c.comment).filter(comment => comment && comment.trim() !== '');

    console.log(`[id_liga=${id_liga}] totalAlumnos: ${totalAlumnos}, generalAverage: ${generalAverage}, comments: ${JSON.stringify(comments)}`);

    res.json({
      success: true,
      teacherName: nombre_liga, // Usamos 'teacherName' para consistencia con el frontend
      isMultiple: false,
      subjects,
      criteria,
      generalAverage,
      comments
    });
  } catch (error) {
    console.error(`[id_liga=${id_liga}, idTipoPregunta=${idTipoPregunta}] Error:`, error);
    res.status(500).json({ success: false, message: 'Error interno al obtener resultados', error: error.message });
  }
});



//FIN RUTAS DE RESULTADOS

//INICIO RUTAS DE HISTORICO

// Fetch available cycles
router.get('/historico-ciclos', async (req, res) => {
  try {
    console.log('Fetching ciclos from Respuesta_Alumno_Docente_Historico');
    const [ciclos] = await db.query(`
      SELECT DISTINCT ciclo, MIN(fecha_respaldo) as fecha_respaldo
      FROM Respuesta_Alumno_Docente_Historico
      WHERE ciclo IS NOT NULL AND fecha_respaldo IS NOT NULL
      GROUP BY ciclo
      ORDER BY fecha_respaldo DESC
    `);
    console.log('Ciclos fetched:', ciclos);
    res.json(ciclos);
  } catch (error) {
    console.error('Error fetching ciclos:', error);
    res.status(500).json({ success: false, message: 'Error fetching ciclos', error: error.message });
  }
});

// Fetch personnel for a specific cycle
router.get('/historico-personal-resultados/:ciclo', async (req, res) => {
  const { ciclo } = req.params;
  try {
    console.log(`Fetching personal for ciclo: ${ciclo}`);
    const [personal] = await db.query(`
      SELECT DISTINCT 
        p.id_personal, 
        p.nombre_personal, 
        p.apaterno_personal, 
        p.amaterno_personal, 
        p.img_personal,
        pu.nombre_puesto AS roles,
        GROUP_CONCAT(DISTINCT r.nombre_rol ORDER BY r.nombre_rol SEPARATOR ', ') AS roles_puesto
      FROM Personal_Historico p
      INNER JOIN Respuesta_Alumno_Docente_Historico rad ON p.id_personal = rad.id_personal
      JOIN Puesto pu ON p.id_puesto = pu.id_puesto
      LEFT JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
      LEFT JOIN Rol r ON pr.id_rol = r.id_rol
      WHERE rad.ciclo = ? AND p.estado_personal = 1
      GROUP BY p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.img_personal, pu.nombre_puesto
    `, [ciclo]);
    console.log(`Personal fetched for ciclo ${ciclo}:`, personal);
    res.json(personal);
  } catch (error) {
    console.error(`Error fetching personal for ciclo ${ciclo}:`, error);
    res.status(500).json({ success: false, message: 'Error fetching personal', error: error.message });
  }
});

// Fetch personal details for a specific cycle
router.get('/historico-personal-resultados/:id/:ciclo', async (req, res) => {
  const { id, ciclo } = req.params;
  try {
    console.log(`Fetching personal details for id: ${id}, ciclo: ${ciclo}`);
    const [personal] = await db.query(`
      SELECT 
        p.id_personal, 
        p.nombre_personal, 
        p.apaterno_personal, 
        p.amaterno_personal,
        p.telefono_personal, 
        p.fecha_nacimiento_personal, 
        p.img_personal,
        pu.nombre_puesto AS roles,
        GROUP_CONCAT(DISTINCT r.nombre_rol ORDER BY r.nombre_rol SEPARATOR ', ') AS roles_puesto
      FROM Personal_Historico p
      JOIN Puesto pu ON p.id_puesto = pu.id_puesto
      LEFT JOIN Puesto_Rol pr ON pu.id_puesto = pr.id_puesto
      LEFT JOIN Rol r ON pr.id_rol = r.id_rol
      WHERE p.id_personal = ? AND p.estado_personal = 1 AND p.ciclo = ? AND EXISTS (
        SELECT 1 FROM Respuesta_Alumno_Docente_Historico rad
        WHERE rad.id_personal = p.id_personal AND rad.ciclo = ?
      )
      GROUP BY p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal, p.telefono_personal, p.fecha_nacimiento_personal, p.img_personal, pu.nombre_puesto
    `, [id, ciclo, ciclo]);

    if (personal.length === 0) {
      console.log(`Personal not found for id: ${id}, ciclo: ${ciclo}`);
      return res.status(404).json({ success: false, message: 'Personal no encontrado' });
    }

    const [materias] = await db.query(`
      SELECT 
        m.nombre_materia, 
        gg.grado as grado_materia, 
        GROUP_CONCAT(DISTINCT gg.grupo ORDER BY gg.grupo SEPARATOR ', ') as grupos
      FROM Alumno_Materia_Historico am
      INNER JOIN Materia m 
        ON am.id_materia = m.id_materia
      INNER JOIN Grupo_Materia_Historico gm 
        ON am.id_materia = gm.id_materia 
        AND am.id_personal = gm.id_personal
        AND am.ciclo = gm.ciclo
      INNER JOIN Grado_Grupo gg 
        ON gm.id_grado_grupo = gg.id_grado_grupo
      WHERE am.id_personal = ? 
        AND am.ciclo = ?
      GROUP BY m.nombre_materia, gg.grado
    `, [id, ciclo]);

    const [talleres] = await db.query(`
      SELECT t.nombre_taller
      FROM Alumno_Taller_Historico at
      JOIN Taller t ON at.id_taller = t.id_taller
      WHERE at.id_personal = ? AND at.ciclo = ?
    `, [id, ciclo]);

    console.log(`Personal details fetched for id: ${id}, ciclo: ${ciclo}`, { personal: personal[0], materias, talleres });
    res.json({ ...personal[0], materias, talleres });
  } catch (error) {
    console.error(`Error fetching personal details for id ${id} and ciclo ${ciclo}:`, error);
    res.status(500).json({ success: false, message: 'Error fetching personal details', error: error.message });
  }
});

// Fetch KPIs for a specific personal and cycle
router.get('/historico-personal-kpis/:id/:ciclo', async (req, res) => {
  const { id, ciclo } = req.params;
  try {
    console.log(`Fetching KPIs for id: ${id}, ciclo: ${ciclo}`);

    const [kpis] = await db.query(`
      SELECT 
        ck.nombre_categoria_kpi, 
        pc.porcentaje_categoria,
        k.id_kpi, 
        k.nombre_kpi, 
        k.meta_kpi, 
        k.tipo_kpi, 
        ae.siglas_area_estrategica,
        ik.sigla_indicador_kpi, 
        k.id_rol, 
        rk.resultado_kpi
      FROM Categoria_Kpi ck
      JOIN Kpi k 
        ON ck.id_categoria_kpi = k.id_categoria_kpi
      JOIN Personal_Historico p 
        ON p.id_personal = ?
      JOIN Puesto_Categoria pc 
        ON pc.id_puesto = p.id_puesto 
        AND pc.id_categoria_kpi = ck.id_categoria_kpi
      JOIN Area_Estrategica ae 
        ON ae.id_area_estrategica = k.id_area_estrategica
      JOIN Indicador_Kpi ik
        ON ik.id_indicador_kpi = k.id_indicador_kpi
      LEFT JOIN Resultado_Kpi_Historico rk 
        ON k.id_kpi = rk.id_kpi 
        AND rk.id_personal = ? 
        AND rk.ciclo = ?
      WHERE rk.id_personal IS NOT NULL
      ORDER BY ck.id_categoria_kpi, k.id_kpi
    `, [id, id, ciclo]);

    const categorias = [];
    const grouped = kpis.reduce((acc, row) => {
      if (!acc[row.nombre_categoria_kpi]) {
        acc[row.nombre_categoria_kpi] = {
          nombre_categoria_kpi: row.nombre_categoria_kpi,
          porcentaje_categoria: row.porcentaje_categoria,
          kpis: []
        };
      }
      acc[row.nombre_categoria_kpi].kpis.push({
        id_kpi: row.id_kpi,
        nombre_kpi: row.nombre_kpi,
        meta_kpi: row.meta_kpi,
        tipo_kpi: row.tipo_kpi,
        siglas_area_estrategica: row.siglas_area_estrategica,
        sigla_indicador_kpi: row.sigla_indicador_kpi,
        resultado_kpi: row.resultado_kpi
      });
      return acc;
    }, {});

    for (const key in grouped) {
      categorias.push(grouped[key]);
    }

    console.log(`KPIs fetched for id: ${id}, ciclo: ${ciclo}`, categorias);
    res.json(categorias);
  } catch (error) {
    console.error(`Error fetching KPIs for id ${id} and ciclo ${ciclo}:`, error);
    res.status(500).json({ success: false, message: 'Error fetching KPIs', error: error.message });
  }
});

// Fetch evaluation types for a specific personal and cycle
router.get('/historico-personal-evaluaciones-types/:idPersonal/:ciclo', async (req, res) => {
  const { idPersonal, ciclo } = req.params;
  try {
    console.log(`Fetching evaluation types for idPersonal: ${idPersonal}, ciclo: ${ciclo}`);
    const types = [];
    const checks = [
      { type: 'materias', query: `SELECT 1 FROM Respuesta_Alumno_Docente_Historico WHERE id_personal = ? AND ciclo = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` },
      { type: 'ingles', query: `SELECT 1 FROM Respuesta_Alumno_Docente_Ingles_Historico WHERE id_personal = ? AND ciclo = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` },
      { type: 'artes', query: `SELECT 1 FROM Respuesta_Alumno_Docente_Arte_Historico WHERE id_personal = ? AND ciclo = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` },
      { type: 'servicios', query: `SELECT 1 FROM Respuesta_Alumno_Servicio_Historico WHERE id_servicio = ? AND ciclo = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 8) LIMIT 1` },
      { type: 'talleres', query: `SELECT 1 FROM Respuesta_Alumno_Taller_Historico WHERE id_personal = ? AND ciclo = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 9) LIMIT 1` },
      { type: 'counselors', query: `SELECT 1 FROM Respuesta_Alumno_Counselor_Historico WHERE id_personal = ? AND ciclo = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 2) LIMIT 1` },
      { type: 'psicopedagogico', query: `SELECT 1 FROM Respuesta_Alumno_Psicopedagogico_Historico WHERE id_personal = ? AND ciclo = ? AND id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = 1) LIMIT 1` },
      { type: 'coordinadores', query: `SELECT 1 FROM Respuesta_Personal_Historico WHERE id_personal = ? AND ciclo = ? AND id_tipo_pregunta = 3 LIMIT 1` },
      { type: '360', query: `SELECT 1 FROM Respuesta_Personal_Historico WHERE id_personal = ? AND ciclo = ? AND id_tipo_pregunta = 5 LIMIT 1` },
      { type: 'pares', query: `SELECT 1 FROM Respuesta_Personal_Historico WHERE id_personal = ? AND ciclo = ? AND id_tipo_pregunta = 6 LIMIT 1` },
      { type: 'jefes', query: `SELECT 1 FROM Respuesta_Personal_Historico WHERE id_personal = ? AND ciclo = ? AND id_tipo_pregunta = 7 LIMIT 1` }
    ];

    for (const check of checks) {
      const [result] = await db.query(check.query, [idPersonal, ciclo]);
      if (result.length > 0) {
        types.push(check.type);
        console.log(`[idPersonal=${idPersonal}, ciclo=${ciclo}] Type ${check.type} found in database`);
      }
    }
    console.log(`Evaluation types fetched for idPersonal: ${idPersonal}, ciclo: ${ciclo}`, types);
    res.json(types);
  } catch (error) {
    console.error(`[idPersonal=${idPersonal}, ciclo=${ciclo}] Error fetching evaluation types:`, error);
    res.status(500).json({ success: false, message: 'Error fetching types', error: error.message });
  }
});

// Fetch evaluation results for a specific personal, type, and cycle
router.get('/historico-personal-evaluaciones-results/:idPersonal/:type/:ciclo', async (req, res) => {
  const tipoToIdPregunta = {
    'materias': 1,
    'counselors': 2,
    'coordinadores': 3,
    'subordinados': 4,
    '360': 5,
    'pares': 6,
    'jefes': 7,
    'servicios': 8,
    'talleres': 9,
    'instalaciones': 10,
    'ingles': 1,
    'artes': 1,
    'psicopedagogico': 1
  };
  const { idPersonal, type, ciclo } = req.params;
  const idTipoPregunta = tipoToIdPregunta[type.toLowerCase()] || 1;
  const goodIds = [1, 5, 6, 9, 10]; // SÍ, 3-4, >5, BUENO, EXCELENTE

  try {
    console.log(`Fetching evaluation results for idPersonal: ${idPersonal}, type: ${type}, ciclo: ${ciclo}`);
    if (!idTipoPregunta) {
      return res.status(400).json({ success: false, message: 'id_tipo_pregunta requerido' });
    }

    const [personal] = await db.query(`
      SELECT CONCAT(nombre_personal, ' ', apaterno_personal, ' ', amaterno_personal) AS teacherName
      FROM Personal_Historico WHERE id_personal = ? AND ciclo = ?
    `, [idPersonal, ciclo]);
    const teacherName = personal[0]?.teacherName?.toUpperCase() || '';

    const [questions] = await db.query(`
      SELECT id_pregunta, nombre_pregunta
      FROM Pregunta
      WHERE id_tipo_pregunta = ?
      ORDER BY id_pregunta
    `, [idTipoPregunta]);
    if (questions.length === 0) {
      return res.status(404).json({ success: false, message: 'No hay preguntas para este tipo de evaluación' });
    }

    const responseTables = {
      materias: { table: 'Respuesta_Alumno_Docente_Historico', idField: 'id_materia', nameField: 'nombre_materia', joinTable: 'Materia', joinCondition: 'id_materia' },
      ingles: { table: 'Respuesta_Alumno_Docente_Ingles_Historico', idField: 'id_nivel_ingles', nameField: 'nombre_nivel_ingles', joinTable: 'Nivel_Ingles', joinCondition: 'id_nivel_ingles' },
      artes: { table: 'Respuesta_Alumno_Docente_Arte_Historico', idField: 'id_arte_especialidad', nameField: 'nombre_arte_especialidad', joinTable: 'Arte_Especialidad', joinCondition: 'id_arte_especialidad' },
      servicios: { table: 'Respuesta_Alumno_Servicio_Historico', idField: 'id_servicio', nameField: 'nombre_servicio', joinTable: 'Servicio', joinCondition: 'id_servicio', personalTable: 'Personal_Historico' },
      talleres: { table: 'Respuesta_Alumno_Taller_Historico', idField: 'id_taller', nameField: 'nombre_taller', joinTable: 'Taller', joinCondition: 'id_taller', personalTable: 'Personal_Taller_Historico' },
      counselors: { table: 'Respuesta_Alumno_Counselor_Historico', single: true },
      psicopedagogico: { table: 'Respuesta_Alumno_Psicopedagogico_Historico', single: true, idField: 'id_personal' },
      coordinadores: { table: 'Respuesta_Personal_Historico', single: true, idField: 'id_personal', tipoPregunta: true },
      '360': { table: 'Respuesta_Personal_Historico', single: true, idField: 'id_personal', tipoPregunta: true, fixedTipoPregunta: 5 },
      pares: { table: 'Respuesta_Personal_Historico', single: true, idField: 'id_personal', tipoPregunta: true },
      jefes: { table: 'Respuesta_Personal_Historico', single: true, idField: 'id_personal', tipoPregunta: true }
    };

    const commentTables = {
      materias: 'Comentario_Docente_Historico',
      ingles: 'Comentario_Docente_Ingles_Historico',
      artes: 'Comentario_Docente_Arte_Historico',
      servicios: 'Comentario_Servicio_Historico',
      talleres: 'Comentario_Taller_Historico',
      counselors: 'Comentario_Counselor_Historico',
      psicopedagogico: 'Comentario_Psicopedagogico_Historico',
      coordinadores: 'Comentario_Personal_Historico',
      '360': 'Comentario_Personal_Historico',
      pares: 'Comentario_Personal_Historico',
      jefes: 'Comentario_Personal_Historico'
    };

    const commentColumnNames = {
      materias: 'comentario_docente',
      ingles: 'comentario_docente_ingles',
      artes: 'comentario_docente_arte',
      servicios: 'comentario_servicio',
      talleres: 'comentario_taller',
      counselors: 'comentario_counselor',
      psicopedagogico: 'comentario_psicopedagogico',
      coordinadores: 'comentario_personal',
      '360': 'comentario_personal',
      pares: 'comentario_personal',
      jefes: 'comentario_personal'
    };

    const tableConfig = responseTables[type.toLowerCase()];
    if (!tableConfig) {
      return res.status(400).json({ success: false, message: `Invalid evaluation type: ${type}` });
    }

    let isMultiple = false;
    let subjects = [];
    let comments = [];

    if (!tableConfig.single) {
      let subjectsDataQuery = '';
      if (type.toLowerCase() === 'talleres') {
        subjectsDataQuery = `
          SELECT DISTINCT t.${tableConfig.idField}, t.${tableConfig.nameField} AS name
          FROM ${tableConfig.personalTable} pt
          JOIN ${tableConfig.joinTable} t ON pt.${tableConfig.idField} = t.${tableConfig.idField}
          WHERE pt.id_personal = ? AND pt.ciclo = ?
        `;
      } else {
        subjectsDataQuery = `
          SELECT DISTINCT t.${tableConfig.idField}, t.${tableConfig.nameField} AS name
          FROM ${tableConfig.table} rad
          JOIN ${tableConfig.joinTable} t ON rad.${tableConfig.idField} = t.${tableConfig.joinCondition}
          WHERE rad.id_personal = ? AND rad.ciclo = ? AND rad.id_pregunta IN (SELECT id_pregunta FROM Pregunta WHERE id_tipo_pregunta = ?)
        `;
      }
      const [subjectsData] = await db.query(subjectsDataQuery, type.toLowerCase() === 'talleres' ? [idPersonal, ciclo] : [idPersonal, ciclo, idTipoPregunta]);
      subjects = subjectsData;
      isMultiple = subjects.length > 1;

      for (const subject of subjects) {
        const [totalAlumnosData] = await db.query(`
          SELECT COUNT(DISTINCT id_alumno) as total
          FROM ${tableConfig.table}
          WHERE id_personal = ? AND ${tableConfig.idField} = ? AND ciclo = ?
        `, [idPersonal, subject[tableConfig.idField], ciclo]);
        subject.totalAlumnos = totalAlumnosData[0].total;

        const criteria = [];
        let sumAvgSi = 0;
        let validCriteriaCount = 0;

        for (const [index, q] of questions.entries()) {
          const [counts] = await db.query(`
            SELECT r.id_respuesta, r.nombre_respuesta, COUNT(*) as count
            FROM ${tableConfig.table} rad
            JOIN Respuesta r ON rad.id_respuesta = r.id_respuesta
            WHERE rad.id_personal = ? AND rad.${tableConfig.idField} = ? AND rad.ciclo = ? AND rad.id_pregunta = ?
            GROUP BY r.id_respuesta, r.nombre_respuesta
          `, [idPersonal, subject[tableConfig.idField], ciclo, q.id_pregunta]);

          let si_count = 0;
          counts.forEach(c => {
            if (goodIds.includes(c.id_respuesta)) {
              si_count += c.count;
            }
          });
          const total_count = counts.reduce((sum, c) => sum + c.count, 0);
          const pctSi = total_count > 0 ? (si_count / total_count * 100).toFixed(2) : 'N/A';
          const pctNo = total_count > 0 ? ((total_count - si_count) / total_count * 100).toFixed(2) : 'N/A';

          criteria.push({ no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo });
          if (pctSi !== 'N/A') {
            sumAvgSi += parseFloat(pctSi);
            validCriteriaCount++;
          }
        }

        subject.criteria = criteria;
        subject.avgSi = validCriteriaCount > 0 ? (sumAvgSi / validCriteriaCount).toFixed(2) : 'N/A';
        subject.avgNo = subject.avgSi !== 'N/A' ? (100 - parseFloat(subject.avgSi)).toFixed(2) : 'N/A';
        const [commentsData] = await db.query(`
          SELECT ${commentColumnNames[type.toLowerCase()]} AS comment
          FROM ${commentTables[type.toLowerCase()]}
          WHERE id_personal = ? AND ${tableConfig.idField} = ? AND ciclo = ?
        `, [idPersonal, subject[tableConfig.idField], ciclo]);
        comments = comments.concat(commentsData.map(c => c.comment));
      }
    } else {
      const idField = tableConfig.idField || 'id_personal';
      const tipoPreguntaValue = tableConfig.fixedTipoPregunta || idTipoPregunta;

      const [data] = await db.query(`
        SELECT COUNT(DISTINCT ${type.toLowerCase() === 'coordinadores' || type.toLowerCase() === '360' || type.toLowerCase() === 'pares' || type.toLowerCase() === 'jefes' ? 'id_evaluador' : 'id_alumno'}) AS totalAlumnos,
          pr.id_pregunta AS no, pr.nombre_pregunta AS criterio,
          SUM(IF(r.id_respuesta IN (?), 1, 0)) AS si_count,
          COUNT(*) AS total_count
        FROM ${tableConfig.table} rad
        JOIN Pregunta pr ON rad.id_pregunta = pr.id_pregunta
        JOIN Respuesta r ON rad.id_respuesta = r.id_respuesta
        WHERE rad.${idField} = ? AND rad.ciclo = ? ${tableConfig.tipoPregunta ? `AND rad.id_tipo_pregunta = ?` : `AND pr.id_tipo_pregunta = ?`}
        GROUP BY pr.id_pregunta
      `, tableConfig.tipoPregunta ? [goodIds, idPersonal, ciclo, tipoPreguntaValue] : [goodIds, idPersonal, ciclo, idTipoPregunta]);

      if (data.length === 0) {
        subjects = [{ name: type.charAt(0).toUpperCase() + type.slice(1), totalAlumnos: 0, criteria: [], avgSi: 'N/A', avgNo: 'N/A' }];
      } else {
        const totalAlumnos = data[0].totalAlumnos;
        const criteria = questions.map((q, index) => {
          const questionData = data.find(d => d.no === q.id_pregunta) || { si_count: 0, total_count: 0 };
          const pctSi = questionData.total_count > 0 ? (questionData.si_count / questionData.total_count * 100).toFixed(2) : 'N/A';
          const pctNo = questionData.total_count > 0 ? ((questionData.total_count - questionData.si_count) / questionData.total_count * 100).toFixed(2) : 'N/A';
          return { no: index + 1, criterio: q.nombre_pregunta, pctSi, pctNo };
        });

        const validCriteria = criteria.filter(c => c.pctSi !== 'N/A');
        const avgSi = validCriteria.length > 0 ? (validCriteria.reduce((sum, c) => sum + parseFloat(c.pctSi), 0) / validCriteria.length).toFixed(2) : 'N/A';
        const avgNo = avgSi !== 'N/A' ? (100 - parseFloat(avgSi)).toFixed(2) : 'N/A';
        subjects = [{ name: type.charAt(0).toUpperCase() + type.slice(1), totalAlumnos, criteria, avgSi, avgNo }];
      }

      const commentQuery = tableConfig.tipoPregunta
        ? `SELECT ${commentColumnNames[type.toLowerCase()]} AS comment FROM ${commentTables[type.toLowerCase()]} WHERE id_personal = ? AND ciclo = ? AND id_tipo_pregunta = ?`
        : `SELECT ${commentColumnNames[type.toLowerCase()]} AS comment FROM ${commentTables[type.toLowerCase()]} WHERE ${idField} = ? AND ciclo = ?`;
      const [commentsData] = await db.query(commentQuery, tableConfig.tipoPregunta ? [idPersonal, ciclo, tipoPreguntaValue] : [idPersonal, ciclo]);
      comments = commentsData.map(c => c.comment);
    }

    const criteria = questions.map((q, index) => {
      let sumPctSi = 0;
      let validCount = 0;
      subjects.forEach(s => {
        const pctSi = s.criteria[index]?.pctSi;
        if (pctSi !== 'N/A') {
          sumPctSi += parseFloat(pctSi);
          validCount++;
        }
      });
      const promedio = validCount > 0 ? (sumPctSi / validCount).toFixed(2) : 'N/A';
      return { no: index + 1, criterio: q.nombre_pregunta, promedio };
    });

    const validSubjects = subjects.filter(s => s.avgSi !== 'N/A');
    const generalAverage = validSubjects.length > 0 ? (validSubjects.reduce((sum, s) => sum + parseFloat(s.avgSi), 0) / validSubjects.length).toFixed(2) : 'N/A';

    console.log(`Evaluation results fetched for idPersonal: ${idPersonal}, type: ${type}, ciclo: ${ciclo}`, { teacherName, isMultiple, subjects, criteria, generalAverage, comments });
    res.json({
      success: true,
      teacherName,
      isMultiple,
      subjects,
      criteria,
      generalAverage,
      comments
    });
  } catch (error) {
    console.error(`[idPersonal=${idPersonal}, type=${type}, ciclo=${ciclo}] Error:`, error);
    res.status(500).json({ success: false, message: 'Error interno al obtener resultados', error: error.message });
  }
});

// Fetch cycles for a specific personal
router.get('/historico-ciclos-personal/:id_personal', async (req, res) => {
  const { id_personal } = req.params;
  try {
    const [ciclos] = await db.query(`
      SELECT DISTINCT ciclo
      FROM Personal_Historico
      WHERE id_personal = ?
      ORDER BY ciclo DESC
    `, [id_personal]);
    res.json(ciclos);
  } catch (error) {
    console.error(`Error fetching cycles for personal ${id_personal}:`, error);
    res.status(500).json({ success: false, message: 'Error fetching cycles for personal', error: error.message });
  }
});

// Fetch historical comments for a personal and cycle
router.get('/historico-comments-director/:id_personal/:ciclo', async (req, res) => {
  const { id_personal, ciclo } = req.params;
  const { type } = req.query;
  if (!id_personal || !ciclo || !type) return res.status(400).json({ success: false, message: 'id_personal, ciclo y type son requeridos' });

  const isPositive = type === 'positive' ? 1 : 0;
  const queries = [
    // Comentario_Docente_Historico
    `SELECT CONCAT(a.nombre_alumno, ' ', a.apaterno_alumno, ' ', a.amaterno_alumno, ' (Grupo ', gg.grupo, ')') AS commenter, cd.comentario_docente as comment 
    FROM Comentario_Docente_Historico cd 
    JOIN Alumno_Historico a ON cd.id_alumno = a.id_alumno AND cd.ciclo = a.ciclo
    JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
    WHERE cd.id_personal = ? AND cd.tipo_comentario = ? AND cd.ciclo = ?`,
    // Comentario_Docente_Ingles_Historico
    `SELECT CONCAT(a.nombre_alumno, ' ', a.apaterno_alumno, ' ', a.amaterno_alumno, ' (Grupo ', gg.grupo, ')') AS commenter, cdi.comentario_docente_ingles as comment 
    FROM Comentario_Docente_Ingles_Historico cdi 
    JOIN Alumno_Historico a ON cdi.id_alumno = a.id_alumno AND cdi.ciclo = a.ciclo
    JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
    WHERE cdi.id_personal = ? AND cdi.tipo_comentario = ? AND cdi.ciclo = ?`,
    // Comentario_Docente_Arte_Historico
    `SELECT CONCAT(a.nombre_alumno, ' ', a.apaterno_alumno, ' ', a.amaterno_alumno, ' (Grupo ', gg.grupo, ')') AS commenter, cda.comentario_docente_arte as comment 
    FROM Comentario_Docente_Arte_Historico cda 
    JOIN Alumno_Historico a ON cda.id_alumno = a.id_alumno AND cda.ciclo = a.ciclo
    JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
    WHERE cda.id_personal = ? AND cda.tipo_comentario = ? AND cda.ciclo = ?`,
    // Comentario_Taller_Historico
    `SELECT CONCAT(a.nombre_alumno, ' ', a.apaterno_alumno, ' ', a.amaterno_alumno, ' (Grupo ', gg.grupo, ')') AS commenter, ct.comentario_taller as comment 
    FROM Comentario_Taller_Historico ct 
    JOIN Alumno_Historico a ON ct.id_alumno = a.id_alumno AND ct.ciclo = a.ciclo
    JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
    WHERE ct.id_personal = ? AND ct.tipo_comentario = ? AND ct.ciclo = ?`,
    // Comentario_Counselor_Historico
    `SELECT CONCAT(a.nombre_alumno, ' ', a.apaterno_alumno, ' ', a.amaterno_alumno, ' (Grupo ', gg.grupo, ')') AS commenter, cc.comentario_counselor as comment 
    FROM Comentario_Counselor_Historico cc 
    JOIN Alumno_Historico a ON cc.id_alumno = a.id_alumno AND cc.ciclo = a.ciclo
    JOIN Grado_Grupo gg ON a.id_grado_grupo = gg.id_grado_grupo 
    WHERE cc.id_personal = ? AND cc.tipo_comentario = ? AND cc.ciclo = ?`,
    // Comentario_Personal_Historico (staff comments)
    `SELECT CONCAT(p.nombre_personal, ' ', p.apaterno_personal, ' ', p.amaterno_personal) AS commenter, cp.comentario_personal as comment 
    FROM Comentario_Personal_Historico cp 
    JOIN Evaluador e ON cp.id_evaluador = e.id_evaluador 
    JOIN Personal_Historico p ON e.id_personal = p.id_personal AND cp.ciclo = p.ciclo 
    WHERE cp.id_personal = ? AND cp.tipo_comentario = ? AND cp.ciclo = ?`,
    // Add similar for other comment tables if needed (e.g., Comentario_Servicio_Historico, etc.)
  ];

  try {
    let allComments = [];
    for (const query of queries) {
      const [results] = await db.query(query, [id_personal, isPositive, ciclo]);
      allComments = allComments.concat(results);
    }
    res.json({ success: true, comments: allComments });
  } catch (error) {
    console.error('Error al obtener comentarios:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.', error: error.message });
  }
});



//FIN RUTAS DE HISTORICO

  //NUEVAS RUTAS 
  // GET /grupos/:id/materias => materias asignadas al grupo con detalle (incluye arte/ingles aunque no estén en Grupo_Materia)
router.get('/grupos/:id/materias', authMiddleware, async (req, res) => {
  const { id } = req.params; // id_grado_grupo
  let connection;
  try {
    // 1) Filas base desde Grupo_Materia
    const [gmRows] = await db.query(`
      SELECT 
        gm.id_grado_grupo,
        gm.id_materia,
        m.nombre_materia,
        m.modelo_materia,
        m.grado_materia,
        a.nombre_academia,
        gm.id_personal,
        p.nombre_personal,
        p.apaterno_personal,
        p.amaterno_personal,
        pni.id_nivel_ingles,
        ni.nombre_nivel_ingles
      FROM Grupo_Materia gm
      JOIN Materia m ON gm.id_materia = m.id_materia
      LEFT JOIN Academia a ON m.id_academia = a.id_academia
      LEFT JOIN Personal p ON gm.id_personal = p.id_personal
      -- nivel de inglés vinculado al mismo (personal, grupo, materia)
      LEFT JOIN Personal_Nivel_Ingles pni 
        ON pni.id_personal = gm.id_personal 
        AND pni.id_grado_grupo = gm.id_grado_grupo 
        AND pni.id_materia = gm.id_materia
      LEFT JOIN Nivel_Ingles ni ON pni.id_nivel_ingles = ni.id_nivel_ingles
      WHERE gm.id_grado_grupo = ?
      ORDER BY m.nombre_materia, p.apaterno_personal, p.nombre_personal
    `, [id]);

    // 2) Agrupar por materia
    const grouped = {};
    for (const r of gmRows) {
      const idMateria = r.id_materia;
      if (!grouped[idMateria]) {
        grouped[idMateria] = {
          id_materia: idMateria,
          nombre_materia: r.nombre_materia,
          modelo_materia: r.modelo_materia,
          grado_materia: r.grado_materia,
          nombre_academia: r.nombre_academia,
          asignaciones: []
        };
      }

      // Si existe id_personal, añadimos la asignación
      if (r.id_personal) {
        // Evitar duplicados exactos (mismo personal + mismo nivel de inglés)
        const personaKey = `${r.id_personal}::${r.id_nivel_ingles || 'null'}`;
        const asignaciones = grouped[idMateria].asignaciones;
        if (!asignaciones.find(a => a.__key === personaKey)) {
          asignaciones.push({
            __key: personaKey, // sólo para deduplicar en el server; se quitará antes de enviar
            id_personal: r.id_personal,
            nombre_personal: [r.nombre_personal, r.apaterno_personal, r.amaterno_personal].filter(Boolean).join(' '),
            id_nivel_ingles: r.id_nivel_ingles || null,
            nombre_nivel_ingles: r.nombre_nivel_ingles || null
          });
        }
      } else {
        // Si no hay personal (materias sin asignación), añadir un placeholder
        if (grouped[idMateria].asignaciones.length === 0) {
          grouped[idMateria].asignaciones.push({
            __key: `no_personal_${idMateria}`,
            id_personal: null,
            nombre_personal: null,
            id_nivel_ingles: null,
            nombre_nivel_ingles: null
          });
        }
      }
    }

    // Limpiar claves internas __key antes de enviar
    const materias = Object.values(grouped).map(m => {
      m.asignaciones = m.asignaciones.map(a => {
        const copy = { ...a };
        delete copy.__key;
        return copy;
      });
      return m;
    });

    res.json({ success: true, materias });
  } catch (error) {
    console.error('Error al obtener materias por grupo:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener materias por grupo' });
  } finally {
    if (connection && connection.release) connection.release();
  }
});

// router.get('/grupos', ...)
router.get('/grupos-materias', authMiddleware, async (req, res) => {
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
      FROM Grado_Grupo gg
      WHERE gg.grado IN (?)
      AND (
        EXISTS (SELECT 1 FROM Grupo_Materia gm WHERE gm.id_grado_grupo = gg.id_grado_grupo)
        OR EXISTS (SELECT 1 FROM Personal_Arte_Especialidad pa WHERE pa.id_grado_grupo = gg.id_grado_grupo)
        OR EXISTS (SELECT 1 FROM Personal_Nivel_Ingles pn WHERE pn.id_grado_grupo = gg.id_grado_grupo)
      )
      ORDER BY gg.grado, gg.grupo
    `, [GradosActivos]);

    res.json({ success: true, grupos });
  } catch (error) {
    console.error('Error al obtener grupos en curso:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

  // POST /personal/:id/photo
router.post('/personal/:id/photo', upload.single('foto'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!req.file) return res.status(400).json({ success: false, message: 'Archivo no recibido' });

    if (!['image/jpeg', 'image/png'].includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Tipo de archivo no permitido' });
    }

    const folder = 'prepa_personal';
    const publicId = `person_${id}`;

    const uploadStream = cloudinary.uploader.upload_stream({
      folder,
      public_id: publicId,
      overwrite: true,
      resource_type: 'image',
      transformation: [{ width: 800, height: 800, crop: 'limit' }]
    }, async (error, result) => {
      if (error) {
        console.error('Cloudinary error:', error);
        return res.status(500).json({ success: false, message: 'Error subiendo imagen' });
      }

      // Guardar URL en la BD
      const fotoUrl = result.secure_url;
      try {
        const sql = 'UPDATE Personal SET img_personal = ? WHERE id_personal = ?';
        await db.execute(sql, [fotoUrl, id]);
      } catch (dbErr) {
        console.error('Error guardando en BD:', dbErr);
        return res.status(500).json({ success: false, message: 'Error guardando la URL en la BD' });
      }

      return res.json({ success: true, url: fotoUrl, public_id: result.public_id });
    });

    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);

  } catch (err) {
    console.error('Error en /personal/:id/photo', err);
    res.status(500).json({ success: false, message: 'Error interno' });
  }
});

// HACER CIERRE DE CICLO
router.post('/guardarDatosCiclo', authMiddleware, async (req, res) => {
  const { ciclo } = req.body;
  let query = '';

  const tablasReinicio = [ // TABLAS QUE SE GUARDAN Y SE REINICIAN
    'Resultado_Kpi',
    'Respuesta_Alumno_Docente',
    'Respuesta_Alumno_Docente_Ingles',
    'Respuesta_Alumno_Docente_Arte',
    'Respuesta_Alumno_Servicio',
    'Respuesta_Alumno_Taller',
    'Respuesta_Alumno_Counselor',
    'Respuesta_Personal',
    'Respuesta_Alumno_Psicopedagogico',
    'Respuesta_Alumno_Disciplina_Deportiva',
    'Respuesta_Alumno_Liga_Deportiva',
    'Comentario_Docente',
    'Comentario_Docente_Ingles',
    'Comentario_Docente_Arte',
    'Comentario_Servicio',
    'Comentario_Taller',
    'Comentario_Counselor',
    'Comentario_Personal',
    'Comentario_Psicopedagogico',
    'Comentario_Disciplina_Deportiva',
    'Comentario_Liga_Deportiva',
    'Personal_360' // SE LLENA AL AZAR NUEVAMENTE (YA)
  ];

  const tablasGuardado = [ // TABLAS QUE SOLO SE GUARDARA PERO QUEDARAN IGUAL O CON UN PEQUEÑO CAMBIO 
    'Personal_Taller',
    'Alumno', // PASAR A ALUMNOS DE GRADO (YA) Y DAR DE BAJA EN CASO DE ESTAR EN 6TO Y PASAR A "7MO" (YA)
    'Personal',
    'Evaluador_Kpi',
    'Personal_Par', // ESTADO DE EVALUACION A 0 (YA)
    'Alumno_Nivel_Ingles', // NULL ID_PERSONAL (YA), ESTADO EN 0  (YA) Y PASAR ID_MATERIA (YA)
    'Alumno_Servicio', // PONER ESTADO EVALUACION EN 0 SOLO SI NO SE DIO DE BAJA (YA)
    'Grupo_Materia', // SE PONE NULL ID_PERSONAL Y HORAS_MATERIA (YA)
    'Alumno_Arte_Especialidad', // NULL ID_PERSONAL (YA), ID_ARTE_ESPECIALIDAD EN (YA),ESTADO EN 0 (YA), PASAR ID_MATERIA SI ES 4TO YA NO / (CHECAR CON LOS DE PRIMERO QUE JALE BIEN)
    'Alumno_Materia', // PONER ID_MATERIAS DE SU NUEVO GRADO, ID_PERSONAL EN NULL  Y ESTADO EN 0 (YA)
    'Personal_Nivel_Ingles', // PONER EN NULL ID_NIVEL_INGLES (NO), NULL ID_GRADO_GRUPO (NO), NULL ID_MATERIA (YA)
    'Personal_Jefe', // PONER ESTADO EN 0
    'Personal_Subordinado', // PONER ESTADO EN 0
  ];

  try {
    for (const tabla of tablasReinicio) {
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

    for (const tabla of tablasGuardado) {
      const historico = `${tabla}_Historico`;

      const insertQuery = `
        INSERT INTO ${historico}
        SELECT *, ? AS ciclo, NOW() AS fecha_respaldo
        FROM ${tabla};
      `;
      await db.query(insertQuery, [ciclo]);
    }

    // PASAR ALUMNOS DE GRADO
    query = 'SELECT a.id_alumno, gg.grado, gg.grupo FROM Alumno a , Grado_Grupo gg WHERE a.id_grado_grupo = gg.id_grado_grupo';
    const [gradoGrupoAlumnos] = await db.query(query); // TRAER CADA ID ALUMNO CON SU GRADO Y GRUPO 
    gradoGrupoAlumnos.forEach(async gradoGrupoAlumno => {
      console.log(gradoGrupoAlumno.grado);
      console.log(gradoGrupoAlumno.grupo);
      console.log(gradoGrupoAlumno.id_alumno);
      if (gradoGrupoAlumno.grado < 6 ){ // EN CASO DE QUE NO SEA DE 6TO
        query = 'SELECT gg.id_grado_grupo FROM Grado_Grupo gg WHERE gg.grado = ? AND gg.grupo = ?' // OBTENER EL ID_GRADO_GRUPO QUE SE LE PONDRA COMO NUEVO AL ALUMNO
        const [idGradoGrupoNuevo] = await db.query(query,[Number(gradoGrupoAlumno.grado) + 1 ,gradoGrupoAlumno.grupo]);

        query ='UPDATE Alumno set id_grado_grupo = ? WHERE id_alumno = ?' // AQTUALIZAR ID_GRADO_GRUPO
        await db.query(query,[idGradoGrupoNuevo[0].id_grado_grupo,gradoGrupoAlumno.id_alumno]);

        query  = 'SELECT m.modelo_materia FROM Materia m WHERE m.id_materia = (SELECT anl.id_materia FROM Alumno_Nivel_Ingles anl WHERE anl.id_alumno = ?)'; // SABER QUE MODELO EDUCATIVO ES EL INGLES ACTUAL QUE LLEVA
        const [modeloUsado] = await db.query(query,gradoGrupoAlumno.id_alumno);

        query = 'SELECT m.id_materia FROM Materia m WHERE m.modelo_materia = ? AND m.grado_materia = ? AND m.id_academia = 3' // SABER EL ID DE MATEIRA DE EL INGLES SIGUIENTE QUE DEBE DE TENER
        const [idMateriaIngles] = await db.query(query,[modeloUsado[0].modelo_materia, Number(gradoGrupoAlumno.grado) + 1]);

        query = 'UPDATE Alumno_Nivel_Ingles set id_materia = ?, id_personal=null, estado_evaluacion_nivel_ingles=0 WHERE id_alumno = ?'; // ACTUALIZAR EL ID_MATERIA A LA NUEVA DE INGLES QUE LE CORRESPONDE, PONER ID_PERSONAL EN NULL Y ESTADO EN 0
        await db.query(query,[Number(idMateriaIngles[0].id_materia),gradoGrupoAlumno.id_alumno]);

        query = 'UPDATE Alumno_Servicio set estado_evaluacion_servicio = 0 WHERE id_alumno = ?'; // PONER ESTADO EN 0 EN SERVICIOS ALUMNO
        await db.query(query,[gradoGrupoAlumno.id_alumno]);

        if (gradoGrupoAlumno.grado < 3 ) { // PARA ACTUALIZAR ARTE DE ALUMNOS
          query  = 'SELECT m.modelo_materia FROM Materia m WHERE m.id_materia = (SELECT aae.id_materia FROM Alumno_Arte_Especialidad aae WHERE aae.id_alumno = ?)'; // SABER QUE MODELO EDUCATIVO ES LA MATERIA DE ARTE QUE LLEVA
          const [modeloUsadoArte] = await db.query(query,gradoGrupoAlumno.id_alumno);

          query = `SELECT m.id_materia FROM Materia m WHERE m.modelo_materia = ? AND m.grado_materia = ? AND m.nombre_materia LIKE '%ARTE%'` // SABER EL ID DE MATEIRA DE ARTE SIGUIENTE QUE DEBE DE TENER
          const [idMateriaArte] = await db.query(query,[modeloUsadoArte[0].modelo_materia, Number(gradoGrupoAlumno.grado) + 1]);

          query = 'UPDATE Alumno_Arte_Especialidad set id_materia = ?, id_personal=null, id_arte_especialidad = null, estado_evaluacion_arte_especialidad = 0 WHERE id_alumno = ?'; // ACTUALIZAR EL ID_MATERIA A LA NUEVA DE INGLES QUE LE CORRESPONDE, PONER ID_PERSONAL EN NULL Y ESTADO EN 0
          await db.query(query,[Number(idMateriaArte[0].id_materia),gradoGrupoAlumno.id_alumno]);
        }

        // PONER AL ALUMO SUS NUEVAS MATERIAS PERO CON ID_PERSONAL EN NULL
        query = 'SELECT m.id_materia FROM Materia m WHERE m.grado_materia = ? AND m.modelo_materia = ?';
        const [materias] = await db.query(query, [Number(gradoGrupoAlumno.grado) + 1,modeloUsado[0].modelo_materia]);
        materias.forEach(async materia => {
          query = 'UPDATE Alumno_Materia set id_materia = ?, id_personal = null, estado_evaluacion_materia = 0 WHERE id_alumno = ?';
          await db.query(query,[materia.id_materia,gradoGrupoAlumno.id_alumno ]);
        });
      }else{
        query = 'UPDATE Alumno set estado_alumno=0 WHERE id_alumno = ?'; // ACTUALIZAR ESTADO A 0 EN ALUMNO
        await db.query(query,[gradoGrupoAlumno.id_alumno]);

        query = "SELECT a.id_usuario FROM Alumno a WHERE a.id_alumno = ?"; // OBTENER EL ID_USUARIO DEL ALUMNO
        const [idUsuario] = await db.query(query,[gradoGrupoAlumno.id_alumno]);
        console.log('ididididi',idUsuario[0].id_usuario);

        query = 'UPDATE Usuario set estado_usuario = 0 WHERE id_usuario  = ?'; // ACTUALIZAR ESTADO A 0 EN USUARIO 
        await db.query(query,[idUsuario]);
      }
    });

    // LLENAR AL AZAR NUEVAMENTE Personal_360
    const [personal] = await db.query('SELECT id_personal FROM Personal WHERE estado_personal = 1'); 
    function getRandom(arr, n, exclude) { const filtered = arr.filter(p => p.id_personal !== exclude); // excluirse a sí mismo 
      const shuffled = [...filtered].sort(() => 0.5 - Math.random()); return shuffled.slice(0, n); 
    } 
    let Nuevos360 = []; 
    for (const p of personal) { const seleccionados = getRandom(personal, 5, p.id_personal); 
      Nuevos360 = seleccionados.map(seleccionado => [ p.id_personal, seleccionado.id_personal, 0 ]); 
      await db.query('INSERT INTO Personal_360 (id_evaluador, id_personal, estado_evaluacion_360) VALUES ?',[Nuevos360]); 
    }

    // ESTADO DE EVALUACION 0 EN PARES
    query  = 'SELECT * FROM Personal_Par';
    const [pares] = await db.query(query);
    pares.forEach(async par => {
      query = 'UPDATE Personal_Par set estado_evaluacion_par = 0';
      await db.query(query);
    });

    // CAMBIOS EN Grupo_Materia / PONER EN NULL ID_PERSONA 
    query = 'SELECT * FROM Grupo_Materia';
    const [materias] = await db.query(query); 
    materias.forEach(async element => {
      query = 'UPDATE Grupo_Materia set id_personal = null';
      await db.query(query);
    });

    // ACTUALIZAR Personal_Nivel_Ingles
    query = 'UPDATE Personal_Nivel_Ingles set id_nivel_ingles = null, id_grado_grupo = null, id_materia = null';
    await db.query(query);

    // ACTUALIZAR Personal_Jefe PONIENDO EL ESTADO DE EVALUACION EN 0
    query = 'UPDATE Personal_Jefe set estado_evaluacion_jefe = 0';
    await db.query(query);

    // ACTUALIZAR Personal_Subordinado PONIENDO EL ESTADO DE EVALUACION EN 0
    query = 'UPDATE Personal_Subordinado set estado_evaluacion_subordinado = 0';
    await db.query(query);

    res.json({ success: true, message: 'Ciclo cerrado correctamente!' });

    } catch (error) {
      console.error('Error al cerrar ciclo:', error);
      res.status(500).json({ success: false, message: 'Error en el servidor. Intenta más tarde' });
    }
  });


  // OBTENER JEFES ACTUALES DE LA PERSONA + TODAS LAS PERSONAS PARA SELECCIONAR NUEVO JEFE
  router.get('/getJefe/:id_personal', authMiddleware, async (req, res) => { 
    const id_personal = req.params.id_personal;

    // 1. Obtener todos los jefes de esa persona (puede tener varios)
    const query = `
      SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal
      FROM Personal p
      WHERE p.id_personal IN (
        SELECT pj.id_personal 
        FROM Personal_Jefe pj 
        WHERE pj.id_evaluador = ?
      )
    `;

    // 2. Obtener todas las personas para que el usuario pueda elegir
    const query2 = `
      SELECT p.id_personal, p.nombre_personal, p.apaterno_personal, p.amaterno_personal 
      FROM Personal p
    `;

    try {
      const [jefes] = await db.query(query, [id_personal]);
      const [personas] = await db.query(query2);

      res.json({ success: true, jefes, personas });
    } catch (error) {
      console.error('Error al obtener jefes:', error);
      res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
  });
  
  // ASIGNAR JEFES Y PONERLO COMO SUBORDINADO
  router.post('/asignarJefe', authMiddleware, async (req, res) => {
    const { id_evaluador, jefes } = req.body;

    if (!Array.isArray(jefes)) {
      return res.status(400).json({ success: false, message: 'Formato inválido: jefes debe ser un array.' });
    }

    let connection;
    try {
      // Iniciar una transacción
      connection = await db.getConnection();
      await connection.beginTransaction();

      // 1. Validar que id_evaluador no esté en el array de jefes (evitar autoasignación)
      if (jefes.includes(id_evaluador.toString())) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'No puedes asignarte como tu propio jefe.' });
      }

      // 2. Validar que los IDs de jefes existan en la tabla Personal
      if (jefes.length > 0) {
        const [validJefes] = await connection.query(
          'SELECT id_personal FROM Personal WHERE id_personal IN (?)',
          [jefes]
        );
        const validIds = validJefes.map(j => j.id_personal.toString());
        const invalidIds = jefes.filter(id => !validIds.includes(id.toString()));
        if (invalidIds.length > 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: `IDs de jefes inválidos: ${invalidIds.join(', ')}` });
        }
      }

      // 3. Borrar los jefes actuales del evaluador en Personal_Jefe
      await connection.query('DELETE FROM Personal_Jefe WHERE id_evaluador = ?', [id_evaluador]);

      // 4. Borrar las entradas en Personal_Subordinado donde id_evaluador aparece como subordinado
      // Esto elimina todas las relaciones previas donde id_evaluador era subordinado de cualquier jefe
      await connection.query('DELETE FROM Personal_Subordinado WHERE id_personal = ?', [id_evaluador]);

      // 5. Insertar los nuevos jefes en Personal_Jefe
      for (const id_personal of jefes) {
        await connection.query('INSERT INTO Personal_Jefe (id_personal, id_evaluador) VALUES (?, ?)', [id_personal, id_evaluador]);
      }

      // 6. Insertar el evaluador como subordinado de cada jefe en Personal_Subordinado
      for (const id_personal of jefes) {
        await connection.query('INSERT INTO Personal_Subordinado (id_evaluador, id_personal) VALUES (?, ?)', [id_personal, id_evaluador]);
      }

      // Confirmar la transacción
      await connection.commit();
      res.json({ success: true, message: 'Jefes y subordinados asignados correctamente' });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error al asignar jefes:', error);
      res.status(500).json({ success: false, message: 'Error en el servidor. Intenta más tarde' });
    } finally {
      if (connection) connection.release();
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

