import { renderHeader } from '../assets/js/header.js';

async function obtenerCsrfToken() {
    const res = await fetch('/csrf-token', { credentials: 'include' });
    const data = await res.json();
    return data.csrfToken;
}

// helper: nombre del instructor con fallback
function instructorName(i) {
  return i?.nombre || i?.profesor || i?.nombre_personal || (i?.nombre_personal && i?.apaterno_personal ? `${i.nombre_personal} ${i.apaterno_personal}` : '—') ;
}

// Reemplaza tu DOMContentLoaded por este
document.addEventListener('DOMContentLoaded', async () => {
  // 1) auth-check separado (si no auth -> redirect)
  try {
    const response = await fetch('/auth-check', { credentials: 'include' });
    const data = await response.json();
    if (!data.authenticated) {
      window.location.href = '/';
      return;
    }

    const headerContainer = document.getElementById('header-container');
    if (headerContainer) {
      headerContainer.appendChild(renderHeader(data.user));
    }
  } catch (err) {
    console.error('Error en auth-check:', err);
    window.location.href = '/';
    return;
  }

  // 2) Inicialización del UI (errores aquí no deben redirigir)
  try {
    await cargarTalleres();
    setupEventListeners();
  } catch (err) {
    console.error('Error iniciando UI:', err);
    // mostrar alerta amigable pero NO redirigir
    Swal.fire({
      icon: 'error',
      title: 'Error al iniciar la interfaz',
      text: String(err.message || err),
      confirmButtonText: 'Aceptar'
    });
  }
});


async function cargarTalleres() {
    await buscarTalleres(); // Carga inicial sin término de búsqueda
}

async function buscarTalleres(term = '') {
    try {
        const url = term 
            ? `/buscar-talleres?term=${encodeURIComponent(term)}` 
            : '/talleres-personal-alumnos'; // esta sería la de listado normal

        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Error en la solicitud' }));
            throw new Error(errorData.message || `Error ${res.status}: No se pudieron cargar los talleres`);
        }
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar los talleres');
        
        populateTable(data.talleres);
    } catch (error) {
        console.error('Error al buscar talleres:', error);
        document.getElementById('talleresTableBody').innerHTML = `<tr><td colspan="4">Error al cargar talleres: ${error.message}</td></tr>`;
        Swal.fire({
            icon: 'error',
            title: 'Error en búsqueda',
            text: error.message,
            confirmButtonText: 'Aceptar'
        });
    }
}

