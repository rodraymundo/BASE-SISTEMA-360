import { renderHeader } from '../assets/js/header.js';

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Error en la respuesta del servidor: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // nuevo selector para el list-group
  // nuevo selector para el list-group o fallback al accordion si cambiaste el HTML
  let listaMateriasList = document.getElementById('listaMateriasList');
  const gruposAccordion = document.getElementById('gruposAccordion');

  // si no existe listaMateriasList, usamos gruposAccordion como fallback
  if (!listaMateriasList && gruposAccordion) {
    listaMateriasList = gruposAccordion;
  }

  if (listaMateriasList) {
    listaMateriasList.innerHTML = '<div class="text-muted text-center py-3">Cargando materias...</div>';
  } else {
    console.warn('No se encontró ni #listaMateriasList ni #gruposAccordion en el DOM. Revisa tu HTML.');
  }


  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  try {
    const response = await fetch('/auth-check', { credentials: 'include' });
    if (!response.ok) throw new Error(`Error al verificar autenticación: ${response.status}`);
    const data = await response.json();
    if (!data.authenticated) {
      Swal.fire({
        title: 'Sesión Expirada',
        text: 'Por favor, inicie sesión nuevamente.',
        icon: 'warning',
        confirmButtonText: 'Ir al inicio'
      }).then(() => window.location.href = '/');
      return;
    }
    document.getElementById('header-container').appendChild(renderHeader(data.user));
  } catch (error) {
    console.error('Error verificando sesión:', error);
    Swal.fire({
      title: 'Error de Sesión',
      text: 'No se pudo verificar la sesión. Asegúrese de que el servidor esté corriendo.',
      icon: 'error',
      confirmButtonText: 'Ir al inicio'
    }).then(() => window.location.href = '/');
    return;
  }

  const materiaModal = new bootstrap.Modal(document.getElementById('materiaModal'));
  const asignarModal = new bootstrap.Modal(document.getElementById('asignarModal'));
  const arteEspecialidadModal = new bootstrap.Modal(document.getElementById('arteEspecialidadModal'));
  const materiaForm = document.getElementById('materiaForm');
  const asignarForm = document.getElementById('asignarForm');
  const arteEspecialidadForm = document.getElementById('arteEspecialidadForm');
  const modalTitle = document.getElementById('modalTitle');
  const asignarModalTitle = document.getElementById('asignarModalTitle');
  const addMateriaBtn = document.getElementById('addMateriaBtn');
  const addArteEspecialidadBtn = document.getElementById('addArteEspecialidadBtn');
  const buscadorMaterias = document.getElementById('buscadorMaterias');
  const idAcademiaSelect = document.getElementById('id_academia');
  const idRolSelect = document.getElementById('id_rol');
  const idPersonalSelect = document.getElementById('id_personal');
  const idGradoGrupoSelect = document.getElementById('id_grado_grupo');
  const idNivelInglesSelect = document.getElementById('id_nivel_ingles');
  const nivelInglesContainer = document.getElementById('nivel_ingles_container');
  const asignacionesContainer = document.getElementById('asignacionesContainer');
  const deleteMateriaBtn = document.getElementById('deleteMateriaBtn');
  const idRolArteSelect = document.getElementById('id_rol_arte');
  const idPersonalArteSelect = document.getElementById('id_personal_arte');

  // Inicializa el nuevo modal 
  const grupoModalEl = document.getElementById('grupoModal');
  const grupoModal = grupoModalEl ? new bootstrap.Modal(grupoModalEl) : null;
  const grupoModalTitle = document.getElementById('grupoModalTitle');
  const grupoModalBody = document.getElementById('grupoModalBody');
  const grupoModalSearch = document.getElementById('grupoModalSearch');
  const grupoModalRefresh = document.getElementById('grupoModalRefresh');


  let todasMaterias = [];
  let academias = [];
  let roles = [];
  let personal = [];
  let gradosGrupos = [];
  let nivelesIngles = [];
  let asignaciones = [];

  // attach once guard
