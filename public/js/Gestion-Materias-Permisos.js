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
  const listaMaterias = document.querySelector('#listaMaterias tbody');
  listaMaterias.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Cargando materias...</td></tr>';

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

  let todasMaterias = [];
  let academias = [];
  let roles = [];
  let personal = [];
  let gradosGrupos = [];
  let nivelesIngles = [];
  let asignaciones = [];

  async function cargarMaterias() {
    try {
      listaMaterias.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Cargando materias...</td></tr>';
      const data = await fetchWithRetry('/materias', { credentials: 'include' });
      todasMaterias = data.materias;
      mostrarMaterias(todasMaterias);
    } catch (error) {
      console.error('Error al cargar materias:', error);
      listaMaterias.innerHTML = '<tr><td colspan="6" class="text-muted text-center">No se pudo cargar las materias. Verifique que el servidor esté corriendo.</td></tr>';
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

  function mostrarMaterias(materias) {
    const textoBusqueda = buscadorMaterias.value.trim().toLowerCase();
    const filtrados = materias.filter(m => 
      `${m.nombre_materia} ${m.modelo_materia} ${m.grado_materia} ${m.nombre_academia} ${m.profesores_grupos || ''}`.toLowerCase().includes(textoBusqueda)
    );

    if (filtrados.length === 0) {
      listaMaterias.innerHTML = '<tr><td colspan="6" class="text-muted text-center">No se encontraron materias.</td></tr>';
      return;
    }

    listaMaterias.innerHTML = filtrados.map(m => {
      // Separar profesores_grupos en líneas para el formato deseado
      const asignaciones = m.profesores_grupos ? m.profesores_grupos.split('; ').join('<br>') : 'Sin asignaciones';
      return `
        <tr>
          <td>${m.nombre_materia || 'Sin nombre'}</td>
          <td>${m.modelo_materia}</td>
          <td>${m.grado_materia}</td>
          <td>${m.nombre_academia || 'Sin academia'}</td>
          <td>${asignaciones}</td>
          <td>
            <i class="fas fa-pencil-alt text-warning editBtn" data-id="${m.id_materia}" style="cursor: pointer; padding: 0.1rem;"></i>
          </td>
        </tr>
      `;
    }).join('');
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
      idRolSelect.innerHTML = '<option value="">Seleccione un rol</option>' +
        roles.map(r => `<option value="${r.id_rol}">${r.nombre_rol}</option>`).join('');
      idRolArteSelect.innerHTML = '<option value="">Seleccione un rol</option>' +
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

  async function cargarPersonalPorRol(id_rol, targetSelect = idPersonalSelect) {
    try {
      personal = await fetchWithRetry(`/personal-por-rol/${id_rol}`, { credentials: 'include' });
      targetSelect.innerHTML = '<option value="">Seleccione un profesor</option>' +
        personal.map(p => `<option value="${p.id_personal}">${p.nombre_personal} ${p.apaterno_personal} ${p.amaterno_personal}</option>`).join('');
      targetSelect.disabled = personal.length === 0;
    } catch (error) {
      console.error('Error al cargar personal:', error);
      targetSelect.innerHTML = '<option value="">No hay profesores disponibles</option>';
      targetSelect.disabled = true;
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de personal por rol (/personal-por-rol/:id_rol). Contacte al administrador.'
          : 'No se pudieron cargar los profesores. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) cargarPersonalPorRol(id_rol, targetSelect);
      });
    }
  }

  async function cargarGradosGrupos(grado_materia = null) {
  try {
    const response = await fetchWithRetry('/grados-grupos', { credentials: 'include' });
    console.log('Grados y grupos recibidos:', response); // Debug
    gradosGrupos = Array.isArray(response) ? response : [];
    if (grado_materia) {
      const grado = Number(grado_materia);
      console.log(`Filtrando grupos para grado_materia: ${grado} (${typeof grado})`); // Debug
      gradosGrupos = gradosGrupos.filter(g => {
        const grupoGrado = Number(g.grado);
        console.log(`Grupo: ${g.grupo}, Grado: ${grupoGrado} (${typeof grupoGrado})`);
        return grupoGrado === grado;
      });
      console.log('Grupos filtrados:', gradosGrupos); // Debug
    }
    idGradoGrupoSelect.innerHTML = '<option value="">Seleccione un grupo</option>' +
      gradosGrupos.map(g => `<option value="${g.id_grado_grupo}">${g.grupo}</option>`).join('');
    if (gradosGrupos.length === 0) {
      idGradoGrupoSelect.innerHTML = '<option value="">No hay grupos disponibles para este grado</option>';
      idGradoGrupoSelect.disabled = true;
    } else {
      idGradoGrupoSelect.disabled = false;
    }
  } catch (error) {
    console.error('Error al cargar grados y grupos:', error);
    idGradoGrupoSelect.innerHTML = '<option value="">Error al cargar grupos</option>';
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

  async function cargarAsignaciones(id_materia, isArte) {
    try {
      const response = await fetchWithRetry(`/materias/${id_materia}/asignaciones`, { credentials: 'include' });
      console.log(`Response from /materias/${id_materia}/asignaciones:`, response); // Debug
      asignaciones = Array.isArray(response) ? response : [];
      asignacionesContainer.innerHTML = asignaciones.length === 0
        ? '<p class="text-muted">No hay asignaciones para esta materia.</p>'
        : asignaciones.map(a => `
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span>${a.nombre_personal} ${a.apaterno_personal} ${a.amaterno_personal} - ${a.grupo}${isArte ? '' : ` (${a.horas_materia || ''} horas)`}${a.nombre_nivel_ingles ? ` - ${a.nombre_nivel_ingles}` : ''}${a.nombre_arte_especialidad ? ` - ${a.nombre_arte_especialidad}` : ''}</span>
              <button class="btn btn-danger btn-sm deleteAsignacionBtn" data-id_personal="${a.id_personal}" data-id_grado_grupo="${a.id_grado_grupo}" data-id_nivel_ingles="${a.id_nivel_ingles || ''}" data-id_arte_especialidad="${a.id_arte_especialidad || ''}">Eliminar</button>
            </div>
          `).join('');
    } catch (error) {
      console.error('Error al cargar asignaciones:', error);
      asignacionesContainer.innerHTML = '<p class="text-muted">Error al cargar asignaciones.</p>';
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de asignaciones (/materias/:id/asignaciones). Contacte al administrador.'
          : 'No se pudieron cargar las asignaciones. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) cargarAsignaciones(id_materia, isArte);
      });
    }
  }

  async function abrirModalMateria(materia = null) {
    if (materia) {
      modalTitle.textContent = 'Editar Materia';
      document.getElementById('id_materia').value = materia.id_materia;
      document.getElementById('nombre_materia').value = materia.nombre_materia;
      document.getElementById('modelo_materia').value = materia.modelo_materia;
      document.getElementById('grado_materia').value = materia.grado_materia;
      document.getElementById('id_academia').value = materia.id_academia || '';
      deleteMateriaBtn.style.display = 'inline-block';
    } else {
      modalTitle.textContent = 'Agregar Materia';
      materiaForm.reset();
      document.getElementById('id_materia').value = '';
      deleteMateriaBtn.style.display = 'none';
    }
    materiaModal.show();
  }

  async function abrirModalAsignar(materia) {
    asignarModalTitle.textContent = `Asignar Profesores y Grupos - ${materia.nombre_materia}`;
    document.getElementById('id_materia_asignar').value = materia.id_materia;
    asignarForm.reset();
    idPersonalSelect.innerHTML = '<option value="">Seleccione un rol primero</option>';
    idPersonalSelect.disabled = true;
    idRolSelect.value = '';
    const isArte = materia.nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('arte');
    nivelInglesContainer.style.display = materia.nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('ingles') ? 'block' : 'none';
    idNivelInglesSelect.required = nivelInglesContainer.style.display === 'block';
    await cargarGradosGrupos(materia.grado_materia);
    await cargarAsignaciones(materia.id_materia, isArte);
    asignarModal.show();
  }

  async function abrirModalArteEspecialidad() {
    arteEspecialidadForm.reset();
    idRolArteSelect.value = '';
    idPersonalArteSelect.innerHTML = '<option value="">Seleccione un rol primero</option>';
    idPersonalArteSelect.disabled = true;
    arteEspecialidadModal.show();
  }

  idRolSelect.addEventListener('change', async () => {
    const id_rol = idRolSelect.value;
    if (id_rol) {
      await cargarPersonalPorRol(id_rol, idPersonalSelect);
    } else {
      idPersonalSelect.innerHTML = '<option value="">Seleccione un rol primero</option>';
      idPersonalSelect.disabled = true;
    }
  });

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
        await cargarMaterias();
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

  asignarForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id_materia = document.getElementById('id_materia_asignar').value;
    const id_personal = document.getElementById('id_personal').value;
    const id_grado_grupo = document.getElementById('id_grado_grupo').value;
    const horas_materia = document.getElementById('horas_materia').value;
    const id_nivel_ingles = idNivelInglesSelect.required ? document.getElementById('id_nivel_ingles').value : null;

    const data = { id_personal, id_grado_grupo, horas_materia };
    if (id_nivel_ingles) data.id_nivel_ingles = id_nivel_ingles;

    try {
      const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      const response = await fetch(`/materias/${id_materia}/asignaciones`, {
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
        const isArte = todasMaterias.find(m => m.id_materia == id_materia).nombre_materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('arte');
        await cargarAsignaciones(id_materia, isArte);
        asignarForm.reset();
        idPersonalSelect.innerHTML = '<option value="">Seleccione un rol primero</option>';
        idPersonalSelect.disabled = true;
        idRolSelect.value = '';
        await cargarMaterias();
        Swal.fire('Éxito', result.message, 'success');
      } else {
        Swal.fire('Error', result.message || 'Error al asignar profesor.', 'error');
      }
    } catch (error) {
      console.error('Error al asignar profesor:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la funcionalidad de asignación (/materias/:id/asignaciones). Contacte al administrador.'
          : 'Error al asignar profesor. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) asignarForm.dispatchEvent(new Event('submit'));
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
              await cargarAsignaciones(id_materia, isArte);
              await cargarMaterias();
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
            await cargarMaterias();
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

  listaMaterias.parentElement.addEventListener('click', async (e) => {
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
          if (result.isConfirmed) listaMaterias.parentElement.dispatchEvent(new Event('click'));
        });
      }
    }
  });

  buscadorMaterias.addEventListener('input', () => {
    mostrarMaterias(todasMaterias);
  });

  addMateriaBtn.addEventListener('click', () => abrirModalMateria());
  addArteEspecialidadBtn.addEventListener('click', () => abrirModalArteEspecialidad());

  await Promise.all([
    cargarMaterias(),
    cargarAcademias(),
    cargarRoles(),
    cargarGradosGrupos(),
    cargarNivelesIngles()
  ]);
});