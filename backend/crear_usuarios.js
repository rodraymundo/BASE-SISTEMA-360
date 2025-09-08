// backend/crear_usuarios_batch_hash_after.js
const pool = require('./config/db'); // ajusta la ruta si tu config está en otra carpeta
const bcrypt = require('bcryptjs');
function normalizeString(s = '') {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

async function ensureUniqueLocalInSet(local, existingSet) {
  if (!existingSet.has(local)) {
    existingSet.add(local);
    return local;
  }
  let i = 1;
  while (existingSet.has(local + i)) {
    i++;
  }
  const candidate = local + i;
  existingSet.add(candidate);
  return candidate;
}

async function isUsuarioReferencedElsewhere(conn, userId, exclude) {
  // exclude = { table: 'Alumno'|'Personal', idField: 'id_alumno'|'id_personal', idValue: <number> }
  const [r1] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM Alumno WHERE id_usuario = ? AND NOT (id_alumno = ?)",
    [userId, exclude.table === 'Alumno' ? exclude.idValue : 0]
  );
  const [r2] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM Personal WHERE id_usuario = ? AND NOT (id_personal = ?)",
    [userId, exclude.table === 'Personal' ? exclude.idValue : 0]
  );
  const cnt = (r1[0].cnt || 0) + (r2[0].cnt || 0);
  return cnt > 0;
}