let asignacionesHandlerAttached = false;
if (!asignacionesHandlerAttached && asignacionesContainer) {
  asignacionesContainer.addEventListener('click', async (e) => {
    const saveBtn = e.target.closest('.save-asign-btn');
    if (!saveBtn) return;

    const row = saveBtn.closest('.asignacion-row');
    if (!row) return;

    saveBtn.disabled = true;
    const select = row.querySelector('.select-asign-personal');
    const cancelBtn = row.querySelector('.cancel-asign-btn');
    if (select) select.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    const id_materia = row.dataset.id_materia;
    const id_grado_grupo = row.dataset.id_grado_grupo;
    const tipo = row.dataset.tipo; // 'ingles'|'arte'|'normal'
    const id_personal_original = row.dataset.id_personal_original || null;
    const id_nivel_ingles_original = row.dataset.id_nivel_ingles || null;
    const id_arte_especialidad_original = row.dataset.id_arte_especialidad || null;
    const horasOriginal = row.dataset.horas_materia ?? null;

    const nuevo_id_personal = select ? select.value : null;
    const horasInput = row.querySelector('.horas-asignacion-input');
    const nuevas_horas = horasInput ? horasInput.value : null;

    try {
      if (!nuevo_id_personal) {
        throw new Error('Selecciona un profesor válido.');
      }

      // si no cambió persona ni horas -> nada que hacer
      const sinCambioPersona = String(nuevo_id_personal) === String(id_personal_original);
      const cambioHoras = (typeof nuevas_horas !== 'undefined' && String(nuevas_horas) !== String(horasOriginal) && nuevas_horas !== '');
      if (sinCambioPersona && !cambioHoras) {
        Swal.fire('Sin cambios', 'No se detectaron cambios en esta asignación.', 'info');
        throw { silent:true };
      }

      // construir body para POST único (backend maneja delete/insert según tipo)
      const body = {
        id_personal: nuevo_id_personal,
        id_grado_grupo: id_grado_grupo
      };
      if (nuevas_horas !== null && nuevas_horas !== '') body.horas_materia = Number(nuevas_horas);

      if (tipo === 'ingles') body.id_nivel_ingles = id_nivel_ingles_original;
      if (tipo === 'arte') body.id_arte_especialidad = id_arte_especialidad_original;

      // token
      const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();

      // POST único — backend ya hace DELETE previo y INSERT nuevo (según tu ruta)
      const postRes = await fetch(`/materias/${id_materia}/asignaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const postJson = await postRes.json();
      if (!postRes.ok || !postJson.success) {
        throw new Error(postJson.message || 'No se pudo crear/actualizar la asignación.');
      }

      // recargar UI
      const isArteFlag = (tipo === 'arte');
      await cargarAsignaciones(id_materia, isArteFlag, id_grado_grupo);
      await cargarMaterias();
      mostrarGrupos();

      // re-render fila/modal
      const materiaObj = (window._materiaMap && window._materiaMap.get(String(id_materia))) || { id_materia, nombre_materia: '' };
      renderEditableAsignaciones(materiaObj, id_grado_grupo);

      Swal.fire('Éxito', postJson.message || 'Asignación actualizada', 'success');

    } catch (err) {
      if (err && err.silent) {
        // nada (sin cambios)
      } else {
        console.error('Error guardando asignación por fila:', err);
        Swal.fire('Error', err.message || 'No se pudo actualizar la asignación.', 'error');
      }
      // reactivar UI
      saveBtn.disabled = false;
      if (select) select.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
    }
  });

  asignacionesHandlerAttached = true;
}


async function cargarMaterias() {
  try {
    listaMateriasList.innerHTML = '<div class="text-muted text-center py-3">Cargando materias...</div>';
    const data = await fetchWithRetry('/materias', { credentials: 'include' });
    todasMaterias = Array.isArray(data.materias) ? data.materias : (data.materias || []);
    // normalizar: agregar array de ids de grupos y campo 'profesores_text' para facilitar uso en UI
    todasMaterias = todasMaterias.map(m => {
      const ids = (m.grupos_ids || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => String(s));
      // profesores_grupos viene como cadena; lo guardamos en profesores_text
      return {
        ...m,
        grupos_ids_array: ids,
        profesores_text: m.profesores_grupos || '' // cadena ya formateada por el servidor
      };
    });

    // mapa rápido por id_materia
    const materiaMap = new Map(todasMaterias.map(m => [String(m.id_materia), m]));
    // exportarlo a scope superior (si no existe ya) para que otras funciones lo usen:
    window._materiaMap = materiaMap; // o let materiaMap; en scope mayor si prefieres
  } catch (error) {
    console.error('Error al cargar materias:', error);
    listaMateriasList.innerHTML = '<div class="text-muted text-center py-3">No se pudo cargar las materias. Verifique que el servidor esté corriendo.</div>';
    Swal.fire({
      title: 'Error',
      text: error.message.includes('404') 
        ? 'El servidor no tiene configurada la lista de materias (/materias). Contacte al administrador.'
        : 'No se pudo conectar con el servidor. Asegúrese de que esté corriendo.',
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Reintentar',
      cancelButtonText: 'Ir al inicio'
    }).then(result => {
      if (result.isConfirmed) cargarMaterias();
      else window.location.href = '/';
    });
  }
}


  async function cargarAcademias() {
    try {
      const data = await fetchWithRetry('/academias', { credentials: 'include' });
      academias = Array.isArray(data.academias) ? data.academias : [];
      if (academias.length === 0) {
        idAcademiaSelect.innerHTML = '<option value="">No hay academias disponibles</option>';
        Swal.fire({
          title: 'Advertencia',
          text: 'No se encontraron academias.',
          icon: 'warning',
          confirmButtonText: 'Aceptar'
        });
      } else {
        idAcademiaSelect.innerHTML = '<option value="">Seleccione una academia</option>' +
          academias.map(a => `<option value="${a.id_academia}">${a.nombre_academia}</option>`).join('');
      }
    } catch (error) {
      console.error('Error al cargar academias:', error);
      idAcademiaSelect.innerHTML = '<option value="">Error al cargar academias</option>';
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de academias (/academias). Contacte al administrador.'
          : 'No se pudieron cargar las academias. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarAcademias();
        else window.location.href = '/';
      });
    }
  }

  async function cargarRoles() {
    try {
      roles = await fetchWithRetry('/roles', { credentials: 'include' });
    } catch (error) {
      console.error('Error al cargar roles:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudieron cargar los roles. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarRoles();
        else window.location.href = '/';
      });
    }
  }

  let todosLosGradosGrupos = []; // Nueva variable para guardar la lista maestra

  // 1) Cargar solo los grupos en curso desde el servidor (/grupos)
  async function cargarTODOSGradosGrupos() {
    try {
      const response = await fetchWithRetry('/grupos-materias', { credentials: 'include' });
      // tu endpoint responde { success: true, grupos: [...] } según lo que pusiste en el router
      const grupos = Array.isArray(response) ? response : (response.grupos || []);
      todosLosGradosGrupos = grupos;
      gradosGrupos = [...todosLosGradosGrupos]; // la lista que usa mostrarGrupos
    } catch (error) {
      console.error('Error al cargar grupos en curso:', error);
      gradosGrupos = [];
      todosLosGradosGrupos = [];
    }
  }


  function poblarSelectDeGrupos(grado_materia = null) {
    let gruposParaSelect = [...todosLosGradosGrupos]; // Usamos la lista maestra

    if (grado_materia) {
      const grado = Number(grado_materia);
      // Filtramos la copia local, no la global
      gruposParaSelect = gruposParaSelect.filter(g => Number(g.grado) === grado);
    }

    if (gruposParaSelect.length === 0) {
      idGradoGrupoSelect.innerHTML = '<option value="">No hay grupos para este grado</option>';
      idGradoGrupoSelect.disabled = true;
    } else {
      idGradoGrupoSelect.innerHTML = '<option value="">Seleccione un grupo</option>' +
        gruposParaSelect.map(g => `<option value="${g.id_grado_grupo}">${g.grupo}</option>`).join('');
      idGradoGrupoSelect.disabled = false;
    }
  }

  async function cargarNivelesIngles() {
    try {
      nivelesIngles = await fetchWithRetry('/niveles-ingles', { credentials: 'include' });
      idNivelInglesSelect.innerHTML = '<option value="">Seleccione un nivel de inglés</option>' +
        nivelesIngles.map(n => `<option value="${n.id_nivel_ingles}">${n.nombre_nivel_ingles}</option>`).join('');
    } catch (error) {
      console.error('Error al cargar niveles de inglés:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de niveles de inglés (/niveles-ingles). Contacte al administrador.'
          : 'No se pudieron cargar los niveles de inglés. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarNivelesIngles();
        else window.location.href = '/';
      });
    }
  }
// --- variables de estado para modal asignar ---
let currentAssignment = null; // la asignación actual (para este grupo+materia), si existe
let allowedProfesores = [];   // profesores tiempo completo / asimilados (objetos personales)
let selectedPersonalId = null; // id_personal seleccionado desde la lista

// nueva función: obtiene profesores permitidos (tiempo completo o asimilados)
async function cargarProfesoresPermitidos() {
  // detectar ids de roles que coincidan con "tiempo completo" o "asimil"
  const allowedRoleNames = ['tiempo completo', 'tiempo_completo', 'profesor tiempo completo', 'asimil', 'asimilado', 'profesor asimilado', 'profesor de asimilados'];

  // buscar ids de roles por coincidencia (case-insensitive)
  const allowedRoleIds = (roles || []).filter(r => {
    const name = (r.nombre_rol || '').toLowerCase();
    return allowedRoleNames.some(needle => name.includes(needle));
  }).map(r => r.id_rol);

  // si no encontró roles por nombre, intentar detectar por exacto 'Profesor' (fallback)
  if (allowedRoleIds.length === 0) {
    // por si acaso, toma roles que contengan 'profesor'
    const fallback = (roles || []).filter(r => (r.nombre_rol || '').toLowerCase().includes('profesor')).map(r=>r.id_rol);
    allowedRoleIds.push(...fallback);
  }

  // traer personal por rol (paralelo), combinar y deduplicar
  const arr = await Promise.all(
    allowedRoleIds.map(id => fetchWithRetry(`/personal-por-rol/${id}`, { credentials: 'include' }).catch(() => []))
  );

  const combined = [];
  const seen = new Set();
  arr.forEach(list => {
    if (!Array.isArray(list)) return;
    list.forEach(p => {
      if (!seen.has(String(p.id_personal))) {
        seen.add(String(p.id_personal));
        combined.push(p);
      }
    });
  });

  allowedProfesores = combined.sort((a,b) => {
    const A = `${a.apaterno_personal||''} ${a.nombre_personal||''}`.toLowerCase();
    const B = `${b.apaterno_personal||''} ${b.nombre_personal||''}`.toLowerCase();
    return A < B ? -1 : (A > B ? 1 : 0);
  });

  renderProfesoresList(''); // mostrar lista inicial
}

// render de la lista y buscador
function renderProfesoresList(filter) {
  const container = document.getElementById('personalListContainer');
  const search = (filter || '').trim().toLowerCase();
  if (!container) return;

  const list = allowedProfesores.filter(p => {
    const text = `${p.nombre_personal || ''} ${p.apaterno_personal || ''} ${p.amaterno_personal || ''}`.toLowerCase();
    return search ? text.includes(search) : true;
  });

  if (list.length === 0) {
    container.innerHTML = '<div class="text-muted small p-2">No se encontraron profesores.</div>';
    return;
  }

  container.innerHTML = list.map(p => {
    const full = [p.nombre_personal, p.apaterno_personal, p.amaterno_personal].filter(Boolean).join(' ');
    return `<button type="button" class="list-group-item list-group-item-action py-2 selectProfesorBtn" data-id="${p.id_personal}">${escapeHtml(full)}</button>`;
  }).join('');
}

// Listener para seleccionar profesor desde la lista (delegación)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.selectProfesorBtn');
  if (!btn) return;
  const id = btn.dataset.id;
  selectedPersonalId = id;
  // marcar visualmente
  const cont = document.getElementById('personalListContainer');
  if (cont) {
    cont.querySelectorAll('.list-group-item').forEach(it => it.classList.remove('active'));
  }
  btn.classList.add('active');

  // setear el campo oculto (id_personal) para submit
  const idPersonalField = document.getElementById('id_personal');
  if (idPersonalField) idPersonalField.value = id;
});

// busqueda en el listado de profesores
const personalSearchInput = document.getElementById('personalSearch');
if (personalSearchInput) {
  personalSearchInput.addEventListener('input', (ev) => {
    renderProfesoresList(ev.target.value || '');
  });
}

// cargarAsignaciones: ahora muestra UNA asignación actual (para el grupo que pases)
async function cargarAsignaciones(id_materia, isArte, filtroGrupoId = null) {
  try {
    const response = await fetchWithRetry(`/materias/${id_materia}/asignaciones`, { credentials: 'include' });
    const allAssign = Array.isArray(response) ? response : [];
    asignaciones = allAssign;

    // filtrar por grupo si se pasó
    const toRender = filtroGrupoId ? asignaciones.filter(a => String(a.id_grado_grupo) === String(filtroGrupoId)) : asignaciones;

    // tomamos la asignación actual (primera) si existe
    currentAssignment = toRender.length > 0 ? toRender[0] : null;

    const cont = document.getElementById('asignacionesContainer');
    if (!cont) return;

    if (!currentAssignment) {
      cont.innerHTML = '<div class="text-muted small">Sin asignación actual para este grupo.</div>';
      return;
    }

    // mostrar asignación actual con botón para "Reemplazar / Editar"
    const nombre = [currentAssignment.nombre_personal, currentAssignment.apaterno_personal, currentAssignment.amaterno_personal].filter(Boolean).join(' ');
    const nivel = currentAssignment.nombre_nivel_ingles ? ` · ${escapeHtml(currentAssignment.nombre_nivel_ingles)}` : '';
    const arte = currentAssignment.nombre_arte_especialidad ? ` · ${escapeHtml(currentAssignment.nombre_arte_especialidad)}` : '';


    cont.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div class="small">
          <strong>${escapeHtml(nombre)}</strong>${nivel}${arte}

        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error al cargar asignaciones:', error);
    const cont = document.getElementById('asignacionesContainer');
    if (cont) cont.innerHTML = '<div class="text-muted small">Error al cargar asignación actual.</div>';
  }
}

// evento para "Reemplazar" (prefill seleccionar al profesor actual)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-edit-asign');
  if (!btn) return;
  const idp = btn.dataset.id_personal;
  // precargar la lista y seleccionar al profesor actual
  if (allowedProfesores.length) {
    // si la lista ya existe, marcarlo
    const node = document.querySelector(`#personalListContainer .list-group-item[data-id="${idp}"]`);
    if (node) node.click();
  } else {
    // si no hay lista cargada aún, cargarla y luego seleccionar
    cargarProfesoresPermitidos().then(() => {
      const node = document.querySelector(`#personalListContainer .list-group-item[data-id="${idp}"]`);
      if (node) node.click();
    });
  }
});

function renderEditableAsignaciones(materia, grupoId) {
  const cont = document.getElementById('asignacionesContainer');
  if (!cont) return;

  const all = Array.isArray(asignaciones) ? asignaciones : [];
  const filas = all.filter(a => String(a.id_grado_grupo) === String(grupoId));

  console.log('Asignaciones filtradas:', filas); // Debug: Verify id_arte_especialidad

  if (!filas.length) {
    cont.innerHTML = '<div class="text-muted small">Sin asignaciones para este grupo.</div>';
    return;
  }

  const html = filas.map((a, idx) => {
    const tipo = a.id_nivel_ingles ? 'ingles' : (a.id_arte_especialidad ? 'arte' : 'normal');
    const etiqueta = a.nombre_nivel_ingles || a.nombre_arte_especialidad || '';

    const options = (allowedProfesores || []).map(p => {
      const full = [p.nombre_personal, p.apaterno_personal, p.amaterno_personal].filter(Boolean).join(' ');
      const selected = String(p.id_personal) === String(a.id_personal) ? 'selected' : '';
      return `<option value="${p.id_personal}" ${selected}>${escapeHtml(full)}</option>`;
    }).join('');

    const dataAttrs = [
      `data-id_personal_original="${a.id_personal ?? ''}"`,
      `data-id_grado_grupo="${a.id_grado_grupo ?? ''}"`,
      `data-id_nivel_ingles="${a.id_nivel_ingles ?? ''}"`,
      `data-id_arte_especialidad="${a.id_arte_especialidad ?? ''}"`
    ].join(' ');

    return `
      <div class="mb-2 asignacion-row" ${dataAttrs} data-id_materia="${a.id_materia || materia.id_materia}" data-tipo="${tipo}" data-idx="${idx}">
        <div class="d-flex gap-2 align-items-center">
          <div style="flex:1;">
            <div class="small text-muted">${escapeHtml([a.nombre_personal, a.apaterno_personal, a.amaterno_personal].filter(Boolean).join(' '))}</div>
            <div class="small fw-semibold">${escapeHtml(materia.nombre_materia)} ${etiqueta ? `· ${escapeHtml(String(etiqueta))}` : ''}</div>
          </div>
          <div style="min-width:260px;">
            <select class="form-select form-select-sm select-asign-personal" data-field-idx="${idx}">
              ${options}
            </select>
          </div>
          <div style="min-width:140px;">
            <button class="btn btn-sm btn-danger save-asign-btn" data-idx="${idx}" title="Guardar solo esta asignación">Guardar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cont.innerHTML = html;
}

// abrirModalAsignar: ahora bloquea el grupo, prepara lista de profesores permitidos y carga asignación actual
async function abrirModalAsignar(materia, selectedGroupId = null) {
  // buscar el grupo
  const g = todosLosGradosGrupos.find(gr => String(gr.id_grado_grupo) === String(selectedGroupId)) || {};

  asignarModalTitle.textContent = `Asignar Profesor - ${materia.nombre_materia} - ${g.grado}° ${g.grupo}`;
  document.getElementById('id_materia_asignar').value = materia.id_materia;

  // reset de estado
  asignarForm.reset();
  currentAssignment = null;
  selectedPersonalId = null;
  const idPersonalField = document.getElementById('id_personal');
  if (idPersonalField) idPersonalField.value = '';


  // Grupo: poblar select con los grupos permitidos y forzar al grupo seleccionado (bloqueado)
  // poblarSelectDeGrupos usa todosLosGradosGrupos; la llamamos para cargar las opciones
  poblarSelectDeGrupos(materia.grado_materia);
  if (selectedGroupId) {
    document.getElementById('id_grado_grupo').value = selectedGroupId;
  }
  // dejar deshabilitado para que no se pueda cambiar
  document.getElementById('id_grado_grupo').disabled = true;

  const isArte = materia.nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('arte');
  //nivelInglesContainer.style.display = materia.nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('ingles') ? 'block' : 'none';
  // Ya no es requerido porque el contenedor está oculto
  idNivelInglesSelect.required = false;

  // cargar lista de profesores permitidos y renderizar buscador
  await cargarProfesoresPermitidos();

  await cargarAsignaciones(materia.id_materia, isArte, selectedGroupId);

  // render editable por fila (nueva función)
  renderEditableAsignaciones(materia, selectedGroupId);

  asignarModal.show();

}


// ajustamos submit: si ya hay currentAssignment y se escoge otro profesor, primero eliminamos la asignación actual y luego creamos la nueva
asignarForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id_materia = document.getElementById('id_materia_asignar').value;
  const id_personal = document.getElementById('id_personal').value || selectedPersonalId;
  const id_grado_grupo = document.getElementById('id_grado_grupo').value;
  const id_nivel_ingles = idNivelInglesSelect.required ? document.getElementById('id_nivel_ingles').value : null;

  if (!id_personal) {
    Swal.fire('Error', 'Selecciona primero un profesor de la lista.', 'error');
    return;
  }

  const data = { id_personal, id_grado_grupo};
  if (id_nivel_ingles) data.id_nivel_ingles = id_nivel_ingles;

  try {
    const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
    const { csrfToken } = await csrfRes.json();

    // si existe asignación actual y es distinta, eliminarla primero
    if (currentAssignment && String(currentAssignment.id_personal) !== String(id_personal)) {
      const deleteBody = {
        id_personal: currentAssignment.id_personal,
        id_grado_grupo: currentAssignment.id_grado_grupo,
        id_nivel_ingles: currentAssignment.id_nivel_ingles || null,
        id_arte_especialidad: currentAssignment.id_arte_especialidad || null
      };
      // intentar eliminar la asignación actual
      const delRes = await fetch(`/materias/${id_materia}/asignaciones`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(deleteBody)
      });
      const delResult = await delRes.json();
      if (!delRes.ok || !delResult.success) {
        throw new Error(delResult.message || 'No se pudo eliminar la asignación previa.');
      }
    }

    // crear la nueva asignación (POST)
    const postRes = await fetch(`/materias/${id_materia}/asignaciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': csrfToken
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    const postResult = await postRes.json();
    if (!postRes.ok || !postResult.success) {
      throw new Error(postResult.message || 'No se pudo crear la asignación.');
    }

    // recargar datos del modal y cierre opcional
    const isArte = todasMaterias.find(m => m.id_materia == id_materia).nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('arte');
    const grupoSeleccionadoId = id_grado_grupo;
    await cargarAsignaciones(id_materia, isArte, grupoSeleccionadoId);
    asignarForm.reset();
    selectedPersonalId = null;
    if (document.getElementById('id_personal')) document.getElementById('id_personal').value = '';
    await cargarMaterias(); // recarga global
    mostrarGrupos();
    Swal.fire('Éxito', postResult.message, 'success');
  } catch (error) {
    console.error('Error al asignar profesor:', error);
    Swal.fire('Error', error.message || 'Error al asignar profesor.', 'error');
  }
});


  async function abrirModalArteEspecialidad() {
    arteEspecialidadForm.reset();
    idRolArteSelect.value = '';
    idPersonalArteSelect.innerHTML = '<option value="">Seleccione un rol primero</option>';
    idPersonalArteSelect.disabled = true;
    arteEspecialidadModal.show();
  }


  idRolArteSelect.addEventListener('change', async () => {
    const id_rol = idRolArteSelect.value;
    if (id_rol) {
      await cargarPersonalPorRol(id_rol, idPersonalArteSelect);
    } else {
      idPersonalArteSelect.innerHTML = '<option value="">Seleccione un rol primero</option>';
      idPersonalArteSelect.disabled = true;
    }
  });

  materiaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id_materia = document.getElementById('id_materia').value;
    const nombre_materia = document.getElementById('nombre_materia').value;
    const modelo_materia = document.getElementById('modelo_materia').value;
    const grado_materia = parseInt(document.getElementById('grado_materia').value);
    const id_academia = document.getElementById('id_academia').value;

    if (grado_materia < 1 || grado_materia > 6) {
      Swal.fire({
        title: 'Error',
        text: 'El grado debe estar entre 1 y 6.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
      return;
    }

    const data = { nombre_materia, modelo_materia, grado_materia, id_academia };

    try {
      const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      const url = id_materia ? `/materias/${id_materia}` : '/materias';
      const method = id_materia ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `Error en la solicitud: ${response.status}`);
      }

      if (result.success) {
        materiaModal.hide();
        await cargarMaterias(); // 1. Recarga los datos en segundo plano
        mostrarGrupos();      // 2. Dibuja la vista de GRUPOS con los datos actualizados
        Swal.fire('Éxito', result.message, 'success');
      } else {
        Swal.fire('Error', result.message || 'Error al guardar materia.', 'error');
      }
    } catch (error) {
      console.error('Error al guardar materia:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? `El servidor no tiene configurada la funcionalidad de ${id_materia ? 'edición' : 'guardado'} (/materias${id_materia ? '/:id' : ''}). Contacte al administrador.`
          : `Error al ${id_materia ? 'actualizar' : 'guardar'} materia. Asegúrese de que el servidor esté corriendo.`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) materiaForm.dispatchEvent(new Event('submit'));
      });
    }
  });

  asignacionesContainer.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.deleteAsignacionBtn');
    if (deleteBtn) {
      const id_materia = document.getElementById('id_materia_asignar').value;
      const id_personal = deleteBtn.dataset.id_personal;
      const id_grado_grupo = deleteBtn.dataset.id_grado_grupo;
      const id_nivel_ingles = deleteBtn.dataset.id_nivel_ingles || null;
      const id_arte_especialidad = deleteBtn.dataset.id_arte_especialidad || null;

      Swal.fire({
        title: '¿Estás seguro?',
        text: 'Esta acción eliminará la asignación.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
            const { csrfToken } = await csrfRes.json();
            const response = await fetch(`/materias/${id_materia}/asignaciones`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
              },
              credentials: 'include',
              body: JSON.stringify({ id_personal, id_grado_grupo, id_nivel_ingles, id_arte_especialidad })
            });

            const result = await response.json();
            if (!response.ok) {
              throw new Error(result.message || `Error en la solicitud: ${response.status}`);
            }

            if (result.success) {
              const isArte = todasMaterias.find(m => m.id_materia == id_materia).nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('arte');
              const grupoSeleccionadoId = document.getElementById('id_grado_grupo').value;
              await cargarAsignaciones(id_materia, isArte, grupoSeleccionadoId);
              await cargarMaterias();
              mostrarGrupos();
              Swal.fire('Éxito', result.message, 'success');
            } else {
              Swal.fire('Error', result.message || 'Error al eliminar asignación.', 'error');
            }
          } catch (error) {
            console.error('Error al eliminar asignación:', error);
            Swal.fire({
              title: 'Error',
              text: error.message.includes('404') 
                ? 'El servidor no tiene configurada la funcionalidad de eliminación (/materias/:id/asignaciones). Contacte al administrador.'
                : 'Error al eliminar asignación. Asegúrese de que el servidor esté corriendo.',
              icon: 'error',
              showCancelButton: true,
              confirmButtonText: 'Reintentar',
              cancelButtonText: 'Cancelar'
            });
          }
        }
      });
    }
  });

  deleteMateriaBtn.addEventListener('click', async () => {
    const id_materia = document.getElementById('id_materia').value;
    Swal.fire({
      title: '¿Estás seguro?',
      text: 'Esta acción eliminará la materia permanentemente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
          const { csrfToken } = await csrfRes.json();
          const response = await fetch(`/materias/${id_materia}`, {
            method: 'DELETE',
            headers: {
              'CSRF-Token': csrfToken
            },
            credentials: 'include'
          });

          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.message || `Error en la solicitud: ${response.status}`);
          }

          if (result.success) {
            materiaModal.hide();
            await cargarMaterias(); // 1. Recarga datos
            mostrarGrupos();      // 2. Dibuja la vista de GRUPOS
            Swal.fire('Éxito', result.message, 'success');
          } else {
            Swal.fire('Error', result.message || 'Error al eliminar materia.', 'error');
          }
        } catch (error) {
          console.error('Error al eliminar materia:', error);
          Swal.fire({
            title: 'Error',
            text: error.message.includes('404') 
              ? 'El servidor no tiene configurada la funcionalidad de eliminación (/materias/:id). Contacte al administrador.'
              : 'Error al eliminar materia. Asegúrese de que el servidor esté corriendo.',
            icon: 'error',
            showCancelButton: true,
            confirmButtonText: 'Reintentar',
            cancelButtonText: 'Cancelar'
          });
        }
      }
    });
  });

  arteEspecialidadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre_arte_especialidad = document.getElementById('nombre_arte_especialidad').value;
    const id_rol_arte = document.getElementById('id_rol_arte').value;
    const id_personal_arte = document.getElementById('id_personal_arte').value;

    const data = { nombre_arte_especialidad, id_rol_arte, id_personal_arte };

    try {
      const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      const response = await fetch('/arte-especialidades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `Error en la solicitud: ${response.status}`);
      }

      if (result.success) {
        arteEspecialidadModal.hide();
        Swal.fire('Éxito', result.message, 'success');
      } else {
        Swal.fire('Error', result.message || 'Error al guardar especialidad de arte.', 'error');
      }
    } catch (error) {
      console.error('Error al guardar especialidad de arte:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la funcionalidad de guardado (/arte-especialidades). Contacte al administrador.'
          : 'Error al guardar especialidad de arte. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) arteEspecialidadForm.dispatchEvent(new Event('submit'));
      });
    }
  });

  listaMateriasList.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.editBtn');
      if (editBtn) {
        const id = editBtn.dataset.id;
        try {
          const data = await fetchWithRetry(`/materias/${id}`, { credentials: 'include' });
          await abrirModalAsignar(data.materia);
        } catch (error) {
          console.error('Error al cargar datos de materia:', error);
          Swal.fire({
            title: 'Error',
            text: error.message.includes('404')
              ? 'El servidor no tiene configurada la funcionalidad de edición (/materias/:id). Contacte al administrador.'
              : 'No se pudieron cargar los datos de la materia. Asegúrese de que el servidor esté corriendo.',
            icon: 'error',
            showCancelButton: true,
            confirmButtonText: 'Reintentar',
            cancelButtonText: 'Cancelar'
          }).then(result => {
            if (result.isConfirmed) listaMateriasList.dispatchEvent(new Event('click'));
          });
        }
      }
    });


  buscadorMaterias.addEventListener('input', () => {
    mostrarMaterias(todasMaterias);
  });

  addMateriaBtn.addEventListener('click', () => abrirModalMateria());
  addArteEspecialidadBtn.addEventListener('click', () => abrirModalArteEspecialidad());

