import { renderHeader } from '../assets/js/header.js';

async function obtenerCsrfToken() {
  try {
    const res = await fetch('/csrf-token', { credentials: 'include' });
    if (!res.ok) throw new Error(`Error al obtener CSRF token: ${res.status}`);
    const data = await res.json();
    return data.csrfToken;
  } catch (error) {
    console.error('Error al obtener CSRF token:', error);
    Swal.fire({
      title: 'Error',
      text: 'No se pudo conectar con el servidor para obtener el token de seguridad. Asegúrese de que el servidor esté corriendo.',
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Reintentar',
      cancelButtonText: 'Ir al inicio'
    }).then(result => {
      if (result.isConfirmed) window.location.reload();
      else window.location.href = '/';
    });
    return null;
  }
}

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
  const listaPersonal = document.querySelector('#listaPersonal tbody');
  listaPersonal.innerHTML = '<tr><td colspan="8" class="text-muted text-center">Cargando personal...</td></tr>';

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
  const personalForm = document.getElementById('personalForm');
  const modalTitle = document.getElementById('modalTitle');
  const addPersonalBtn = document.getElementById('addPersonalBtn');
  const buscadorPersonal = document.getElementById('buscadorPersonal');
  const idPuestoSelect = document.getElementById('id_puesto');
  const rolesContainer = document.getElementById('rolesContainer');

  let todosPersonal = [];
  let puestos = [];
  let roles = [];

  async function cargarPersonal() {
    try {
      listaPersonal.innerHTML = '<tr><td colspan="8" class="text-muted text-center">Cargando personal...</td></tr>';
      todosPersonal = await fetchWithRetry('/personal', { credentials: 'include' });
      mostrarPersonal(todosPersonal);
    } catch (error) {
      console.error('Error al cargar personal:', error);
      listaPersonal.innerHTML = '<tr><td colspan="8" class="text-muted text-center">No se pudo cargar el personal. Verifique que el servidor esté corriendo.</td></tr>';
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
      listaPersonal.innerHTML = '<tr><td colspan="8" class="text-muted text-center">No se encontraron personas.</td></tr>';
      return;
    }

    listaPersonal.innerHTML = filtrados.map(p => `
      <tr>
        <td>${p.nombre_personal || 'Sin nombre'}</td>
        <td>${p.apaterno_personal || 'Sin apellido'}</td>
        <td>${p.amaterno_personal || 'Sin apellido'}</td>
        <td>${p.nombre_puesto || 'Sin puesto'}</td>
        <td>${p.correo_usuario || 'Sin correo'}</td>
        <td>${p.roles || 'Sin roles'}</td>
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
    const rolesSelect = document.getElementById('roles');
    rolesSelect.innerHTML = '<option value="">Seleccione roles</option>' +
      roles.map(r => `<option value="${r.id_rol}">${r.nombre_rol}</option>`).join('');
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

  function abrirModal(personal = null) {
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
    const rolesSelect = document.getElementById('roles');
    const roleIds = personal.roles ? personal.roles.split(',').map(r => roles.find(rol => rol.nombre_rol === r.trim())?.id_rol).filter(id => id) : [];
    Array.from(rolesSelect.options).forEach(option => {
      option.selected = roleIds.includes(parseInt(option.value));
    });
  } else {
    modalTitle.textContent = 'Agregar Personal';
    personalForm.reset();
    document.getElementById('id_personal').value = '';
    document.getElementById('contrasena').placeholder = 'Ingrese contraseña';
    document.getElementById('contrasena').required = true;
    document.getElementById('roles').selectedIndex = 0; // Reset roles select
  }
  personalModal.show();
}

  personalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id_personal = document.getElementById('id_personal').value;
  const nombre = document.getElementById('nombre').value;
  const apaterno = document.getElementById('apaterno').value;
  const amaterno = document.getElementById('amaterno').value;
  const fecha_nacimiento = document.getElementById('fecha_nacimiento').value;
  const telefono = document.getElementById('telefono').value;
  const id_puesto = document.getElementById('id_puesto').value;
  const estado = document.getElementById('estado').value;
  const correo = document.getElementById('correo').value;
  const contrasena = document.getElementById('contrasena').value;
  const roles = Array.from(document.getElementById('roles').selectedOptions).map(option => option.value);

  const data = { nombre, apaterno, amaterno, fecha_nacimiento, telefono, estado, id_puesto, roles, correo };
  if (contrasena) data.contrasena = contrasena;

  try {
    const csrfToken = await obtenerCsrfToken();
    if (!csrfToken) return;

    const method = id_personal ? 'PUT' : 'POST';
    const url = id_personal ? `/personal/${id_personal}` : '/personal';
    const response = await fetchWithRetry(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (response.success) {
      personalModal.hide();
      await cargarPersonal();
      Swal.fire('Éxito', response.message, 'success');
    } else {
      Swal.fire('Error', response.message || 'Error al guardar personal.', 'error');
    }
  } catch (error) {
    console.error('Error al guardar personal:', error);
    Swal.fire({
      title: 'Error',
      text: error.message.includes('404') 
        ? 'El servidor no tiene configurada la funcionalidad de guardado (/personal). Contacte al administrador.'
        : 'Error al guardar personal. Asegúrese de que el servidor esté corriendo.',
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Reintentar',
      cancelButtonText: 'Cancelar'
    }).then(result => {
      if (result.isConfirmed) personalForm.dispatchEvent(new Event('submit'));
    });
  }
});

  listaPersonal.parentElement.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.editBtn');
    if (editBtn) {
      const id = editBtn.dataset.id;
      try {
        const personal = await fetchWithRetry(`/personal/${id}`, { credentials: 'include' });
        abrirModal(personal);
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

  addPersonalBtn.addEventListener('click', () => abrirModal());

  await Promise.all([cargarPersonal(), cargarPuestos(), cargarRoles()]);
});