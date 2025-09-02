// backend/crear_usuarios.js
const pool = require('./config/db'); // ajusta la ruta si tu config está en otra carpeta
const bcrypt = require('bcrypt');

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

    // Traer correos ya existentes
    const [rowsExisting] = await conn.query("SELECT id_usuario, correo_usuario FROM Usuario");
    const existingEmails = new Map(rowsExisting.map(r => [ (r.correo_usuario || '').toLowerCase(), r.id_usuario ]));
    const existingLocals = new Set([...existingEmails.keys()].map(e => e.split('@')[0]));

    const createdMap = [];
    let createdCount = 0;

    // ---------- ALUMNOS ----------
    const [alumnos] = await conn.query("SELECT id_alumno, id_usuario FROM Alumno");
    for (const a of alumnos) {
      const currentUserId = a.id_usuario || null;
      const localBase = String(a.id_alumno);
      let chosenLocal = localBase;
      let correoCandidate = `${chosenLocal}@balmoralescoces.edu.mx`.toLowerCase();
      let assignedUserId = null;

      // Bucle para encontrar local/correo reutilizable o crear uno nuevo si está ocupado
      while (true) {
        const existingId = existingEmails.get(correoCandidate);
        if (!existingId) {
          // no existe usuario con ese correo -> creamos
          const plain = 'pass' + chosenLocal;
          const hash = await bcrypt.hash(plain, 10);
          const [ins] = await conn.query(
            "INSERT INTO Usuario (correo_usuario, contraseña_usuario, estado_usuario) VALUES (?, ?, 1)",
            [correoCandidate, hash]
          );
          assignedUserId = ins.insertId;
          // registrar en estructuras
          existingEmails.set(correoCandidate, assignedUserId);
          existingLocals.add(chosenLocal);
          createdCount++;
          createdMap.push({ tipo: 'alumno', id_alumno: a.id_alumno, correo: correoCandidate, contraseña: plain, id_usuario: assignedUserId });
          break;
        } else {
          // existe un usuario con ese correo
          // obtener si ese usuario está referenciado por otra fila distinta a esta
          const referencedElsewhere = await isUsuarioReferencedElsewhere(conn, existingId, { table: 'Alumno', idField: 'id_alumno', idValue: a.id_alumno });
          if (!referencedElsewhere) {
            // si no está referenciado por nadie más -> podemos reutilizarlo
            assignedUserId = existingId;
            // actualizar estructuras (no creado nuevo)
            break;
          } else {
            // ya está en uso por otra persona -> generar sufijo y probar otra local
            // usar ensureUniqueLocalInSet para mantener la coherencia con otros nuevos
            chosenLocal = await ensureUniqueLocalInSet(chosenLocal, existingLocals);
            correoCandidate = `${chosenLocal}@balmoralescoces.edu.mx`.toLowerCase();
            continue;
          }
        }
      } // end while

      // actualizar Alumno.id_usuario si es distinto
      if (assignedUserId && assignedUserId !== currentUserId) {
        // guarda el id viejo para posible limpieza
        const oldId = currentUserId;

        await conn.query("UPDATE Alumno SET id_usuario = ? WHERE id_alumno = ?", [assignedUserId, a.id_alumno]);

        // si había un id viejo y ya no es referenciado por nadie -> eliminar usuario viejo
        if (oldId && oldId !== 0 && oldId !== assignedUserId) {
          const stillReferenced = await isUsuarioReferencedElsewhere(conn, oldId, { table: 'Alumno', idField: 'id_alumno', idValue: a.id_alumno });
          if (!stillReferenced) {
            await conn.query("DELETE FROM Usuario WHERE id_usuario = ?", [oldId]);
            console.log(`Eliminado usuario antiguo id ${oldId} (ya no referenciado).`);
            // limpiar mapas
            // buscar correo del viejo para quitar de existingEmails si aparece
            for (const [c, idu] of existingEmails.entries()) {
              if (idu === oldId) {
                existingEmails.delete(c);
                existingLocals.delete(c.split('@')[0]);
                break;
              }
            }
          }
        }
      } // end update alumno
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
          // crear usuario nuevo
          const plain = 'pass' + chosenLocal;
          const hash = await bcrypt.hash(plain, 10);
          const [ins] = await conn.query(
            "INSERT INTO Usuario (correo_usuario, contraseña_usuario, estado_usuario) VALUES (?, ?, 1)",
            [correoCandidate, hash]
          );
          assignedUserId = ins.insertId;
          existingEmails.set(correoCandidate, assignedUserId);
          existingLocals.add(chosenLocal);
          createdCount++;
          createdMap.push({ tipo: 'personal', id_personal: p.id_personal, correo: correoCandidate, contraseña: plain, id_usuario: assignedUserId });
          break;
        } else {
          // existe usuario con ese correo, verificar referencias
          const referencedElsewhere = await isUsuarioReferencedElsewhere(conn, existingId, { table: 'Personal', idField: 'id_personal', idValue: p.id_personal });
          if (!referencedElsewhere) {
            assignedUserId = existingId;
            break;
          } else {
            // ocupado por otra persona => generar sufijo
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

    console.log('--- RESUMEN ---');
    console.log(`Usuarios creados/actualizados: ${createdCount}`);
    console.table(createdMap);

    conn.release();
    // opcional: await pool.end(); // si quieres cerrar pool
    console.log('Terminado con éxito.');
  } catch (err) {
    console.error('Error:', err);
    try { conn.release(); } catch (e) {}
    process.exit(1);
  }
}

main();