// --- REEMPLAZADO populateTable ---
function populateTable(talleres) {
    const container = document.getElementById('talleresListContainer');
    if (!container) return;
    container.innerHTML = ''; // limpiar

    if (!talleres || talleres.length === 0) {
        container.innerHTML = `<div class="alert alert-secondary">No hay talleres para mostrar.</div>`;
        return;
    }

    talleres.forEach(taller => {
        // DEBUG: si el nombre no aparece, descomenta para ver la estructura en consola
        // console.log('Taller recibido:', taller);

        // fallback para distintos nombres de campo
        const nombreTaller = taller.nombre_taller ?? taller.nombre ?? taller.nombreTaller ?? '-';
        const numAlumnos = ('num_alumnos' in taller) ? taller.num_alumnos : (taller.numAlumnos ?? 0);

        const profesorTexto = (!taller.instructors || taller.instructors.length === 0)
            ? '-' 
            : taller.instructors.length === 1
                ? instructorName(taller.instructors[0])
                : taller.instructors.map(i => instructorName(i)).join(', ');

        // Construimos un item tipo list-group (vertical)
        const item = document.createElement('div');
        item.className = 'list-group-item list-group-item-action shadow-sm p-3';
        item.innerHTML = `
            <div class="d-flex w-100 justify-content-between align-items-start">
                <div class="me-3" style="flex:1 1 auto; min-width:0;">
                    <h5 class="mb-1 text-danger fw-bold" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${escapeHtml(nombreTaller)}
                    </h5>
                    <p class="mb-1 text-muted small" style="white-space:normal;">
                        <strong>Profesor(es):</strong> ${escapeHtml(profesorTexto)}
                    </p>
                    <p class="mb-0 text-muted small"><strong>Alumnos:</strong> ${escapeHtml(String(numAlumnos))}</p>
                </div>

                <div class="ms-3 d-flex align-items-center" style="flex: 0 0 auto;">
                    <button class="btn btn-outline-danger btn-sm view-details-btn" data-id="${taller.id_taller ?? ''}">
                        <i class="fas fa-eye me-1"></i> Ver
                    </button>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

/* pequeño helper para escapar texto y evitar problemas si vienen caracteres especiales */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}



// Reemplaza showTallerDetails con esta versión
async function showTallerDetails(id_taller) {
    try {
        const res = await fetch(`/talleres-personal-alumnos/${id_taller}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar los detalles');

        const taller = data.taller;
        const modalBody = document.querySelector('#tallerDetailsModal .modal-body');

        // --- profesorHTML con botones (incluye botón eliminar por instructor) ---
        let profesorHTML = '';
        if (!taller.instructors || taller.instructors.length === 0) {
            profesorHTML = '-';
        } else {
            profesorHTML = `
                <div id="instructorsList" class="list-group">
                ${taller.instructors.map(i => `
                    <div class="list-group-item d-flex align-items-center justify-content-between">
                        <div class="fw-semibold">${instructorName(i)}</div>
                        <div>
                            <button class="btn btn-sm btn-outline-secondary me-1 view-by-instructor-btn" data-id="${i.id_personal}">Ver alumnos</button>
                            <button class="btn btn-sm btn-outline-danger replace-instructor-btn" data-id="${i.id_personal}">Reemplazar</button>
                            <button class="btn btn-sm btn-outline-danger delete-instructor-btn" data-id="${i.id_personal}">Eliminar</button>
                        </div>
                    </div>
                `).join('')}
                </div>
            `;
        }

        // HTML del modal (acciones en la cabecera derecha)
        modalBody.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>Profesor(es):</strong>
                <div class="d-flex gap-2">
                    <button id="addInstructorBtn" class="btn btn-outline-danger btn-sm">
                        <i class="fas fa-user-plus me-1"></i> Agregar Profesor
                    </button>
                    <button id="deleteTallerBtn" class="btn btn-outline-danger btn-sm rounded-3">
                        <i class="fas fa-trash me-1"></i> Eliminar taller
                    </button>
                </div>
            </div>

            <div class="mb-2">${profesorHTML}</div>

            <p><strong>Número de Alumnos:</strong> <span id="tallerNumAlumnos">${taller.num_alumnos || 0}</span></p>

            <div id="alumnosListContainer" class="mt-3"></div>
        `;

        // listener para "Agregar Profesor"
        const addBtn = document.getElementById('addInstructorBtn');
        if (addBtn) {
            addBtn.addEventListener('click', async () => {
                await populateProfesorSelect();
                const modalEl = document.getElementById('addTallerModal');
                modalEl.querySelector('.modal-title').textContent = 'Agregar Profesor a Taller';
                modalEl.dataset.addInstructorMode = 'true';
                modalEl.dataset.idTaller = id_taller;

                const nameInput = document.getElementById('tallerNameInput');
                if (nameInput) {
                    nameInput.value = '';
                    nameInput.disabled = true;
                    nameInput.closest('.mb-3')?.classList.add('d-none');
                }

                const form = document.getElementById('addTallerForm');
                form.removeEventListener('submit', handleSaveTaller);
                form.removeEventListener('submit', handleReplaceInstructorSubmit);
                form.addEventListener('submit', handleAddInstructorSubmit);

                const modal = new bootstrap.Modal(modalEl);
                modal.show();
            });
        }

        // setup botones globales del modal (Eliminar taller)
        setupModalButtons(id_taller);

        // ahora sí obtenemos la referencia al listado de instructors y enganchamos handlers
        const instructorsList = document.getElementById('instructorsList');
        if (instructorsList) {
            // Eliminar instructor (desasignar)
            instructorsList.querySelectorAll('.delete-instructor-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id_personal = e.currentTarget.getAttribute('data-id');
                    await deleteInstructorFromTaller(id_taller, id_personal);
                });
            });

            // Ver alumnos por instructor
            instructorsList.querySelectorAll('.view-by-instructor-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id_personal = e.currentTarget.getAttribute('data-id');
                    loadAlumnosForTaller(id_taller, id_personal);
                });
            });

            // Reemplazar instructor
            instructorsList.querySelectorAll('.replace-instructor-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const oldId = e.currentTarget.getAttribute('data-id');
                    openReplaceInstructorModal(id_taller, oldId);
                });
            });
        }

        // título del modal y dataset
        const modalTitle = document.getElementById('tallerDetailsModalLabel');
        modalTitle.innerHTML = `<i class="fas fa-book me-2"></i>${taller.nombre_taller || 'Sin nombre'}`;
        modalTitle.dataset.idTaller = id_taller;

        // Inicialización del select alternativo (si existe) y carga de alumnos
        const instructorSelect = document.getElementById('instructorSelect');
        if (instructorSelect) {
            const primerId = instructorSelect.value;
            const primerNombre = (instructorSelect.selectedOptions && instructorSelect.selectedOptions[0])
                ? instructorSelect.selectedOptions[0].textContent
                : (taller.instructors && taller.instructors[0] ? instructorName(taller.instructors[0]) : '');

            document.getElementById('selectedInstructorName')?.remove();
            const nameSpan = document.createElement('span');
            nameSpan.id = 'selectedInstructorName';
            nameSpan.className = 'ms-2 fw-semibold';
            nameSpan.textContent = primerNombre;
            instructorSelect.insertAdjacentElement('afterend', nameSpan);

            const hidden = document.createElement('input');
            hidden.type = 'hidden'; hidden.id = 'selectedInstructorId'; hidden.value = primerId;
            nameSpan.insertAdjacentElement('afterend', hidden);

            instructorSelect.addEventListener('change', (e) => {
                const id_personal = e.target.value;
                const nombre = e.target.selectedOptions[0].textContent;
                document.getElementById('selectedInstructorName').textContent = nombre;
                document.getElementById('selectedInstructorId').value = id_personal;
                loadAlumnosForTaller(id_taller, id_personal);
            });

            loadAlumnosForTaller(id_taller, primerId);
        } else {
            const hidden = document.getElementById('selectedInstructorId');
            if (hidden) loadAlumnosForTaller(id_taller, hidden.value);
            else loadAlumnosForTaller(id_taller, null);
        }

        const modal = new bootstrap.Modal(document.getElementById('tallerDetailsModal'));
        modal.show();

    } catch (error) {
        console.error('Error al mostrar detalles:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error al cargar los detalles del taller.',
            confirmButtonText: 'Aceptar'
        });
    }
}


async function handleAddInstructorSubmit(e) {
  e.preventDefault();

  const modalEl = document.getElementById('addTallerModal');
  const id_taller = modalEl.dataset.idTaller;
  const idProfesor = document.getElementById('profesorSelect').value;

  if (!idProfesor) {
    Swal.fire({ icon: 'warning', title: 'Selecciona un profesor' });
    return;
  }

  try {
    const token = await obtenerCsrfToken();
    const res = await fetch(`/talleres-personal-alumnos/${id_taller}/instructor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CSRF-Token': token },
      credentials: 'include',
      body: JSON.stringify({ id_personal: parseInt(idProfesor) })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Error al agregar profesor');

    bootstrap.Modal.getInstance(modalEl).hide();
    await cargarTalleres();
    showTallerDetails(id_taller); // recargar modal
    Swal.fire({ icon: 'success', title: 'Profesor agregado', text: data.message });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function deleteInstructorFromTaller(id_taller, id_personal) {
  const result = await Swal.fire({
    title: '¿Estás seguro?',
    text: 'Se desasignará este profesor y sus alumnos quedarán sin taller.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (!result.isConfirmed) return;

  try {
    const token = await obtenerCsrfToken();
    const res = await fetch(`/talleres-personal-alumnos/${id_taller}/instructor/${id_personal}`, {
      method: 'DELETE',
      headers: { 'CSRF-Token': token },
      credentials: 'include'
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Error al eliminar instructor');

    Swal.fire({ icon: 'success', title: 'Éxito', text: data.message });

    // Recargar lista de talleres y modal
    await cargarTalleres();
    showTallerDetails(id_taller);
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}


// Nueva versión de loadAlumnosForTaller: actualiza listado y contador según instructor seleccionado
async function loadAlumnosForTaller(id_taller, id_personal = null) {
    try {
        // construimos la URL con el filtro opcional
        let url = `/talleres-personal-alumnos/${id_taller}/alumnos`;
        if (id_personal) url += `?id_personal=${encodeURIComponent(id_personal)}`;

        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
            const txt = await res.text().catch(() => 'Error al cargar alumnos');
            throw new Error(txt || 'Error en la petición');
        }
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar los alumnos');

        const container = document.getElementById('alumnosListContainer');
        if (!container) return;

        const alumnos = Array.isArray(data.alumnos) ? data.alumnos : [];
        const tallerNombre = data.taller_nombre || '';

        // Actualizar el contador de alumnos en el modal (si existe)
        const numSpan = document.getElementById('tallerNumAlumnos');
        if (numSpan) numSpan.textContent = alumnos.length;

        // Render básico; cámbialo por la UI que prefieras
        const listaHtml = alumnos.length > 0
            ? `<ul class="list-group">${alumnos.map(a =>
                 `<li class="list-group-item">${a.nombre_completo || '-'} <small class="text-muted">(${a.grado || ''}${a.grupo ? ' ' + a.grupo : ''})</small></li>`
               ).join('')}</ul>`
            : '<div class="alert alert-secondary mb-0">No hay alumnos inscritos para este instructor.</div>';

        // Si se filtró por instructor, mostrar cuál se filtró (opcional)
        const selectedInstructorName = document.getElementById('selectedInstructorName')?.textContent || '';
        const subtitle = id_personal && selectedInstructorName
            ? `<small class="text-muted">Instructor: ${selectedInstructorName}</small>`
            : '';

        container.innerHTML = `
            <p class="mt-3"><strong>Listado de alumnos</strong></p>
            ${listaHtml}
        `;
    } catch (err) {
        console.error('Error al cargar alumnos:', err);
        const container = document.getElementById('alumnosListContainer');
        if (container) container.innerHTML = `<div class="alert alert-danger">Error al cargar alumnos: ${err.message}</div>`;
    }
}


function setupModalButtons(id_taller) {
    document.getElementById('deleteTallerBtn').addEventListener('click', () => deleteTaller(id_taller));
}


async function handleEditTaller(id_taller, e) {
    e.preventDefault();
    const nombreTaller = document.getElementById('tallerNameInput').value;
    const idProfesor = document.getElementById('profesorSelect').value;

    if (!nombreTaller || !idProfesor) {
        Swal.fire({
            icon: 'warning',
            title: 'Campos incompletos',
            text: 'Complete todos los campos.',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    try {
        const token = await obtenerCsrfToken();
        const res = await fetch(`/talleres-personal-alumnos/${id_taller}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'CSRF-Token': token },
            credentials: 'include',
            body: JSON.stringify({ nombre_taller: nombreTaller })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Error al actualizar el taller');

        await cargarTalleres();
        bootstrap.Modal.getInstance(document.getElementById('addTallerModal')).hide();
        Swal.fire({
            icon: 'success',
            title: 'Éxito',
            text: `¡El taller "${nombreTaller}" ha sido actualizado con éxito!`,
            confirmButtonText: 'Aceptar'
        });
    } catch (error) {
        console.error('Error al actualizar:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error al actualizar el taller.',
            confirmButtonText: 'Aceptar'
        });
    }
}

// Abre modal para reemplazar instructor (reutiliza addTallerModal)
async function openReplaceInstructorModal(id_taller, oldId) {
  // Cargar lista de profesores en el select
  await populateProfesorSelect();

  const modalEl = document.getElementById('addTallerModal');
  modalEl.querySelector('.modal-title').textContent = 'Reemplazar Instructor';
  // Deshabilitar input de nombre (no lo usaremos aquí)
  const nameInput = document.getElementById('tallerNameInput');
  if (nameInput) {
    nameInput.value = '';
    nameInput.disabled = true;
  }

  // Guardar en dataset para usarlo al enviar
  modalEl.dataset.replaceMode = 'true';
  modalEl.dataset.idTaller = id_taller;
  modalEl.dataset.oldInstructorId = oldId;

  // Preparar formulario: quitar listeners anteriores y añadir el de reemplazo
  const form = document.getElementById('addTallerForm');
  form.removeEventListener('submit', handleSaveTaller);
  // si existiera un handler edit, no lo quitamos por que es con args; nos aseguramos de solo usar este
  form.removeEventListener('submit', handleReplaceInstructorSubmit); // por si acaso
  form.addEventListener('submit', handleReplaceInstructorSubmit);

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

async function handleReplaceInstructorSubmit(e) {
  e.preventDefault();

  const modalEl = document.getElementById('addTallerModal');
  const id_taller = modalEl.dataset.idTaller;
  const oldId = modalEl.dataset.oldInstructorId;
  const newId = document.getElementById('profesorSelect').value;

  if (!newId) {
    Swal.fire({ icon: 'warning', title: 'Selecciona un profesor', text: 'Elige un profesor para reemplazar.' });
    return;
  }

  try {
    const token = await obtenerCsrfToken();
    const res = await fetch(`/talleres-personal-alumnos/${id_taller}/instructor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CSRF-Token': token },
      credentials: 'include',
      body: JSON.stringify({
        old_id_personal: oldId ? parseInt(oldId) : null,
        new_id_personal: parseInt(newId),
        propagate: true
      })
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) {
      throw new Error((data && data.message) || `Error ${res.status}: No se pudo reemplazar instructor`);
    }

    // Cerrar modal, limpiar y recargar datos del taller
    bootstrap.Modal.getInstance(modalEl).hide();
    // limpiar dataset y reactivar input nombre
    modalEl.dataset.replaceMode = '';
    delete modalEl.dataset.oldInstructorId;
    delete modalEl.dataset.idTaller;
    const nameInput = document.getElementById('tallerNameInput');
    if (nameInput) nameInput.disabled = false;

    // Recargar la vista de talleres y el modal de detalles (si sigue abierto)
    await cargarTalleres();
    // Reabrir detalles del taller para ver cambios (opcional)
    showTallerDetails(id_taller);

    Swal.fire({ icon: 'success', title: 'Reemplazado', text: 'Instructor reemplazado y alumnos actualizados.' });
  } catch (err) {
    console.error('Error reemplazando instructor:', err);
    Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'No se pudo reemplazar el instructor.' });
  }
}

// Limpieza al cerrar addTallerModal (devuelve a estado por defecto)
document.getElementById('addTallerModal').addEventListener('hidden.bs.modal', () => {
  const modalEl = document.getElementById('addTallerModal');
  const nameInput = document.getElementById('tallerNameInput');
  if (nameInput) {
    nameInput.disabled = false;   // volver a habilitarlo
    nameInput.closest('.mb-3')?.classList.remove('d-none'); // volver a mostrarlo
  }

  // quitar dataset de modos especiales
  delete modalEl.dataset.addInstructorMode;
  delete modalEl.dataset.replaceMode;
  delete modalEl.dataset.oldInstructorId;
  delete modalEl.dataset.idTaller;

  // limpiar listeners
  const form = document.getElementById('addTallerForm');
  form.removeEventListener('submit', handleAddInstructorSubmit);
  form.removeEventListener('submit', handleReplaceInstructorSubmit);
});


async function deleteTaller(id_taller) {
    const result = await Swal.fire({
        title: '¿Estás seguro?',
        text: '¡Esta acción eliminará el taller permanentemente!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const token = await obtenerCsrfToken();
            const res = await fetch(`/talleres-personal-alumnos/${id_taller}`, {
                method: 'DELETE',
                headers: { 'CSRF-Token': token },
                credentials: 'include'
            });

            if (!res.ok) throw new Error(await res.text());
            await cargarTalleres();
            bootstrap.Modal.getInstance(document.getElementById('tallerDetailsModal')).hide();
            Swal.fire({
                icon: 'success',
                title: 'Éxito',
                text: '¡El taller ha sido eliminado con éxito!',
                confirmButtonText: 'Aceptar'
            });
        } catch (error) {
            console.error('Error al eliminar:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error al eliminar el taller.',
                confirmButtonText: 'Aceptar'
            });
        }
    }
}

async function handleSaveTaller(e) {
    e.preventDefault();
    const nombreTaller = document.getElementById('tallerNameInput').value.trim();

    if (!nombreTaller) {
        Swal.fire({
            icon: 'warning',
            title: 'Campos incompletos',
            text: 'Escribe el nombre del taller.',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    const modal = document.getElementById('addTallerModal');
    modal.dataset.idTaller = '';

    try {
        const token = await obtenerCsrfToken();
        const res = await fetch('/talleres-personal-alumnos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CSRF-Token': token },
            credentials: 'include',
            body: JSON.stringify({ nombre_taller: nombreTaller })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Error al agregar el taller');

        await cargarTalleres();
        document.getElementById('addTallerForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('addTallerModal')).hide();
        Swal.fire({
            icon: 'success',
            title: 'Éxito',
            text: `¡El taller "${nombreTaller}" ha sido creado con éxito!`,
            confirmButtonText: 'Aceptar'
        });
    } catch (error) {
        console.error('Error al guardar:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Error al agregar el taller.',
            confirmButtonText: 'Aceptar'
        });
    }
}

async function populateProfesorSelect() {
    try {
        const res = await fetch('/personal-profesores', { credentials: 'include' });
        const data = await res.json();
        if (!data.success) {
            console.error('Error en la respuesta del servidor:', data.message);
            throw new Error(data.message || 'No se pudieron cargar los profesores');
        }

        const select = document.getElementById('profesorSelect');
        select.innerHTML = '<option value="">Seleccione un profesor</option>';
        if (data.personal && Array.isArray(data.personal)) {
            data.personal.forEach(p => {
                select.innerHTML += `<option value="${p.id_personal}">${p.nombre_personal} ${p.apaterno_personal || ''}</option>`;
            });
        } else {
            console.error('La respuesta no contiene un array de profesores:', data);
            throw new Error('No se encontraron profesores en la respuesta.');
        }
    } catch (error) {
        console.error('Error al cargar profesores:', error);
        const select = document.getElementById('profesorSelect');
        select.innerHTML = '<option value="">Error al cargar profesores</option>';
    }
}

// Función de debounce para optimizar búsquedas
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Reemplaza tu setupEventListeners por este (usa delegación y chequeos)
function setupEventListeners() {
  // boton Nuevo Taller
  const addBtn = document.getElementById('addTallerBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const modalEl = document.getElementById('addTallerModal');
      if (!modalEl) return;
      const modal = new bootstrap.Modal(modalEl);
      document.getElementById('addTallerModal').querySelector('.modal-title').textContent = 'Agregar Nuevo Taller';
      document.getElementById('addTallerForm').reset();
      await populateProfesorSelect();

      const profSelect = document.getElementById('profesorSelect');
      if (profSelect) {
        const profSelectDiv = profSelect.closest('.mb-3');
        if (profSelectDiv) {
          profSelectDiv.classList.add('d-none');
          profSelect.removeAttribute('required');
        }
      }

      const form = document.getElementById('addTallerForm');
      if (form) {
        form.removeEventListener('submit', handleEditTaller);
        form.removeEventListener('submit', handleSaveTaller); // por si algo quedó
        form.addEventListener('submit', handleSaveTaller);
      }

      modal.show();
    });
  }

  // delegado para los botones "Ver detalles" dentro del listado responsive
  const listContainer = document.getElementById('talleresListContainer');
  if (listContainer) {
    listContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.view-details-btn');
      if (!btn) return;
      const id_taller = btn.getAttribute('data-id');
      if (id_taller) {
        showTallerDetails(id_taller);
      }
    });
  }

  // buscador (si existe)
  const buscador = document.getElementById('buscadorTalleres');
  if (buscador) {
    const buscarConDebounce = debounce((term) => buscarTalleres(term), 300);
    buscador.addEventListener('input', (e) => {
      const term = e.target.value.trim();
      buscarConDebounce(term);
    });
  }
}
