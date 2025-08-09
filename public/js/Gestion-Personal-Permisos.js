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
  const listaPersonal = document.querySelector('#listaPersonal tbody');
  listaPersonal.innerHTML = '<tr><td colspan="7" class="text-muted text-center">Cargando personal...</td></tr>';

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
      listaPersonal.innerHTML = '<tr><td colspan="7" class="text-muted text-center">Cargando personal...</td></tr>';
      todosPersonal = await fetchWithRetry('/personal', { credentials: 'include' });
      mostrarPersonal(todosPersonal);
    } catch (error) {
      console.error('Error al cargar personal:', error);
      listaPersonal.innerHTML = '<tr><td colspan="7" class="text-muted text-center">No se pudo cargar el personal. Verifique que el servidor esté corriendo.</td></tr>';
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
      `${p.nombre_personal} ${p.apaterno_personal} ${p.amaterno_personal} ${p.correo_usuario}`.toLowerCase().includes(textoBusqueda)
    );

    if (filtrados.length === 0) {
      listaPersonal.innerHTML = '<tr><td colspan="7" class="text-muted text-center">No se encontraron personas.</td></tr>';
      return;
    }

    listaPersonal.innerHTML = filtrados.map(p => `
      <tr>
        <td>${p.nombre_personal || 'Sin nombre'}</td>
        <td>${p.apaterno_personal || 'Sin apellido'}</td>
        <td>${p.amaterno_personal || 'Sin apellido'}</td>
        <td>${p.nombre_puesto || 'Sin puesto'}</td>
        <td>${p.correo_usuario || 'Sin correo'}</td>
        <td>${p.estado_personal || 'Sin estado'}</td>
        <td>
          <i class="fas fa-pencil-alt text-warning editBtn" data-id="${p.id_personal}" style="cursor: pointer; padding: 0.1rem;"></i>
        </td>
      </tr>
    `).join('');
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

  listaPersonal.parentElement.addEventListener('click', async (e) => {
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
        }).then(result => {
          if (result.isConfirmed) listaPersonal.parentElement.dispatchEvent(new Event('click'));
        });
      }
    }
  });

  buscadorPersonal.addEventListener('input', () => {
    mostrarPersonal(todosPersonal);
  });

  addPersonalBtn.addEventListener('click', () => abrirModalPersonal());
  addPuestoBtn.addEventListener('click', () => abrirModalPuesto());

  await Promise.all([cargarPersonal(), cargarPuestos(), cargarRoles(), cargarCategorias()]);
});