// --- Helper: construye un key legible del grupo ---
function grupoLabel(g) {
  return `${g.grado}° ${g.grupo}`;
}

// --- Muestra los grupos en formato accordion y sus materias dentro ---
// llamadas: llamar después de cargar 'gradosGrupos' y 'todasMaterias'
// 2) Mostrar grupos — ahora SOLO muestra grupos que tengan materias y NO muestra "Sin Grupo"
async function mostrarGrupos() {
  const q = (buscadorMaterias?.value || '').trim().toLowerCase();

  // Agrupar gradosGrupos por grado
  const gradoMap = {};
  (gradosGrupos || []).forEach(g => {
    const gradoNum = Number(g.grado) || 0;
    if (!gradoMap[gradoNum]) gradoMap[gradoNum] = [];
    gradoMap[gradoNum].push(g);
  });

  const gradosOrdenados = Object.keys(gradoMap).map(Number).sort((a,b) => a - b);
  let html = '';

  for (const gradoNum of gradosOrdenados) {
    const grupos = gradoMap[gradoNum] || [];

    // Para cada grupo, contamos las materias que tienen asociacion a ese grupo
    const gruposHtml = grupos.map(g => {
      const key = g.id_grado_grupo;
      // buscar materias en todasMaterias que incluyan este grupo en grupos_ids_array
      const materiasRelacionadas = (todasMaterias || []).filter(m => Array.isArray(m.grupos_ids_array) && m.grupos_ids_array.includes(String(key)));
      // aplicar filtro de búsqueda q sobre nombre/modelo/academia
      const materiasFiltradas = materiasRelacionadas.filter(m => {
        const text = `${m.nombre_materia || ''} ${m.modelo_materia || ''} ${(m.nombre_academia||'')}`.toLowerCase();
        return q ? text.includes(q) : true;
      });

      if (materiasFiltradas.length === 0) return ''; // no mostrar grupo si no tiene materias que coincidan

      return `
        <div class="list-group-item p-2 d-flex justify-content-between align-items-center">
          <button class="btn btn-transparent text-start w-100 group-modal-trigger"
                  type="button"
                  data-bs-toggle="modal"
                  data-bs-target="#grupoModal"
                  data-id-grupo="${key}">
            <span class="fw-semibold">${escapeHtml(String(g.grupo || ''))}</span>
            <small class="text-muted ms-3">· ${materiasFiltradas.length} ${materiasFiltradas.length === 1 ? 'materia' : 'materias'}</small>
          </button>
        </div>
      `;
    }).filter(Boolean).join('');

    if (!gruposHtml) continue;

    html += `
      <div class="mb-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="fw-bold">Grado ${escapeHtml(String(gradoNum))}</div>
          <div class="text-muted small">${gradoMap[gradoNum].length} grupos</div>
        </div>
        <div class="list-group list-group-flush">
          ${gruposHtml}
        </div>
      </div>
    `;
  }

  gruposAccordion.innerHTML = html || '<div class="text-muted text-center py-3">No se encontraron grupos con materias en curso.</div>';
}

