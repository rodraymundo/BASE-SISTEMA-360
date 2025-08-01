import { renderHeader } from '../assets/js/header.js';

async function obtenerCsrfToken() {
  const res = await fetch('/csrf-token', { credentials: 'include' });
  const data = await res.json();
  return data.csrfToken;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/auth-check', { credentials: 'include' });
    const data = await response.json();

    if (!data.authenticated) {
      window.location.href = '/';
      return;
    }

    document.getElementById('header-container').appendChild(renderHeader(data.user));
  } catch (error) {
    console.error('Error verificando sesión:', error);
    return;
  }

  const gradoSelect = document.getElementById('gradoSelect');
  const grupoSelect = document.getElementById('grupoSelect');
  const listaAlumnos = document.getElementById('listaAlumnos');
  const btnAdelantar = document.getElementById('btnAdelantarCiclo');
  const buscadorAlumnos = document.getElementById('buscadorAlumnos');
  const nuevoGradoSelect = document.getElementById('nuevoGradoSelect');
  const nuevoGrupoSelect = document.getElementById('nuevoGrupoSelect');
  const btnCambiar = document.getElementById('btnCambiar');

  let todosAlumnos = [];
  let seleccionadosSet = new Set();

  async function cargarGrados() {
    const grados = await fetch('/grados').then(res => res.json());
    gradoSelect.innerHTML =
      `<option value="todos">Todos</option>` +
      grados.map(g => `<option value="${g}">${g}°</option>`).join('');
    nuevoGradoSelect.innerHTML =
      '<option value="">Selecciona grado</option>' +
      grados.map(g => `<option value="${g}">${g}°</option>`).join('');
  }

  await cargarGrados();

  async function cargarGrupos(grado, selectElement, placeholder = 'Selecciona grupo') {
    if (!grado) {
      selectElement.innerHTML = `<option value="">${placeholder}</option>`;
      return;
    }
    const grupos = await fetch(`/grupos-por-grado/${grado}`).then(res => res.json());
    selectElement.innerHTML = grupos.length
      ? grupos.map(g => `<option value="${g.id_grado_grupo}">${g.grupo}</option>`).join('')
      : `<option value="">No hay grupos</option>`;
  }

  async function cargarAlumnos(grado, todos = false) {
    if (todos) {
      todosAlumnos = await fetch('/alumnos-todos').then(res => res.json());
    } else if (!grado) {
      listaAlumnos.innerHTML = '<p class="text-muted">Selecciona un grado para mostrar alumnos.</p>';
      todosAlumnos = [];
      mostrarAlumnos([]);
      return;
    } else {
      todosAlumnos = await fetch(`/alumnos-por-grado/${grado}`).then(res => res.json());
    }
    mostrarAlumnos(todosAlumnos);
  }

  function mostrarAlumnos(alumnos) {
    const textoBusqueda = buscadorAlumnos.value.trim().toLowerCase();
    const grupoFiltro = grupoSelect.value;

    const filtrados = alumnos.filter(a => {
      const nombreCompleto = `${a.apaterno_alumno} ${a.amaterno_alumno} ${a.nombre_alumno}`.toLowerCase();
      const cumpleBusqueda = nombreCompleto.includes(textoBusqueda);

      const cumpleGrupo = (gradoSelect.value === 'todos')
        ? true
        : (grupoFiltro ? a.id_grado_grupo == grupoFiltro : true);

      return cumpleBusqueda && cumpleGrupo;
    });

    if (filtrados.length === 0) {
      listaAlumnos.innerHTML = '<p class="text-muted">No se encontraron alumnos.</p>';
      return;
    }

    listaAlumnos.innerHTML = filtrados.map(a => `
      <label class="list-group-item">
        <input type="checkbox" value="${a.id_alumno}" class="form-check-input me-1" ${seleccionadosSet.has(a.id_alumno) ? 'checked' : ''} />
        ${a.apaterno_alumno} ${a.amaterno_alumno} ${a.nombre_alumno}
      </label>
    `).join('');

    listaAlumnos.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = parseInt(cb.value);
        if (cb.checked) {
          seleccionadosSet.add(id);
        } else {
          seleccionadosSet.delete(id);
        }
      });
    });
  }

  gradoSelect.addEventListener('change', async () => {
    const grado = gradoSelect.value;

    if (grado === 'todos') {
      await cargarAlumnos(null, true);
      grupoSelect.innerHTML = '<option value="">Todos</option>';
      grupoSelect.value = '';
    } else {
      await cargarGrupos(grado, grupoSelect);
      grupoSelect.value = '';
      await cargarAlumnos(grado);
    }
  });

  grupoSelect.addEventListener('change', () => {
    mostrarAlumnos(todosAlumnos);
  });

  nuevoGradoSelect.addEventListener('change', async () => {
    const grado = nuevoGradoSelect.value;
    await cargarGrupos(grado, nuevoGrupoSelect, 'Selecciona nuevo grupo');
  });

  buscadorAlumnos.addEventListener('input', () => {
    mostrarAlumnos(todosAlumnos);
  });

  btnCambiar.addEventListener('click', async () => {
    const nuevoIdGradoGrupo = nuevoGrupoSelect.value;

    if (!nuevoIdGradoGrupo) {
      Swal.fire('Advertencia', 'Selecciona un nuevo grado y grupo válidos.', 'warning');
      return;
    }

    if (seleccionadosSet.size === 0) {
      Swal.fire('Advertencia', 'Selecciona al menos un alumno para cambiar grado y grupo.', 'warning');
      return;
    }

    const csrfToken = await obtenerCsrfToken();

    const res = await fetch('/asignar-grupo-a-varios', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      credentials: 'include',
      body: JSON.stringify({ id_grado_grupo: parseInt(nuevoIdGradoGrupo), alumnos: Array.from(seleccionadosSet) })
    });

    if (res.ok) {
      Swal.fire('Éxito', 'Grado y grupo cambiados correctamente.', 'success');
      seleccionadosSet.clear();
      gradoSelect.dispatchEvent(new Event('change'));
      nuevoGradoSelect.value = '';
      nuevoGrupoSelect.innerHTML = '<option value="">Selecciona nuevo grupo</option>';
      buscadorAlumnos.value = '';
    } else {
      Swal.fire('Error', 'Error al cambiar grado y grupo.', 'error');
    }
  });

  btnAdelantar.addEventListener('click', async () => {
    const confirmacion = await Swal.fire({
      title: '¿Estás seguro?',
      text: '¿Quieres adelantar el ciclo? Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, adelantar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirmacion.isConfirmed) return;

    const csrfToken = await obtenerCsrfToken();

    const res = await fetch('/adelantar-ciclo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      credentials: 'include'
    });

    if (res.ok) {
      Swal.fire('Éxito', 'Ciclo adelantado correctamente.', 'success');
      seleccionadosSet.clear();
      gradoSelect.dispatchEvent(new Event('change'));
    } else {
      Swal.fire('Error', 'Ocurrió un error al adelantar el ciclo.', 'error');
    }
  });

  gradoSelect.dispatchEvent(new Event('change'));
});