async function main() {
  const conn = await pool.getConnection();

  try {
    console.log('Conectando a la base de datos...');
    await conn.beginTransaction();

    // Traer correos ya existentes
    const [rowsExisting] = await conn.query("SELECT id_usuario, correo_usuario FROM Usuario");
    const existingEmails = new Map(rowsExisting.map(r => [ (r.correo_usuario || '').toLowerCase(), r.id_usuario ]));
    const existingLocals = new Set([...existingEmails.keys()].map(e => e.split('@')[0]));

    const createdMap = []; // guardará contraseñas en texto plano (ten cuidado)
    let createdCount = 0;

    // ---------- ALUMNOS ----------
    const [alumnos] = await conn.query("SELECT id_alumno, id_usuario FROM Alumno");
    for (const a of alumnos) {
      const currentUserId = a.id_usuario || null;
      const localBase = String(a.id_alumno);
      let chosenLocal = localBase;
      let correoCandidate = `${chosenLocal}@balmoralescoces.edu.mx`.toLowerCase();
      let assignedUserId = null;

      while (true) {
        const existingId = existingEmails.get(correoCandidate);
        if (!existingId) {
          // no existe usuario con ese correo -> creamos
          const plain = 'pass' + chosenLocal;
          // INSERTAMOS la contraseña en texto plano tal como pediste
          const [ins] = await conn.query(
            "INSERT INTO Usuario (correo_usuario, contraseña_usuario, estado_usuario) VALUES (?, ?, 1)",
            [correoCandidate, plain]
          );
          assignedUserId = ins.insertId;
          existingEmails.set(correoCandidate, assignedUserId);
          existingLocals.add(chosenLocal);
          createdCount++;
          createdMap.push({ tipo: 'alumno', id_alumno: a.id_alumno, correo: correoCandidate, contraseña: plain, id_usuario: assignedUserId });
          break;
        } else {
          // existe un usuario con ese correo
          const referencedElsewhere = await isUsuarioReferencedElsewhere(conn, existingId, { table: 'Alumno', idField: 'id_alumno', idValue: a.id_alumno });
          if (!referencedElsewhere) {
            assignedUserId = existingId;
            break;
          } else {
            chosenLocal = await ensureUniqueLocalInSet(chosenLocal, existingLocals);
            correoCandidate = `${chosenLocal}@balmoralescoces.edu.mx`.toLowerCase();
            continue;
          }
        }
      }

      // actualizar Alumno.id_usuario si es distinto
      if (assignedUserId && assignedUserId !== currentUserId) {
        const oldId = currentUserId;
        await conn.query("UPDATE Alumno SET id_usuario = ? WHERE id_alumno = ?", [assignedUserId, a.id_alumno]);

        if (oldId && oldId !== 0 && oldId !== assignedUserId) {
          const stillReferenced = await isUsuarioReferencedElsewhere(conn, oldId, { table: 'Alumno', idField: 'id_alumno', idValue: a.id_alumno });
          if (!stillReferenced) {
            await conn.query("DELETE FROM Usuario WHERE id_usuario = ?", [oldId]);
            console.log(`Eliminado usuario antiguo id ${oldId} (ya no referenciado).`);
            for (const [c, idu] of existingEmails.entries()) {
              if (idu === oldId) {
                existingEmails.delete(c);
                existingLocals.delete(c.split('@')[0]);
                break;
              }
            }
          }
        }
      }
    } // end for alumnos

    // ---------- PERSONAL ----------
    const [personalRows] = await conn.query("SELECT id_personal, nombre_personal, apaterno_personal, id_usuario FROM Personal");
    for (const p of personalRows) {
      const currentUserId = p.id_usuario || null;
      const nombre = (p.nombre_personal || '').trim();
      const apaterno = (p.apaterno_personal || '').trim();

      // construir local base
      const firstNameToken = (nombre.split(/\s+/)[0] || '');
      let firstChar = normalizeString(firstNameToken).charAt(0) || '';
      let ap = normalizeString(apaterno || '');
      if (!ap) ap = normalizeString((nombre.split(/\s+/)[1] || nombre.split(/\s+/)[0] || ''));
      if (!firstChar) firstChar = ap.charAt(0) || 'x';
      let localBase = (firstChar + ap).toLowerCase();
      if (!localBase) localBase = 'user' + p.id_personal;

      let chosenLocal = localBase;
      let correoCandidate = `${chosenLocal}@balmoralescoces.edu.mx`.toLowerCase();
      let assignedUserId = null;

      while (true) {
        const existingId = existingEmails.get(correoCandidate);
        if (!existingId) {
          // crear usuario nuevo (guardando contraseña en texto plano)
          const plain = 'pass' + chosenLocal;
          const [ins] = await conn.query(
            "INSERT INTO Usuario (correo_usuario, contraseña_usuario, estado_usuario) VALUES (?, ?, 1)",
            [correoCandidate, plain]
          );
          assignedUserId = ins.insertId;
          existingEmails.set(correoCandidate, assignedUserId);
          existingLocals.add(chosenLocal);
          createdCount++;
          createdMap.push({ tipo: 'personal', id_personal: p.id_personal, correo: correoCandidate, contraseña: plain, id_usuario: assignedUserId });
          break;
        } else {
          const referencedElsewhere = await isUsuarioReferencedElsewhere(conn, existingId, { table: 'Personal', idField: 'id_personal', idValue: p.id_personal });
          if (!referencedElsewhere) {
            assignedUserId = existingId;
            break;
          } else {
            chosenLocal = await ensureUniqueLocalInSet(chosenLocal, existingLocals);
            correoCandidate = `${chosenLocal}@balmoralescoces.edu.mx`.toLowerCase();
            continue;
          }
        }
      }

      // actualizar Personal.id_usuario si es distinto
      if (assignedUserId && assignedUserId !== currentUserId) {
        const oldId = currentUserId;
        await conn.query("UPDATE Personal SET id_usuario = ? WHERE id_personal = ?", [assignedUserId, p.id_personal]);

        if (oldId && oldId !== 0 && oldId !== assignedUserId) {
          const stillReferenced = await isUsuarioReferencedElsewhere(conn, oldId, { table: 'Personal', idField: 'id_personal', idValue: p.id_personal });
          if (!stillReferenced) {
            await conn.query("DELETE FROM Usuario WHERE id_usuario = ?", [oldId]);
            console.log(`Eliminado usuario antiguo id ${oldId} (ya no referenciado).`);
            for (const [c, idu] of existingEmails.entries()) {
              if (idu === oldId) {
                existingEmails.delete(c);
                existingLocals.delete(c.split('@')[0]);
                break;
              }
            }
          }
        }
      }
    } // end for personal

    // ------ Ahora: hasheamos en lote todas las contraseñas que NO parecen bcrypt ------
    console.log('Iniciando paso final: hashear contraseñas en texto plano...');

    // Selecciona usuarios cuya contraseña NO empieza por $2 (bcrypt)
    const [toHash] = await conn.query("SELECT id_usuario, contraseña_usuario FROM Usuario WHERE contraseña_usuario IS NOT NULL AND contraseña_usuario NOT LIKE '$2%'");
    console.log(`Encontrados ${toHash.length} usuarios con contraseña no-hasheada (potencialmente en texto plano).`);

    let hashedCount = 0;
    for (const u of toHash) {
      const plain = u.contraseña_usuario;
      if (!plain || plain.length === 0) {
        console.log(`Skipping id ${u.id_usuario} porque contraseña vacía/null.`);
        continue;
      }
      const hash = await bcrypt.hash(plain, 10);
      await conn.query("UPDATE Usuario SET contraseña_usuario = ? WHERE id_usuario = ?", [hash, u.id_usuario]);
      hashedCount++;
    }

    // ------ Paso extra: asignar permisos especiales a amontes ------
    console.log('Asignando permisos a amontes@balmoralescoces.edu.mx...');
    const [rowsAmontes] = await conn.query(
      "SELECT id_usuario FROM Usuario WHERE correo_usuario = ?",
      ["amontes@balmoralescoces.edu.mx"]
    );

    if (rowsAmontes.length > 0) {
      const idAmontes = rowsAmontes[0].id_usuario;

      // Revisar si ya existe registro en Permisos
      const [permRows] = await conn.query(
        "SELECT id_usuario FROM Permisos WHERE id_usuario = ?",
        [idAmontes]
      );

      if (permRows.length > 0) {
        // UPDATE
        await conn.query(
          `UPDATE Permisos 
           SET permiso_personal_dir_general = 1, 
               permiso_permisos_dir_general = 1, 
               permiso_historico_dir_general = 1
           WHERE id_usuario = ?`,
          [idAmontes]
        );
        console.log("Permisos de amontes actualizados correctamente.");
      } else {
        // INSERT
        await conn.query(
          `INSERT INTO Permisos 
           (id_usuario, permiso_personal_dir_general, permiso_permisos_dir_general, permiso_historico_dir_general) 
           VALUES (?, 1, 1, 1)`,
          [idAmontes]
        );
        console.log("Permisos de amontes insertados correctamente.");
      }
    } else {
      console.log("⚠️ Usuario amontes@balmoralescoces.edu.mx no encontrado, no se asignaron permisos.");
    }

    await conn.commit();

    console.log('--- RESUMEN ---');
    console.log(`Usuarios creados: ${createdCount}`);
    console.log(`Usuarios hasheados en paso final: ${hashedCount}`);
    // ADVERTENCIA: createdMap contiene contraseñas en texto plano. Maneja con cuidado.
    console.table(createdMap);

    conn.release();
    console.log('Terminado con éxito.');
  } catch (err) {
    console.error('Error:', err);
    try { await conn.rollback(); } catch(e) {}
    try { conn.release(); } catch(e) {}
    process.exit(1);
  }
}

main();