// cache para no recargar varias veces
const grupoCache = {};

// Fetch y render de materias de un grupo
async function cargarMateriasPorGrupo(id_grado_grupo) {
  if (!id_grado_grupo) return [];
  if (grupoCache[id_grado_grupo]) return grupoCache[id_grado_grupo];

  // 1) Intentar construir la lista localmente a partir de todasMaterias
  const fromAll = (todasMaterias || []).filter(m => {
    return Array.isArray(m.grupos_ids_array) && m.grupos_ids_array.includes(String(id_grado_grupo));
  });

  if (fromAll.length) {
    // si vienen sin 'asignaciones' (detalles), podemos mantener el campo profesores_text
    grupoCache[id_grado_grupo] = fromAll;
    return grupoCache[id_grado_grupo];
  }

  // 2) Fallback: si el servidor tiene detalles por grupo, pedirlos (mantener compatibilidad)
  try {
    const res = await fetchWithRetry(`/grupos/${id_grado_grupo}/materias`, { credentials: 'include' });
    if (!res || !res.success) {
      // si res es array o formato distinto, adaptamos
      const materiasServidor = Array.isArray(res) ? res : (res.materias || []);
      // mezclar con materiaMap si existe
      const merged = materiasServidor.map(m => {
        const extra = (window._materiaMap && window._materiaMap.get(String(m.id_materia))) || {};
        return {
          ...extra, // preferimos campos procesados localmente (profesores_text, grupos_ids_array)
          ...m
        };
      });
      grupoCache[id_grado_grupo] = merged;
      return merged;
    }
    // res.success === true
    const lista = res.materias || [];
    // mezclar con materiaMap
    const merged = lista.map(m => {
      const extra = (window._materiaMap && window._materiaMap.get(String(m.id_materia))) || {};
      return {
        ...extra,
        ...m
      };
    });
    grupoCache[id_grado_grupo] = merged;
    return merged;
  } catch (err) {
    console.error('Error cargando materias por grupo (fallback):', err);
    throw err;
  }
}

