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


async function uploadPhoto(personalId, file, csrfToken) {
  const fd = new FormData();
  fd.append('foto', file);
  const resp = await fetch(`/personal/${personalId}/photo`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      //'CSRF-Token': csrfToken  // opcional si tu servidor lo necesita
    },
    body: fd
  });

  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text(); // siempre lee como texto primero
  // intenta parsear JSON si viene JSON
  if (contentType.includes('application/json')) {
    const json = JSON.parse(text);
    if (!resp.ok || !json.success) throw new Error(json.message || `Error ${resp.status}`);
    return json;
  } else {
    // muestra el contenido HTML o texto para debugging
    console.error('Respuesta no JSON de la subida:', resp.status, text);
    throw new Error(`Respuesta inesperada del servidor: status ${resp.status}`);
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

  const fotoInput = document.getElementById('foto_personal');
  const fotoPreview = document.getElementById('fotoPreview');

  // preview local cuando el usuario selecciona archivo
  if (fotoInput && fotoPreview) {
    fotoInput.addEventListener('change', (ev) => {
      const file = ev.target.files[0];
      if (!file) {
        fotoPreview.src = '/assets/img/iconousuario.png';
        return;
      }
      const allowed = ['image/jpeg','image/png'];
      if (!allowed.includes(file.type)) {
        Swal.fire('Formato inválido', 'Solo se permiten JPG o PNG.', 'error');
        fotoInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) { // 5 MB
        Swal.fire('Archivo grande', 'El archivo supera 5 MB. Considera reducirlo.', 'warning');
      }
      const reader = new FileReader();
      reader.onload = () => fotoPreview.src = reader.result;
      reader.readAsDataURL(file);
    });
  }


  let todosPersonal = [];
  let todosPersonalAll = []; // Guarda todo lo recibido del servidor
  let showInactive = false;   // Por defecto: NO mostramos inactivos
  let puestos = [];
  let roles = [];
  let categorias = [];
  let selectedCategorias = [];

  async function cargarPersonal() {
    try {
      listaPersonalList.innerHTML = '<div class="text-muted text-center py-3">Cargando personal...</div>';
      todosPersonalAll = await fetchWithRetry('/personal', { credentials: 'include' });
      todosPersonal = todosPersonalAll; // Asignar a todosPersonal para mantener compatibilidad
      mostrarPersonal();
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

  function isActiveRecord(p) {
  const rawEstado = (p.estado_personal ?? '').toString().trim().toLowerCase();
  return (/\bactivo\b/i.test(rawEstado) || rawEstado === '1' || rawEstado === 'true');
}

function mostrarPersonal() {
  const textoBusqueda = buscadorPersonal.value.trim().toLowerCase();
  const base = (todosPersonalAll || []).filter(p => 
    showInactive ? !isActiveRecord(p) : isActiveRecord(p)
  );

  const filtrados = base.filter(p =>
    `${p.nombre_personal || ''} ${p.apaterno_personal || ''} ${p.amaterno_personal || ''} ${p.correo_usuario || ''}`
      .toLowerCase()
      .includes(textoBusqueda)
  );

  if (filtrados.length === 0) {
    listaPersonalList.innerHTML = `<div class="text-muted text-center py-3">No se encontró personal ${showInactive ? 'inactivo' : 'activo'}.</div>`;
    return;
  }
  

  listaPersonalList.innerHTML = filtrados.map(p => {
    const nombre = escapeHtml(`${p.nombre_personal || ''} ${p.apaterno_personal || ''} ${p.amaterno_personal || ''}`).trim() || 'Sin nombre';
    const puesto = escapeHtml(p.nombre_puesto || 'Sin puesto');
    const correo = escapeHtml(p.correo_usuario || 'Sin correo');
    const rawEstado = (p.estado_personal || '').toString().trim();
    const estadoLower = rawEstado.toLowerCase();

    let estadoClass = 'estado-unknown';
    if (/\binactivo\b/i.test(rawEstado) || estadoLower === '0' || estadoLower === 'false') {
      estadoClass = 'estado-inactivo';
    } else if (/\bactivo\b/i.test(rawEstado) || estadoLower === '1' || estadoLower === 'true') {
      estadoClass = 'estado-activo';
    }

    const estadoHtml = `<span class="estado ${estadoClass}">${escapeHtml(rawEstado || 'Sin estado')}</span>`;
    const inactiveRowStyle = (estadoClass === 'estado-inactivo') ? 'opacity:0.85;' : '';

    const fotoUrl = escapeHtml(p.foto_url || p.foto || '/assets/img/iconousuario.png');
console.log(`Personal: ${p.nombre_personal} -> Foto URL: ${fotoUrl}`);
    return `
      <div class="list-group-item" data-id="${p.id_personal || ''}" style="${inactiveRowStyle}">
        <div class="item-body d-flex">
          <img src="${fotoUrl}" alt="Foto" class="avatar me-3" style="width:48px; height:48px; object-fit:cover; border-radius:50%; border:1px solid #e4e4e4;">
          <div style="flex:1 1 auto;">
            <div class="item-header">
              <h6 class="mb-1 text-danger fw-bold" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${nombre}</h6>
            </div>
            <div class="small-muted mt-1">
              <div class=""><strong>${puesto}</strong></div>
              <div class="mail"><strong>Correo:</strong> ${correo}</div>
            </div>
          </div>
          <div class="item-actions d-flex flex-column gap-1">
            <button class="btn btn-edit btn-sm editBtn" title="Editar" aria-label="Editar" data-id="${p.id_personal || ''}">
              <i class="fas fa-pencil-alt"></i><span>Editar</span>
            </button>
            <button class="btn btn-kpi btn-sm adjustKpiBtn" title="Ajustar KPIs" aria-label="Ajustar KPIs" data-id="${p.id_personal || ''}">
              <i class="fas fa-tachometer-alt"></i><span>Ajustar KPIs</span>
            </button>
            <button class="btn btn-assign-kpi btn-sm assignKpiBtn" title="Asignar KPIs" aria-label="Asignar KPIs" data-id="${p.id_personal || ''}">
              <i class="fas fa-tasks"></i><span>Asignar KPIs</span>
            </button>
            <button class="btn btn-kpi btn-sm assingJefeBtn" title="Ajustar Jefe Directo" aria-label="Ajustar Jefe Directo" data-id="${p.id_personal || ''}">
              <i class="fas fa-pencil-alt"></i><span>Jefe Directo</span>
            </button>
          </div>
        </div>
      </div>
    `;

  }).join('');

  // Attach event listeners for buttons
  listaPersonalList.querySelectorAll('.editBtn').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  listaPersonalList.querySelectorAll('.editBtn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
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

  listaPersonalList.querySelectorAll('.assignKpiBtn').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  listaPersonalList.querySelectorAll('.assignKpiBtn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) return;
      try {
        const personal = await fetchWithRetry(`/personal/${id}`, { credentials: 'include' });
        openAssignKpiModalForPersonal(personal);
      } catch (err) {
        console.error('Error al cargar personal para asignar KPIs:', err);
        Swal.fire('Error', 'No se pudieron cargar los datos del personal para asignar KPIs.', 'error');
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
  const estadoField = document.getElementById('estado');
  const estadoFormGroup = document.getElementById('estadoFormGroup') || (estadoField ? estadoField.closest('.mb-3, .form-group') || estadoField.parentElement : null);
  const contrasenaField = document.getElementById('contrasena');

  if (personal) {
    // Modo Editar
    modalTitle.textContent = 'Editar Personal';
    document.getElementById('id_personal').value = personal.id_personal || '';
    document.getElementById('nombre').value = personal.nombre_personal || '';
    document.getElementById('apaterno').value = personal.apaterno_personal || '';
    document.getElementById('amaterno').value = personal.amaterno_personal || '';
    document.getElementById('fecha_nacimiento').value = personal.fecha_nacimiento_personal || '';
    document.getElementById('telefono').value = personal.telefono_personal || '';
    document.getElementById('id_puesto').value = personal.id_puesto || '';
    if (estadoField) estadoField.value = personal.estado_personal || '';
    document.getElementById('correo').value = personal.correo_usuario || '';
    if (contrasenaField) {
      contrasenaField.value = '';
      contrasenaField.placeholder = 'Dejar en blanco para no cambiar';
      contrasenaField.required = false;
      contrasenaField.style.display = '';
    }
    if (estadoFormGroup) estadoFormGroup.style.display = '';
    if (estadoField) estadoField.removeAttribute('disabled');
  } else {
    // Modo Agregar
    modalTitle.textContent = 'Agregar Personal';
    personalForm.reset();
    document.getElementById('id_personal').value = '';
    if (contrasenaField) {
      contrasenaField.value = '';
      contrasenaField.placeholder = 'Se generará una contraseña por defecto si lo dejas vacío';
      contrasenaField.required = false;
      contrasenaField.style.display = '';
    }
    if (estadoFormGroup) estadoFormGroup.style.display = 'none';
    if (estadoField) estadoField.setAttribute('disabled', 'true');
  }

  if (personal && fotoPreview) {
  fotoPreview.src = personal.foto_url || personal.foto || '/assets/img/iconousuario.png';
  }
  if (!personal && fotoPreview) {
    fotoPreview.src = '/assets/img/iconousuario.png';
    if (fotoInput) fotoInput.value = ''; // limpiar en modo crear
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
            <div id="kpiListContainer">
              <div class="text-muted text-center py-3">Seleccione una categoría para ver sus KPIs.</div>
            </div>
          </div>
          <div class="modal-footer">
            <button id="kpiSaveAllBtn" type="button" class="btn btn-danger">Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  /* ---------- START: Assign KPI modal & helpers ---------- */

  function ensureAssignKpiModalExists() {
    if (document.getElementById('assignKpiModal')) return;
    const modalHtml = `
    <div class="modal fade" id="assignKpiModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Asignar KPIs - <span id="assignKpiModalPersonalName"></span></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label for="assignKpiCategoriaSelect" class="form-label">Seleccionar categoría</label>
              <select id="assignKpiCategoriaSelect" class="form-select">
                <option value="">Seleccione una categoría</option>
              </select>
            </div>
            <div id="assignKpiListContainer">
              <div class="text-muted text-center py-3">Seleccione una categoría para ver sus KPIs.</div>
            </div>
          </div>
          <div class="modal-footer">
            <button id="assignKpiSaveAllBtn" type="button" class="btn btn-danger">Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Add event listener to reset modal on hide
    const modalEl = document.getElementById('assignKpiModal');
    modalEl.addEventListener('hidden.bs.modal', () => {
      const assignKpiCategoriaSelect = document.getElementById('assignKpiCategoriaSelect');
      const assignKpiListContainer = document.getElementById('assignKpiListContainer');
      assignKpiCategoriaSelect.value = '';
      assignKpiListContainer.innerHTML = '<div class="text-muted text-center py-3">Seleccione una categoría para ver sus KPIs.</div>';
    });
  }

  function ensureJefeModalExists() {
    if (document.getElementById('jefeModal')) return;
    const modalHtml = `
    <div class="modal fade" id="jefeModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Ajustar Jefe Directo - <span id="jefeModalPersonalName"></span></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <h6>Jefes actuales</h6>
            <ul id="jefeActualList" class="list-group mb-3"></ul>

            <h6>Selecciona su jefe directo</h6>
            <div id="jefeOpcionesList" class="list-group" style="max-height:320px; overflow:auto;"></div>
          </div>
          <div class="modal-footer">
            <button id="jefeSaveBtn" type="button" class="btn btn-danger">Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  async function openJefeModalForPersonal(personal) {
    ensureJefeModalExists();
    document.getElementById('jefeModalPersonalName').textContent =
      `${personal.nombre_personal || ''} ${personal.apaterno_personal || ''}`.trim();

    const jefeActualList = document.getElementById('jefeActualList');
    const jefeOpcionesList = document.getElementById('jefeOpcionesList');
    jefeActualList.innerHTML = '<li class="list-group-item text-muted">Cargando...</li>';
    jefeOpcionesList.innerHTML = '<div class="list-group-item">Cargando opciones...</div>';

    try {
      const resp = await fetchWithRetry(`/getJefe/${personal.id_personal}`, { credentials: 'include' });
      if (!resp.success) throw new Error(resp.message || 'Error en el servidor.');

      const jefes = resp.jefes || [];
      const personas = resp.personas || [];

      // Lista de jefes actuales
      jefeActualList.innerHTML = jefes.length === 0
        ? '<li class="list-group-item text-muted">No tiene jefes asignados</li>'
        : jefes.map(j => `<li class="list-group-item">${j.nombre_personal} ${j.apaterno_personal || ''}</li>`).join('');

      // Radios para elegir un nuevo jefe
      // Checkboxes para permitir más de un jefe
      const jefesActualesIds = jefes.map(j => String(j.id_personal));
      jefeOpcionesList.innerHTML = personas
        .filter(p => String(p.id_personal) !== String(personal.id_personal)) // excluir a sí mismo
        .map(p => {
          const pid = String(p.id_personal);
          const nombre = `${p.nombre_personal} ${p.apaterno_personal || ''} ${p.amaterno_personal || ''}`.trim();
          const checked = jefesActualesIds.includes(pid) ? 'checked' : '';
          return `
            <label class="list-group-item d-flex align-items-center" style="cursor:pointer;">
              <input class="form-check-input me-2" type="checkbox" name="nuevoJefe" value="${pid}" ${checked}>
              <div>${nombre}</div>
            </label>`;
        }).join('');


      // Guardar cambios
      document.getElementById('jefeSaveBtn').onclick = async () => {
        const selected = Array.from(document.querySelectorAll('input[name="nuevoJefe"]:checked'))
          .map(cb => cb.value);

        if (selected.length === 0) {
          Swal.fire('Atención', 'Debes seleccionar al menos un jefe.', 'warning');
          return;
        }

        try {
          const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
          const { csrfToken } = await csrfRes.json();
          const saveRes = await fetch('/asignarJefe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
            credentials: 'include',
            body: JSON.stringify({
              id_evaluador: personal.id_personal,
              jefes: [selected.value]
            })
          });
          const result = await saveRes.json();
          if (!saveRes.ok || !result.success) throw new Error(result.message || 'Error al guardar');

          Swal.fire('Éxito', 'Jefe asignado correctamente.', 'success');
          bootstrap.Modal.getInstance(document.getElementById('jefeModal')).hide();
          await cargarPersonal(); // refrescar lista
        } catch (err) {
          console.error(err);
          Swal.fire('Error', err.message || 'No se pudo guardar el jefe.', 'error');
        }
      };

      const modalEl = document.getElementById('jefeModal');
      const bsModal = new bootstrap.Modal(modalEl);
      bsModal.show();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.message, 'error');
    }
  }



  async function cargarAsignacionesPuestoKpi(puestoId) {
    try {
      const resp = await fetchWithRetry(`/puesto-kpi?puesto=${puestoId}`, { credentials: 'include' });
      const arr = (resp && resp.data) ? resp.data : resp;
      const puestoKpiCache = {};
      (arr || []).forEach(row => {
        puestoKpiCache[row.id_kpi] = true;
      });
      return puestoKpiCache;
    } catch (err) {
      console.error('Error cargando asignaciones Puesto_Kpi:', err);
      return {};
    }
  }

  function renderAssignKpiList(items, puestoId) {
    const container = document.getElementById('assignKpiListContainer');
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="text-muted text-center py-3">No hay KPIs en esta categoría.</div>';
      return;
    }

    const html = items.map(k => {
      const isAssigned = k.isAssigned;
      const cardClass = isAssigned ? 'border border-2 border-success' : '';

      return `
        <div class="card mb-2 ${cardClass}" data-kpi-id="${k.id_kpi}">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h6 class="mb-1">${escapeHtml(k.nombre_kpi)}</h6>
                <small class="text-muted">Meta: ${k.meta_kpi} · Tipo: ${k.tipo_kpi}</small>
              </div>
              <div>
                <input type="checkbox" class="form-check-input kpi-checkbox" data-kpi-id="${k.id_kpi}" ${isAssigned ? 'checked' : ''}>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    document.querySelectorAll('.kpi-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (ev) => {
        const card = ev.target.closest('.card');
        if (!card) return;
        if (ev.target.checked) {
          card.classList.add('border', 'border-2', 'border-success');
        } else {
          card.classList.remove('border', 'border-2', 'border-success');
        }
      });
    });
  }

  async function openAssignKpiModalForPersonal(personal) {
    ensureAssignKpiModalExists();
    document.getElementById('assignKpiModalPersonalName').textContent = `${personal.nombre_personal || ''} ${personal.apaterno_personal || ''}`.trim();
    const assignKpiCategoriaSelect = document.getElementById('assignKpiCategoriaSelect');

    try {
      const resp = await fetchWithRetry(`/puesto-categorias?puesto=${personal.id_puesto}`, { credentials: 'include' });
      const puestoCategorias = (resp && resp.data) ? resp.data : resp;
      assignKpiCategoriaSelect.innerHTML = '<option value="">Seleccione una categoría</option>' +
        (puestoCategorias.map(c => `<option value="${c.id_categoria_kpi}">${escapeHtml(c.nombre_categoria_kpi)} (${c.porcentaje_categoria}%)</option>`).join('') || '');
    } catch (err) {
      console.warn('Fallo al traer puesto-categorias, usando fallback global de categorias:', err);
      assignKpiCategoriaSelect.innerHTML = '<option value="">Seleccione una categoría</option>' +
        (categorias.map(c => `<option value="${c.id_categoria_kpi}">${escapeHtml(c.nombre_categoria_kpi)}</option>`).join(''));
    }

    const puestoKpiCache = await cargarAsignacionesPuestoKpi(personal.id_puesto);

    assignKpiCategoriaSelect.onchange = async (ev) => {
      const idCat = parseInt(ev.target.value);
      if (!idCat) {
        document.getElementById('assignKpiListContainer').innerHTML = '<div class="text-muted text-center py-3">Seleccione una categoría para ver sus KPIs.</div>';
        return;
      }

      const kpis = await cargarKpisPorCategoria(idCat);
      if (!Array.isArray(kpis)) {
        renderAssignKpiList([], personal.id_puesto);
        return;
      }

      const items = kpis.map(k => ({
        ...k,
        isAssigned: !!puestoKpiCache[k.id_kpi]
      }));

      renderAssignKpiList(items, personal.id_puesto);
    };

    const saveBtn = document.getElementById('assignKpiSaveAllBtn');
    saveBtn.onclick = async () => {
      const checkboxes = Array.from(document.querySelectorAll('.kpi-checkbox'));
      const changes = checkboxes.map(checkbox => {
        const id_kpi = parseInt(checkbox.dataset.kpiId);
        const isChecked = checkbox.checked;
        const isCurrentlyAssigned = !!puestoKpiCache[id_kpi];
        return { id_kpi, isChecked, isCurrentlyAssigned };
      }).filter(ch => ch.isChecked !== ch.isCurrentlyAssigned);

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
            id_puesto: personal.id_puesto,
            id_kpi: ch.id_kpi
          };
          const method = ch.isChecked ? 'POST' : 'DELETE';
          const resp = await fetch('/puesto-kpi', {
            method,
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
          // Update cache immediately
          puestoKpiCache[ch.id_kpi] = ch.isChecked;
        } catch (err) {
          console.error('Error guardando puesto_kpi', ch, err);
          results.push({ ok: false, id_kpi: ch.id_kpi, error: err.message || err });
        }
      }

      const failed = results.filter(r => !r.ok);
      if (failed.length) {
        Swal.fire('Parcial', `${results.length - failed.length} guardados. ${failed.length} fallaron. Revisa la consola.`, 'warning');
      } else {
        Swal.fire('Éxito', 'Asignaciones de KPIs actualizadas.', 'success');
        // Refresh the KPI list to reflect changes
        const currentCatId = parseInt(assignKpiCategoriaSelect.value);
        if (currentCatId) {
          const kpis = await cargarKpisPorCategoria(currentCatId);
          if (Array.isArray(kpis)) {
            const items = kpis.map(k => ({
              ...k,
              isAssigned: !!puestoKpiCache[k.id_kpi]
            }));
            renderAssignKpiList(items, personal.id_puesto);
          }
        }
      }
    };

    const modalEl = document.getElementById('assignKpiModal');
    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
  }

  /* ---------- END: Assign KPI modal & helpers ---------- */

  let puestosRolesMap = {};
  let roleToPuestosMap = {};
  let evaluadorKpiCache = {};

  async function cargarPuestosRolesMap() {
    try {
      const raw = await fetchWithRetry('/puestos/roles', { credentials: 'include' });
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
    const puestosQueTienenRol = roleToPuestosMap[idRol] || [];
    return todosPersonal.filter(p => puestosQueTienenRol.includes(p.id_puesto));
  }

  async function cargarKpisPorCategoria(id_categoria) {
    if (!id_categoria) return [];
    const resp = await fetchWithRetry(`/kpis?categoria=${id_categoria}`, { credentials: 'include' });
    return (resp && resp.data) ? resp.data : resp;
  }

  async function cargarAsignacionesEvaluador(personalId) {
    try {
      const resp = await fetchWithRetry(`/evaluador_kpi?personal=${personalId}`, { credentials: 'include' });
      const arr = (resp && resp.data) ? resp.data : resp;
      evaluadorKpiCache = {};
      (arr || []).forEach(row => {
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

      const cardClass = assignedPersonalId ? 'border border-2 border-success' : '';
      const disabledAttr = isAutomatic ? 'disabled' : '';

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
    await cargarPuestosRolesMap();
    document.getElementById('kpiModalPersonalName').textContent = `${personal.nombre_personal || ''} ${personal.apaterno_personal || ''}`.trim();
    const kpiCategoriaSelect = document.getElementById('kpiCategoriaSelect');

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

    await cargarAsignacionesEvaluador(personal.id_personal);

    kpiCategoriaSelect.onchange = async (ev) => {
      const idCat = parseInt(ev.target.value);
      if (!idCat) {
        document.getElementById('kpiListContainer').innerHTML = '<div class="text-muted text-center py-3">Seleccione una categoría para ver sus KPIs.</div>';
        return;
      }

      if (idCat === 3) {
        document.getElementById('kpiListContainer').innerHTML =
          `<div class="alert alert-secondary">
             <strong>Evaluación 360</strong> — Esta categoría se evalúa de forma distinta y no requiere asignación manual del encargado de medición.
           </div>`;
        return;
      }

      const kpis = await cargarKpisPorCategoria(idCat);
      if (!Array.isArray(kpis)) {
        renderKpiList([], personal.id_personal);
        return;
      }

      const items = kpis
        .filter(k => k.id_categoria_kpi !== 3)
        .map(k => {
          const posibles = getPersonalesByRole(k.id_rol || 0);
          const cached = evaluadorKpiCache[k.id_kpi] && evaluadorKpiCache[k.id_kpi].evaluador_personal_id
                         ? parseInt(evaluadorKpiCache[k.id_kpi].evaluador_personal_id)
                         : null;
          const assigned = cached != null ? cached : (posibles.length === 1 ? posibles[0].id_personal : null);
          return { k, posibles, assignedPersonal: assigned, isAutomatic: (posibles.length <= 1) };
        });

      renderKpiList(items, personal.id_personal);
    };

    const saveBtn = document.getElementById('kpiSaveAllBtn');
    saveBtn.onclick = async () => {
      const selects = Array.from(document.querySelectorAll('.encargados-select'));
      const changes = selects.map(s => {
        const id_kpi = parseInt(s.dataset.kpiId);
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
            id_personal_evaluador: ch.selectedPersonal
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
        const evt = new Event('change');
        kpiCategoriaSelect.dispatchEvent(evt);
      }
    };

    const modalEl = document.getElementById('kpiModal');
    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
  }

  /* ---------- END: KPI modal & helpers ---------- */

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
  const correo = document.getElementById('correo').value;
  const contrasena = document.getElementById('contrasena').value;

  const data = { nombre, apaterno, amaterno, fecha_nacimiento, telefono, id_puesto, correo };
  if (contrasena) data.contrasena = contrasena; // Solo incluir contraseña si no está vacía
  if (id_personal) {
    const estado = document.getElementById('estado') ? document.getElementById('estado').value : undefined;
    if (estado !== undefined) data.estado = estado;
  }

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
      // obtenemos id del registro creado/actualizado
      const createdId = (result.data && result.data.id_personal) ? result.data.id_personal : (id_personal || result.id_personal || result.id);

      // si el usuario escogió archivo, subirlo
      const file = fotoInput && fotoInput.files && fotoInput.files[0];
      if (file && createdId) {
        try {
          const csrfRes2 = await fetch('/csrf-token', { credentials: 'include' });
          const { csrfToken: csrfToken2 } = await csrfRes2.json();
          await uploadPhoto(createdId, file, csrfToken2);
        } catch (err) {
          console.error('Error subiendo foto:', err);
          Swal.fire('Advertencia', 'Datos guardados, pero falló la subida de la foto. Revisa la consola.', 'warning');
        }
      }

      personalModal.hide();
      await cargarPersonal();
      Swal.fire('Éxito', result.message || 'Personal guardado.', 'success');
    } else {
      Swal.fire('Error', result.message || 'Error al guardar personal.', 'error');
    }

  } catch (error) {
    console.error('Error al guardar personal:', error);
    Swal.fire({
      title: 'Error',
      text: error.message.includes('404') 
        ? `El servidor no tiene configurada la funcionalidad de ${id_personal ? 'edición' : 'guardado'} (/personal${id_personal ? '/:id' : ''}). Contacte al administrador.`
        : `Error al ${id_personal ? 'actualizar' : 'guardar'} personal: ${error.message}`,
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
      return;
    }

    const adjustBtn = e.target.closest('.adjustKpiBtn');
    if (adjustBtn) {
      const id = adjustBtn.dataset.id;
      try {
        const personal = await fetchWithRetry(`/personal/${id}`, { credentials: 'include' });
        openKpiModalForPersonal(personal);
      } catch (error) {
        console.error('Error al cargar personal para KPIs:', error);
        Swal.fire('Error', 'No se pudieron cargar los datos del personal para ajustar KPIs.', 'error');
      }
      return;
    }

    const assignKpiBtn = e.target.closest('.assignKpiBtn');
    if (assignKpiBtn) {
      const id = assignKpiBtn.dataset.id;
      try {
        const personal = await fetchWithRetry(`/personal/${id}`, { credentials: 'include' });
        openAssignKpiModalForPersonal(personal);
      } catch (error) {
        console.error('Error al cargar personal para asignar KPIs:', error);
        Swal.fire('Error', 'No se pudieron cargar los datos del personal para asignar KPIs.', 'error');
      }
      return;
    }

    const assignJefeBtn = e.target.closest('.assingJefeBtn');
    if (assignJefeBtn) {
      const id = assignJefeBtn.dataset.id;
      try {
        const personal = await fetchWithRetry(`/personal/${id}`, { credentials: 'include' });
        openJefeModalForPersonal(personal);
      } catch (error) {
        console.error('Error al cargar personal para jefe:', error);
        Swal.fire('Error', 'No se pudieron cargar los datos del personal para asignar jefe.', 'error');
      }
      return;
    }

  });

  buscadorPersonal.addEventListener('input', () => {
    mostrarPersonal(todosPersonal);
  });

  addPersonalBtn.addEventListener('click', () => abrirModalPersonal());
  addPuestoBtn.addEventListener('click', () => abrirModalPuesto());


   // crea botón toggle para ver inactivos
  const toggleInactiveBtn = document.createElement('button');
  toggleInactiveBtn.id = 'toggleInactiveBtn';
  toggleInactiveBtn.type = 'button';
  toggleInactiveBtn.className = 'btn btn-outline-danger ms-2';
  toggleInactiveBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
  toggleInactiveBtn.setAttribute('aria-pressed', 'false');
  toggleInactiveBtn.setAttribute('title', 'Ver personal inactivo'); // tooltip

  // inserta visualmente después del botón "Agregar Puesto"
  addPuestoBtn.insertAdjacentElement('afterend', toggleInactiveBtn);

  // listener para alternar
  toggleInactiveBtn.addEventListener('click', () => {
    showInactive = !showInactive;

    toggleInactiveBtn.innerHTML = showInactive
      ? '<i class="fas fa-eye-slash"></i>'
      : '<i class="fas fa-user-slash"></i>';

    toggleInactiveBtn.classList.toggle('btn-outline-danger', !showInactive);
    toggleInactiveBtn.classList.toggle('btn-danger', showInactive);

    toggleInactiveBtn.setAttribute(
      'title',
      showInactive ? 'Ocultar personal inactivo' : 'Ver personal inactivo'
    );
    toggleInactiveBtn.setAttribute('aria-pressed', String(showInactive));

    mostrarPersonal(); // re-renderiza con el nuevo filtro
  });
  
  await Promise.all([cargarPersonal(), cargarPuestos(), cargarRoles(), cargarCategorias(), cargarPuestosRolesMap()]);
});