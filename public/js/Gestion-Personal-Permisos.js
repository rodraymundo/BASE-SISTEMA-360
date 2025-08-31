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

async function checkDuplicatePuesto(roles) {
  try {
    const puestos = await fetchWithRetry('/puestos/roles', { credentials: 'include' });
    const roleIdsStr = roles.sort((a, b) => a - b).join(',');
    const duplicate = puestos.find(p => p.role_ids === roleIdsStr);
    return !!duplicate;
  } catch (error) {
    console.error('Error al verificar duplicados de puesto:', error);
    Swal.fire({
      title: 'Error',
      text: 'No se pudo verificar si el puesto ya existe. Asegúrese de que el servidor esté corriendo.',
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Reintentar',
      cancelButtonText: 'Cancelar'
    });
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const listaPersonalList = document.getElementById('listaPersonalList');
  listaPersonalList.innerHTML = '<div class="text-muted text-center py-3">Cargando personal...</div>';

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

  const personalModal = new bootstrap.Modal(document.getElementById('personalModal'));
  const puestoModal = new bootstrap.Modal(document.getElementById('puestoModal'));
  const porcentajesModal = new bootstrap.Modal(document.getElementById('porcentajesModal'));
  const personalForm = document.getElementById('personalForm');
  const puestoForm = document.getElementById('puestoForm');
  const porcentajesForm = document.getElementById('porcentajesForm');
  const modalTitle = document.getElementById('modalTitle');
  const addPersonalBtn = document.getElementById('addPersonalBtn');
  const addPuestoBtn = document.getElementById('addPuestoBtn');
  const buscadorPersonal = document.getElementById('buscadorPersonal');
  const idPuestoSelect = document.getElementById('id_puesto');
  const rolesContainer = document.getElementById('rolesContainer');
  const categoriasContainer = document.getElementById('categoriasContainer');
  const nombrePuestoInput = document.getElementById('nombre_puesto');
  const porcentajesContainer = document.getElementById('porcentajesContainer');
  const totalPorcentaje = document.getElementById('totalPorcentaje');

  let todosPersonal = [];
  let puestos = [];
  let roles = [];
  let categorias = [];
  let selectedCategorias = [];

  async function cargarPersonal() {
  try {
    listaPersonalList.innerHTML = '<div class="text-muted text-center py-3">Cargando personal...</div>';
    todosPersonal = await fetchWithRetry('/personal', { credentials: 'include' });
    mostrarPersonal(todosPersonal);
  } catch (error) {
    console.error('Error al cargar personal:', error);
    listaPersonalList.innerHTML = '<div class="text-muted text-center py-3">No se pudo cargar el personal. Verifique que el servidor esté corriendo.</div>';
    Swal.fire({
      title: 'Error',
      text: error.message.includes('404') 
        ? 'El servidor no tiene configurada la lista de personal (/personal). Contacte al administrador.'
        : 'No se pudo conectar con el servidor. Asegúrese de que esté corriendo.',
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Reintentar',
      cancelButtonText: 'Ir al inicio'
    }).then(result => {
      if (result.isConfirmed) cargarPersonal();
      else window.location.href = '/';
    });
  }
}


  function mostrarPersonal(personal) {
  const textoBusqueda = buscadorPersonal.value.trim().toLowerCase();
  const filtrados = personal.filter(p =>
    `${p.nombre_personal || ''} ${p.apaterno_personal || ''} ${p.amaterno_personal || ''} ${p.correo_usuario || ''}`
      .toLowerCase()
      .includes(textoBusqueda)
  );

  if (filtrados.length === 0) {
    listaPersonalList.innerHTML = '<div class="text-muted text-center py-3">No se encontraron personas.</div>';
    return;
  }

  listaPersonalList.innerHTML = filtrados.map(p => {
    const nombre = escapeHtml(`${p.nombre_personal || ''} ${p.apaterno_personal || ''} ${p.amaterno_personal || ''}`).trim() || 'Sin nombre';
    const puesto = escapeHtml(p.nombre_puesto || 'Sin puesto');
    const correo = escapeHtml(p.correo_usuario || 'Sin correo');
    const rawEstado = (p.estado_personal || '').toString().trim();
    const estadoLower = rawEstado.toLowerCase();

    let estadoClass = 'estado-unknown';
    // comprobaciones con límites de palabra para evitar coincidencias parciales
    if (/\binactivo\b/i.test(rawEstado) || estadoLower === '0' || estadoLower === 'false') {
      estadoClass = 'estado-inactivo';
    } else if (/\bactivo\b/i.test(rawEstado) || estadoLower === '1' || estadoLower === 'true') {
      estadoClass = 'estado-activo';
    }

    const estadoHtml = `<span class="estado ${estadoClass}">${escapeHtml(rawEstado || 'Sin estado')}</span>`;

    return `
      <div class="list-group-item" data-id="${p.id_personal || ''}">
        <div class="item-body">
          <div class="item-header">
            <h6 class="mb-1 text-danger fw-bold" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${nombre}</h6>
            <small class="text-muted ms-2">${puesto}</small>
          </div>
          <div class="small-muted mt-1">
            <div class="mail"><strong>Correo:</strong> ${correo}</div>
            <div class="mt-1"><strong>Estado:</strong> ${estadoHtml}</div>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-edit btn-sm editBtn" title="Editar" aria-label="Editar" data-id="${p.id_personal || ''}">
            <i class="fas fa-pencil-alt"></i><span>Editar</span>
          </button>
          <button class="btn btn-kpi btn-sm adjustKpiBtn" title="Ajustar KPIs" aria-label="Ajustar KPIs" data-id="${p.id_personal || ''}">
            <i class="fas fa-tachometer-alt"></i><span>Ajustar KPIs</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // ====== Después de inyectar el HTML: unir listeners a cada botón ======
  // Editar
  listaPersonalList.querySelectorAll('.editBtn').forEach(btn => {
    // quitamos listeners previos por si acaso (evita duplicados si re-renderizas)
    btn.replaceWith(btn.cloneNode(true));
  });
  // re-query porque clonamos
  listaPersonalList.querySelectorAll('.editBtn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // evita que el click burbujee al item
      const id = btn.dataset.id;
      if (!id) return;
      try {
        const personal = await fetchWithRetry(`/personal/${id}`, { credentials: 'include' });
        abrirModalPersonal(personal);
      } catch (err) {
        console.error('Error al cargar datos de personal:', err);
        Swal.fire({
          title: 'Error',
          text: 'No se pudieron cargar los datos del personal. Asegúrese de que el servidor esté corriendo.',
          icon: 'error'
        });
      }
    });
  });

  // Ajustar KPIs
  listaPersonalList.querySelectorAll('.adjustKpiBtn').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  listaPersonalList.querySelectorAll('.adjustKpiBtn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) return;
      try {
        const personal = await fetchWithRetry(`/personal/${id}`, { credentials: 'include' });
        openKpiModalForPersonal(personal);
      } catch (err) {
        console.error('Error al cargar personal para KPIs:', err);
        Swal.fire('Error', 'No se pudieron cargar los datos del personal para ajustar KPIs.', 'error');
      }
    });
  });
}



  async function cargarPuestos() {
    try {
      puestos = await fetchWithRetry('/puestos', { credentials: 'include' });
      idPuestoSelect.innerHTML = '<option value="">Seleccione un puesto</option>' +
        puestos.map(p => `<option value="${p.id_puesto}">${p.nombre_puesto}</option>`).join('');
    } catch (error) {
      console.error('Error al cargar puestos:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de puestos (/puestos). Contacte al administrador.'
          : 'No se pudieron cargar los puestos. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarPuestos();
        else window.location.href = '/';
      });
    }
  }

  async function cargarRoles() {
    try {
      roles = await fetchWithRetry('/roles', { credentials: 'include' });
      rolesContainer.innerHTML = roles.map(r => `
        <div class="form-check">
          <input class="form-check-input role-checkbox" type="checkbox" value="${r.id_rol}" id="role_${r.id_rol}">
          <label class="form-check-label" for="role_${r.id_rol}">${r.nombre_rol}</label>
        </div>
      `).join('');
      document.querySelectorAll('.role-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateNombrePuesto);
      });
    } catch (error) {
      console.error('Error al cargar roles:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de roles (/roles). Contacte al administrador.'
          : 'No se pudieron cargar los roles. Asegúrese de que el servidor esté corriendo.',
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
  

  async function cargarCategorias() {
    try {
      categorias = await fetchWithRetry('/categorias', { credentials: 'include' });
      categoriasContainer.innerHTML = categorias.map(c => `
        <div class="form-check">
          <input class="form-check-input categoria-checkbox" type="checkbox" value="${c.id_categoria_kpi}" id="categoria_${c.id_categoria_kpi}">
          <label class="form-check-label" for="categoria_${c.id_categoria_kpi}">${c.nombre_categoria_kpi}</label>
        </div>
      `).join('');
    } catch (error) {
      console.error('Error al cargar categorías:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de categorías (/categorias). Contacte al administrador.'
          : 'No se pudieron cargar las categorías. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarCategorias();
        else window.location.href = '/';
      });
    }
  }

  function updateNombrePuesto() {
    const selectedRoles = Array.from(document.querySelectorAll('.role-checkbox:checked'))
      .map(checkbox => roles.find(r => r.id_rol === parseInt(checkbox.value))?.nombre_rol)
      .filter(name => name)
      .sort();
    nombrePuestoInput.value = selectedRoles.join('/');
  }

  function abrirModalPersonal(personal = null) {
    if (personal) {
      modalTitle.textContent = 'Editar Personal';
      document.getElementById('id_personal').value = personal.id_personal;
      document.getElementById('nombre').value = personal.nombre_personal;
      document.getElementById('apaterno').value = personal.apaterno_personal;
      document.getElementById('amaterno').value = personal.amaterno_personal;
      document.getElementById('fecha_nacimiento').value = personal.fecha_nacimiento_personal;
      document.getElementById('telefono').value = personal.telefono_personal;
      document.getElementById('id_puesto').value = personal.id_puesto || '';
      document.getElementById('estado').value = personal.estado_personal;
      document.getElementById('correo').value = personal.correo_usuario || '';
      document.getElementById('contrasena').value = '';
      document.getElementById('contrasena').placeholder = 'Dejar en blanco para no cambiar';
      document.getElementById('contrasena').required = false;
    } else {
      modalTitle.textContent = 'Agregar Personal';
      personalForm.reset();
      document.getElementById('id_personal').value = '';
      document.getElementById('contrasena').placeholder = 'Ingrese contraseña';
      document.getElementById('contrasena').required = true;
    }
    personalModal.show();
  }

  function abrirModalPuesto() {
    puestoForm.reset();
    nombrePuestoInput.value = '';
    document.querySelectorAll('.role-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });
    document.querySelectorAll('.categoria-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });
    puestoModal.show();
  }

  function abrirModalPorcentajes(selectedCategoriasIds) {
    selectedCategorias = categorias.filter(c => selectedCategoriasIds.includes(c.id_categoria_kpi));
    if (selectedCategorias.length === 0) {
      Swal.fire('Error', 'Debe seleccionar al menos una categoría.', 'error');
      return false;
    }

    porcentajesContainer.innerHTML = selectedCategorias.map(c => `
      <div class="mb-3">
        <label for="porcentaje_${c.id_categoria_kpi}" class="form-label">${c.nombre_categoria_kpi}</label>
        <input type="number" class="form-control porcentaje-input" id="porcentaje_${c.id_categoria_kpi}" name="porcentaje_${c.id_categoria_kpi}" min="0" max="100" required>
      </div>
    `).join('');
    totalPorcentaje.textContent = 'Total: 0%';

    document.querySelectorAll('.porcentaje-input').forEach(input => {
      input.addEventListener('input', updateTotalPorcentaje);
    });

    porcentajesModal.show();
    return true;
  }

  function updateTotalPorcentaje() {
    const total = Array.from(document.querySelectorAll('.porcentaje-input'))
      .reduce((sum, input) => sum + (parseInt(input.value) || 0), 0);
    totalPorcentaje.textContent = `Total: ${total}%`;
    totalPorcentaje.classList.toggle('text-danger', total !== 100);
    totalPorcentaje.classList.toggle('text-success', total === 100);
  }


  /* ---------- START: KPI modal & helpers ---------- */

// crear el modal en DOM si no existe
function ensureKpiModalExists() {
  if (document.getElementById('kpiModal')) return;
  const modalHtml = `
  <div class="modal fade" id="kpiModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Ajustar KPIs - <span id="kpiModalPersonalName"></span></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label for="kpiCategoriaSelect" class="form-label">Seleccionar categoría</label>
            <select id="kpiCategoriaSelect" class="form-select">
              <option value="">Seleccione una categoría</option>
            </select>
          </div>

          <!-- Lista de KPIs (incluye automáticos pero como selects deshabilitados) -->
          <div id="kpiListContainer">
            <div class="text-muted text-center py-3">Seleccione una categoría para ver sus KPIs.</div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="kpiSaveAllBtn" type="button" class="btn btn-danger">Guardar cambios</button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}



let puestosRolesMap = {}; // { id_puesto: [id_rol, ...] }
let roleToPuestosMap = {}; // { id_rol: [id_puesto, ...] }
let evaluadorKpiCache = {}; // cache de asignaciones actuales para el personal { id_kpi: { id_evaluador, id_personal_encargado } }

async function cargarPuestosRolesMap() {
  try {
    const raw = await fetchWithRetry('/puestos/roles', { credentials: 'include' });
    // soportar respuesta { success: true, data: [...] } o directamente [...]
    const arr = (raw && raw.data) ? raw.data : raw;
    puestosRolesMap = {};
    roleToPuestosMap = {};
    (arr || []).forEach(item => {
      if (item.id_puesto != null && item.id_rol != null) {
        puestosRolesMap[item.id_puesto] = puestosRolesMap[item.id_puesto] || [];
        puestosRolesMap[item.id_puesto].push(item.id_rol);
        roleToPuestosMap[item.id_rol] = roleToPuestosMap[item.id_rol] || [];
        roleToPuestosMap[item.id_rol].push(item.id_puesto);
      } else if (item.id_puesto != null && typeof item.role_ids === 'string') {
        const a = item.role_ids.split(',').map(s => parseInt(s)).filter(Boolean);
        puestosRolesMap[item.id_puesto] = a;
        a.forEach(r => {
          roleToPuestosMap[r] = roleToPuestosMap[r] || [];
          roleToPuestosMap[r].push(item.id_puesto);
        });
      }
    });
  } catch (err) {
    console.error('No se pudo cargar puestos-roles:', err);
    puestosRolesMap = {};
    roleToPuestosMap = {};
  }
}


function getPersonalesByRole(idRol) {
  // retorna array de personal (objetos) cuyo puesto contiene idRol
  const puestosQueTienenRol = roleToPuestosMap[idRol] || [];
  return todosPersonal.filter(p => puestosQueTienenRol.includes(p.id_puesto));
}

async function cargarKpisPorCategoria(id_categoria) {
  if (!id_categoria) return [];
  const resp = await fetchWithRetry(`/kpis?categoria=${id_categoria}`, { credentials: 'include' });
  // backend responde { success: true, data: [...] }
  return (resp && resp.data) ? resp.data : resp;
}


async function cargarAsignacionesEvaluador(personalId) {
  try {
    const resp = await fetchWithRetry(`/evaluador_kpi?personal=${personalId}`, { credentials: 'include' });
    const arr = (resp && resp.data) ? resp.data : resp;
    evaluadorKpiCache = {};
    (arr || []).forEach(row => {
      // guardamos los campos que esperamos: id_kpi, evaluador_personal_id, evaluador_nombre
      evaluadorKpiCache[row.id_kpi] = row;
    });
    return arr || [];
  } catch (err) {
    console.error('Error cargando asignaciones evaluador:', err);
    evaluadorKpiCache = {};
    return [];
  }
}


function renderKpiList(items, personalId) {
  // items: array de objetos { k, posibles, assignedPersonal, isAutomatic }
  const container = document.getElementById('kpiListContainer');
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="text-muted text-center py-3">No hay KPIs en esta categoría.</div>';
    return;
  }

  const html = items.map(item => {
    const k = item.k;
    const posibles = item.posibles || [];
    const assignedPersonalId = item.assignedPersonal != null ? item.assignedPersonal : (evaluadorKpiCache[k.id_kpi] && evaluadorKpiCache[k.id_kpi].evaluador_personal_id ? parseInt(evaluadorKpiCache[k.id_kpi].evaluador_personal_id) : '');
    const isAutomatic = !!item.isAutomatic;

    const opciones = posibles.length
      ? `<option value="">-- Seleccione encargado --</option>` + posibles.map(p =>
          `<option value="${p.id_personal}" ${p.id_personal === assignedPersonalId ? 'selected' : ''}>${escapeHtml(p.nombre_personal)} ${escapeHtml(p.apaterno_personal||'')}</option>`
        ).join('')
      : `<option value="">No hay personal con el rol requerido</option>`;

    // borde verde si ya hay asignado (ya sea automático o por la cache)
    const cardClass = assignedPersonalId ? 'border border-2 border-success' : '';

    // si es automático, deshabilitamos el select para que no se pueda cambiar
    const disabledAttr = isAutomatic ? 'disabled' : '';

    // Añadimos atributo data-automatic para referencia si se quiere
    return `
      <div class="card mb-2 ${cardClass}" data-kpi-id="${k.id_kpi}" data-automatic="${isAutomatic ? '1' : '0'}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h6 class="mb-1">${escapeHtml(k.nombre_kpi)}</h6>
              <small class="text-muted">Meta: ${k.meta_kpi} · Tipo: ${k.tipo_kpi}</small>
            </div>
            <div style="min-width:220px;">
              <label class="form-label small mb-1">Encargado de medición</label>
              <select class="form-select encargados-select" data-kpi-id="${k.id_kpi}" ${disabledAttr} title="${isAutomatic ? 'Asignado automáticamente (no editable)' : ''}">
                ${opciones}
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  // listeners: sólo para selects editables
  document.querySelectorAll('.encargados-select:not([disabled])').forEach(s => {
    s.addEventListener('change', (ev) => {
      const card = ev.target.closest('.card');
      if (!card) return;
      if (ev.target.value && ev.target.value !== '') {
        card.classList.add('border', 'border-2', 'border-success');
      } else {
        card.classList.remove('border', 'border-2', 'border-success');
      }
    });
  });
}



async function openKpiModalForPersonal(personal) {
  ensureKpiModalExists();
  await cargarPuestosRolesMap(); // carga/actualiza mapas
  document.getElementById('kpiModalPersonalName').textContent = `${personal.nombre_personal || ''} ${personal.apaterno_personal || ''}`.trim();
  const kpiCategoriaSelect = document.getElementById('kpiCategoriaSelect');
  // rellenar categorías permitidas para el puesto del personal (Puesto_Categoria)
  // endpoint esperado: GET /puesto-categorias?puesto=ID -> [{id_categoria_kpi, nombre_categoria_kpi, porcentaje_categoria}, ...]
  try {
    const resp = await fetchWithRetry(`/puesto-categorias?puesto=${personal.id_puesto}`, { credentials: 'include' });
    const puestoCategorias = (resp && resp.data) ? resp.data : resp;
    kpiCategoriaSelect.innerHTML = '<option value="">Seleccione una categoría</option>' +
      (puestoCategorias.map(c => `<option value="${c.id_categoria_kpi}">${escapeHtml(c.nombre_categoria_kpi)} (${c.porcentaje_categoria}%)</option>`).join('') || '');
  } catch (err) {
    console.warn('Fallo al traer puesto-categorias, usando fallback global de categorias:', err);
    kpiCategoriaSelect.innerHTML = '<option value="">Seleccione una categoría</option>' +
      (categorias.map(c => `<option value="${c.id_categoria_kpi}">${escapeHtml(c.nombre_categoria_kpi)}</option>`).join(''));
  }


  // cargar asignaciones actuales para este personal
  await cargarAsignacionesEvaluador(personal.id_personal);

  // evento al cambiar categoría
    // variables de cierre para esta instancia del modal
  let implicitAssignments = []; // { id_kpi, selectedPersonal, kpiObj, posibles }
  
  // evento al cambiar categoría
    // evento al cambiar categoría
    // evento al cambiar categoría
  kpiCategoriaSelect.onchange = async (ev) => {
    const idCat = parseInt(ev.target.value);
    // Si no hay categoría seleccionada
    if (!idCat) {
      document.getElementById('kpiListContainer').innerHTML = '<div class="text-muted text-center py-3">Seleccione una categoría para ver sus KPIs.</div>';
      return;
    }

    // Si la categoría es 3 (Evaluación del desempeño 360) -> no mostrar KPIs para asignación
    if (idCat === 3) {
      document.getElementById('kpiListContainer').innerHTML =
        `<div class="alert alert-secondary">
           <strong>Evaluación 360</strong> — Esta categoría se evalúa de forma distinta y no requiere asignación manual del encargado de medición.
         </div>`;
      return;
    }

    // Cargar KPIs de la categoría (y filtrar por si acaso hay KPIs con id_categoria_kpi === 3)
    const kpis = await cargarKpisPorCategoria(idCat);
    if (!Array.isArray(kpis)) {
      renderKpiList([], personal.id_personal);
      return;
    }

    // construir items extendidos: incluir automáticos (<=1 posible) como elementos con isAutomatic=true
    const items = kpis
      .filter(k => k.id_categoria_kpi !== 3) // doble seguridad: excluir 360 aun cuando el backend devolviera alguno
      .map(k => {
        const posibles = getPersonalesByRole(k.id_rol || 0);
        const cached = evaluadorKpiCache[k.id_kpi] && evaluadorKpiCache[k.id_kpi].evaluador_personal_id
                       ? parseInt(evaluadorKpiCache[k.id_kpi].evaluador_personal_id)
                       : null;
        const assigned = cached != null ? cached : (posibles.length === 1 ? posibles[0].id_personal : null);
        return { k, posibles, assignedPersonal: assigned, isAutomatic: (posibles.length <= 1) };
      });

    // render todos (los automáticos aparecerán pero con select disabled y borde verde si tienen assigned)
    renderKpiList(items, personal.id_personal);
  };


  // habilitar botón Guardar: recolecta todos los selects (incluidos disabled) y guarda cambios
  const saveBtn = document.getElementById('kpiSaveAllBtn');
  saveBtn.onclick = async () => {
    const selects = Array.from(document.querySelectorAll('.encargados-select'));
    const changes = selects.map(s => {
      const id_kpi = parseInt(s.dataset.kpiId);
      // si select está deshabilitado también tiene un value (el asignado automáticamente)
      const selectedPersonal = s.value ? parseInt(s.value) : null;
      const current = evaluadorKpiCache[id_kpi] || {};
      const currentPersonal = current.evaluador_personal_id ? parseInt(current.evaluador_personal_id) : null;
      return { id_kpi, selectedPersonal, currentPersonal };
    }).filter(ch => ch.selectedPersonal !== ch.currentPersonal);

    if (changes.length === 0) {
      Swal.fire('Sin cambios', 'No hay cambios que guardar.', 'info');
      return;
    }

    const results = [];
    for (const ch of changes) {
      try {
        const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
        const { csrfToken } = await csrfRes.json();
        const body = {
          id_kpi: ch.id_kpi,
          id_personal_target: personal.id_personal,
          id_personal_evaluador: ch.selectedPersonal // puede ser null para eliminar
        };
        const resp = await fetch('/evaluador_kpi', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CSRF-Token': csrfToken
          },
          credentials: 'include',
          body: JSON.stringify(body)
        });
        const json = await resp.json();
        if (!resp.ok || !json.success) throw new Error(json.message || `Error ${resp.status}`);
        results.push({ ok: true, id_kpi: ch.id_kpi });
      } catch (err) {
        console.error('Error guardando evaluador_kpi', ch, err);
        results.push({ ok: false, id_kpi: ch.id_kpi, error: err.message || err });
      }
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length) {
      Swal.fire('Parcial', `${results.length - failed.length} guardados. ${failed.length} fallaron. Revisa la consola.`, 'warning');
    } else {
      Swal.fire('Éxito', 'Encargados de medición actualizados.', 'success');
      await cargarAsignacionesEvaluador(personal.id_personal);
      // refrescar vista (re-trigger change)
      const evt = new Event('change');
      kpiCategoriaSelect.dispatchEvent(evt);
    }
  };

  // finalmente mostrar modal
  const modalEl = document.getElementById('kpiModal');
  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();
}

/* ---------- END: KPI modal & helpers ---------- */


// recuerda invocar cargarPuestosRolesMap() junto a tus cargas iniciales
// por ejemplo: await Promise.all([cargarPersonal(), cargarPuestos(), cargarRoles(), cargarCategorias(), cargarPuestosRolesMap()]);


  personalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fecha_nacimiento = document.getElementById('fecha_nacimiento').value;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fecha_nacimiento)) {
      Swal.fire('Error', 'La fecha de nacimiento debe estar en formato YYYY-MM-DD', 'error');
      return;
    }

    const id_personal = document.getElementById('id_personal').value;
    const nombre = document.getElementById('nombre').value;
    const apaterno = document.getElementById('apaterno').value;
    const amaterno = document.getElementById('amaterno').value;
    const telefono = document.getElementById('telefono').value;
    const id_puesto = document.getElementById('id_puesto').value;
    const estado = document.getElementById('estado').value;
    const correo = document.getElementById('correo').value;
    const contrasena = document.getElementById('contrasena').value;

    const data = { nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado, id_puesto, correo };
    if (contrasena) data.contrasena = contrasena;

    try {
      const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      const url = id_personal ? `/personal/${id_personal}` : '/personal';
      const method = id_personal ? 'PUT' : 'POST';
      console.log('Enviando datos a', url, ':', JSON.stringify(data));
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
      console.log('Respuesta de', url, ':', result);
      if (!response.ok) {
        throw new Error(result.message || `Error en la solicitud: ${response.status}`);
      }

      if (result.success) {
        personalModal.hide();
        await cargarPersonal();
        Swal.fire('Éxito', result.message, 'success');
      } else {
        Swal.fire('Error', result.message || 'Error al guardar personal.', 'error');
      }
    } catch (error) {
      console.error('Error al guardar personal:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? `El servidor no tiene configurada la funcionalidad de ${id_personal ? 'edición' : 'guardado'} (/personal${id_personal ? '/:id' : ''}). Contacte al administrador.`
          : `Error al ${id_personal ? 'actualizar' : 'guardar'} personal. Asegúrese de que el servidor esté corriendo.`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) personalForm.dispatchEvent(new Event('submit'));
      });
    }
  });

  puestoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const roles = Array.from(document.querySelectorAll('.role-checkbox:checked')).map(checkbox => parseInt(checkbox.value));
    const categorias = Array.from(document.querySelectorAll('.categoria-checkbox:checked')).map(checkbox => parseInt(checkbox.value));

    if (roles.length === 0) {
      Swal.fire('Error', 'Debe seleccionar al menos un rol.', 'error');
      return;
    }

    const isDuplicate = await checkDuplicatePuesto(roles);
    if (isDuplicate) {
      Swal.fire('Error', 'Ya existe un puesto con esta combinación de roles.', 'error');
      return;
    }

    if (abrirModalPorcentajes(categorias)) {
      window.currentPuestoData = { roles, categorias };
    }
  });

  porcentajesForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const porcentajes = Array.from(document.querySelectorAll('.porcentaje-input'))
      .map(input => ({
        id_categoria_kpi: parseInt(input.id.replace('porcentaje_', '')),
        porcentaje_categoria: parseInt(input.value) || 0
      }));
    const total = porcentajes.reduce((sum, p) => sum + p.porcentaje_categoria, 0);

    if (total !== 100) {
      Swal.fire('Error', 'La suma de los porcentajes debe ser exactamente 100%.', 'error');
      return;
    }

    const data = {
      roles: window.currentPuestoData.roles,
      categorias: porcentajes
    };
    console.log('Enviando datos a /puestos:', JSON.stringify(data));

    try {
      const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      const response = await fetch('/puestos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      const result = await response.json();
      console.log('Respuesta del servidor:', result);

      if (!response.ok) {
        throw new Error(result.message || `Error en la solicitud: ${response.status}`);
      }

      if (result.success) {
        porcentajesModal.hide();
        puestoModal.hide();
        await cargarPuestos();
        Swal.fire('Éxito', result.message, 'success');
      } else {
        Swal.fire('Error', result.message || 'Error al guardar puesto.', 'error');
      }
    } catch (error) {
      console.error('Error al guardar puesto:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('409') 
          ? 'Ya existe un puesto con esta combinación de roles.'
          : 'Error al guardar puesto. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) porcentajesForm.dispatchEvent(new Event('submit'));
      });
    }
  });

  // Delegación para el list-group
 // Delegación para el list-group
listaPersonalList.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('.editBtn');
  if (editBtn) {
    const id = editBtn.dataset.id;
    try {
      const personal = await fetchWithRetry(`/personal/${id}`, { credentials: 'include' });
      abrirModalPersonal(personal);
    } catch (error) {
      console.error('Error al cargar datos de personal:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404')
          ? 'El servidor no tiene configurada la funcionalidad de edición (/personal/:id). Contacte al administrador.'
          : 'No se pudieron cargar los datos del personal. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      });
    }
    return; // importante: evitar que caiga en el siguiente handler
  }

  const adjustBtn = e.target.closest('.adjustKpiBtn');
  if (adjustBtn) {
    const id = adjustBtn.dataset.id;
    try {
      const personal = await fetchWithRetry(`/personal/${id}`, { credentials: 'include' });
      // abre directamente el modal de KPIs (no el modal de edición)
      openKpiModalForPersonal(personal);
    } catch (error) {
      console.error('Error al cargar personal para KPIs:', error);
      Swal.fire('Error', 'No se pudieron cargar los datos del personal para ajustar KPIs.', 'error');
    }
    return;
  }
});



  buscadorPersonal.addEventListener('input', () => {
    mostrarPersonal(todosPersonal);
  });

  addPersonalBtn.addEventListener('click', () => abrirModalPersonal());
  addPuestoBtn.addEventListener('click', () => abrirModalPuesto());

  await Promise.all([cargarPersonal(), cargarPuestos(), cargarRoles(), cargarCategorias(), cargarPuestosRolesMap()]);
});