function renderMateriasDelGrupoEnModal(gradoGrupoId, materias, q = '') {
  if (!grupoModalBody) return;
  if (!Array.isArray(materias) || materias.length === 0) {
    grupoModalBody.innerHTML = '<div class="p-3 text-muted small">No hay materias asignadas a este grupo.</div>';
    return;
  }

  const grupoObj = (gradosGrupos || []).find(g => String(g.id_grado_grupo) === String(gradoGrupoId));
  const grupoName = grupoObj ? String(grupoObj.grupo).trim() : null;

  const filtradas = q
    ? materias.filter(m => `${m.nombre_materia} ${m.modelo_materia || ''} ${(m.nombre_academia||'')}`.toLowerCase().includes(q.toLowerCase()))
    : materias;

  const materiasHtml = filtradas.map(m => {
    let asignHtml = '';

    // 1) Si hay estructura 'asignaciones' como array, filtrar por id_grado_grupo
    if (Array.isArray(m.asignaciones) && m.asignaciones.length > 0) {
      const asignsFiltradas = m.asignaciones.filter(a => String(a.id_grado_grupo) === String(gradoGrupoId));
      if (asignsFiltradas.length > 0) {
        asignHtml = asignsFiltradas.map(a => {
          const parts = [a.nombre_personal, a.apaterno_personal, a.amaterno_personal].filter(Boolean);
          const nombre = parts.join(' ');
          const extras = [
            a.nombre_nivel_ingles ? a.nombre_nivel_ingles : null,
            a.nombre_arte_especialidad ? a.nombre_arte_especialidad : null
          ].filter(Boolean).join(' · ');
          return `<div class="small">${escapeHtml(nombre)}${extras ? ` · ${escapeHtml(extras)}` : ''}</div>`;
        }).join('');
      }
    }

    // 2) Si no hay asignaciones estructuradas, parsear la cadena compacta devuelta por el backend
    if (!asignHtml && (m.profesores_text || m.profesores_grupos)) {
      const text = (m.profesores_text || m.profesores_grupos || '').trim();
      if (text) {
        // separar por ';' -- cada segmento puede ser encabezado o asignación
        const items = text.split(';').map(s => s.trim()).filter(Boolean);

        // construimos HTML por cada item, pero sólo mostramos asignaciones que correspondan al grupo actual
        const pieces = items.map(item => {
          // Si parece encabezado (contiene '·' y no tiene '-' ni lista de grupos), mostrar como header
          if (item.includes('·') && !item.includes('-')) {
            return `<div class="small fw-semibold">${escapeHtml(item)}</div>`;
          }

          // intentamos extraer la parte "grupos" (por lo general está después del último ' - ')
          const parts = item.split(' - ');
          const namePart = parts.slice(0, -1).join(' - ') || parts[0] || item;
          const lastPart = parts.slice(-1)[0] || '';

          // extraer texto entre paréntesis
          const parenMatch = lastPart.match(/\(([^)]+)\)/);
          const parenText = parenMatch ? ` (${parenMatch[1].trim()})` : '';
          // limpiar la parte de grupos (quitar paréntesis y texto ya extraído)
          const groupsPartClean = lastPart.replace(/\([^)]*\)/g, '').trim();

          // obtener tokens de grupos (separados por coma o barra)
          const tokens = groupsPartClean
            .split(/[,\/]/)
            .map(s => s.trim())
            .filter(Boolean);

          // si el grupo actual aparece entre los tokens -> construir línea mostrando sólo ese grupo
          if (grupoName && tokens.some(t => String(t).toLowerCase() === String(grupoName).toLowerCase())) {
            // devolver sólo el nombre + ' - ' + grupoName
            return `<div class="small">${escapeHtml(namePart)} ${escapeHtml(parenText)}</div>`;
          }

          // fallback: si no había '-' (no pudimos separar), pero el grupoName aparece en todo el item -> mostrar item (limpio)
          if (!item.includes(' - ') && grupoName && new RegExp(`\\b${grupoName}\\b`, 'i').test(item)) {
            return `<div class="small">${escapeHtml(item)}</div>`;
          }

          // no corresponde al grupo actual -> no mostrar
          return '';
        }).filter(Boolean);

        if (pieces.length > 0) {
          asignHtml = pieces.join('');
        }
      }
    }

    // 3) Si después de todo no hay asignación para este grupo
    if (!asignHtml) {
      asignHtml = `<div class="text-muted small">Sin profesor asignado para este grupo.</div>`;
    }

    return `
      <div class="list-group-item d-flex justify-content-between align-items-start">
        <div style="min-width:0;">
          <div class="fw-bold text-danger" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(m.nombre_materia)}</div>
          <div class="small text-muted">${escapeHtml(m.modelo_materia || '')} ${m.nombre_academia ? `· ${escapeHtml(m.nombre_academia)}` : ''}</div>
          <div class="mt-2">${asignHtml}</div>
        </div>
        <div class="ms-3 d-flex flex-column align-items-end" style="flex:0 0 auto;">
          <button class="btn btn-outline-danger btn-sm mb-1 openAsignFromGrupoBtn" data-id="${m.id_materia}" data-grupo-id="${gradoGrupoId}" title="Editar asignaciones de esta materia">
            <i class="fas fa-user-edit me-1"></i>Editar asignación
          </button>
        </div>
      </div>
    `;
  }).join('');

  grupoModalBody.innerHTML = `<div class="list-group list-group-flush">${materiasHtml}</div>`;
}


// abrir modal del grupo y cargar datos (lazy)
async function abrirModalGrupo(id_grado_grupo) {
  const grupo = gradosGrupos.find(g => String(g.id_grado_grupo) === String(id_grado_grupo));
  const label = grupo ? grupoLabel(grupo) : `Grupo ${id_grado_grupo}`;
  if (grupoModalTitle) grupoModalTitle.textContent = `Materias - ${label}`;
  if (!grupoModalBody) return;

  grupoModalBody.innerHTML = '<div class="text-center py-3 text-muted">Cargando materias del grupo...</div>';
  try {
    const materias = await cargarMateriasPorGrupo(id_grado_grupo);
    renderMateriasDelGrupoEnModal(id_grado_grupo, materias, grupoModalSearch.value || '');
    if (grupoModal) grupoModal.show();
    // guardar en cache si deseas (ya lo hace cargarMateriasPorGrupo)
  } catch (err) {
    grupoModalBody.innerHTML = '<div class="text-center py-3 text-danger">Error al cargar materias del grupo.</div>';
    if (grupoModal) grupoModal.show();
  }
}

// búsqueda interna en el modal
if (grupoModalSearch) {
  grupoModalSearch.addEventListener('input', () => {
    // si el modal está abierto, re-render con filtro
    const bodyFirst = grupoModalBody.querySelector('.list-group') ? true : false;
    // intenta sacar el grupoId del título (o del primer boton de la lista)
    const firstBtn = grupoModalBody.querySelector('.openAsignFromGrupoBtn') || grupoModalBody.querySelector('[data-grupo-id]');
    const gid = firstBtn?.dataset?.grupoId;
    if (gid) {
      const materias = grupoCache[gid] || [];
      renderMateriasDelGrupoEnModal(gid, materias, grupoModalSearch.value || '');
    }
  });
}

if (grupoModalRefresh) {
  grupoModalRefresh.addEventListener('click', async () => {
    // refrescar la lista (si hay grupo visible)
    const firstBtn = grupoModalBody.querySelector('.openAsignFromGrupoBtn') || grupoModalBody.querySelector('[data-grupo-id]');
    const gid = firstBtn?.dataset?.grupoId;
    if (gid) {
      // invalidar cache y recargar
      delete grupoCache[gid];
      grupoModalBody.innerHTML = '<div class="text-center py-3 text-muted">Recargando...</div>';
      try {
        const materias = await cargarMateriasPorGrupo(gid);
        renderMateriasDelGrupoEnModal(gid, materias, grupoModalSearch.value || '');
      } catch (err) {
        grupoModalBody.innerHTML = '<div class="text-center py-3 text-danger">Error al recargar.</div>';
      }
    }
  });
}


// --- Delegación de eventos: abrir modal de asignación desde el accordion ---
// --- Delegación de eventos ---
if (gruposAccordion) {
  gruposAccordion.addEventListener('click', async (e) => {
    
    // 1) Si se hace clic en un grupo, abrir el MODAL de materias.
    const grupoBtn = e.target.closest('.group-modal-trigger');
    if (grupoBtn) {
      const id_grado_grupo = grupoBtn.dataset.idGrupo;
      if (id_grado_grupo) {
        await abrirModalGrupo(id_grado_grupo);
      }
      return; // Se manejó el clic, no hacer nada más.
    }

    // El resto de los manejadores de clics (como el de 'openAsignBtn') se mantienen igual
    // si esos botones siguen existiendo dentro de otras partes de tu UI.
    // Por ahora, como los botones de editar materia están DENTRO del modal,
    // este listener principal solo necesita preocuparse de abrir ese modal.
  });
}

// También necesitas un listener para los botones DENTRO del modal de grupo
if (grupoModalBody) {
    grupoModalBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.openAsignFromGrupoBtn');
        if (editBtn) {
            const materiaId = editBtn.dataset.id;
            const grupoId = editBtn.dataset.grupoId;
            try {
                const data = await fetchWithRetry(`/materias/${materiaId}`, { credentials: 'include' });
                const materia = data.materia ?? data;
                
                // Cerramos el modal de grupo antes de abrir el de asignar
                if(grupoModal) grupoModal.hide();

                await abrirModalAsignar(materia, grupoId);
            } catch (err) {
                console.error('Error cargando materia para asignar:', err);
                Swal.fire('Error', 'No se pudo cargar la materia. Verifica el servidor.', 'error');
            }
        }
    });
}


// --- Conectar búsquedas para que filtren por grupos/materias ---
buscadorMaterias.addEventListener('input', async () => {
  await mostrarGrupos();
});


  await Promise.all([
    cargarMaterias(),
    cargarAcademias(),
    cargarRoles(),
    cargarTODOSGradosGrupos(),
    cargarNivelesIngles()
  ]);

  // ya con datos cargados, renderizamos la vista por grupos
  await mostrarGrupos();

});