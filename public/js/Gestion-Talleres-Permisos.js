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

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/auth-check', { credentials: 'include' });
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/';
            return;
        }

        document.getElementById('header-container').appendChild(renderHeader(data.user));
        await cargarTalleres();
        setupEventListeners();
    } catch (error) {
        console.error('Error al iniciar:', error);
        window.location.href = '/';
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
    const tbody = document.getElementById('talleresTableBody');
    tbody.innerHTML = ''; // Limpiar tabla

    talleres.forEach(taller => {
        const profesorTexto = (!taller.instructors || taller.instructors.length === 0)
            ? '-'
            : taller.instructors.length === 1
                ? instructorName(taller.instructors[0])
                : 'Varios';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${taller.nombre_taller || '-'}</td>
            <td>${profesorTexto}</td>
            <td>${taller.num_alumnos || 0}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger view-details-btn" data-id="${taller.id_taller}">
                    <i class="fas fa-eye"></i> Ver
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Reemplaza showTallerDetails con esta versión
async function showTallerDetails(id_taller) {
    try {
        const res = await fetch(`/talleres-personal-alumnos/${id_taller}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar los detalles');

        const taller = data.taller;
        const modalBody = document.querySelector('#tallerDetailsModal .modal-body');

        // --- REEMPLAZADO profesorHTML ---
        let profesorHTML = '';
        if (!taller.instructors || taller.instructors.length === 0) {
            profesorHTML = '-';
        } else if (taller.instructors.length === 1) {
            const single = taller.instructors[0];
            profesorHTML = `<span id="selectedInstructorName">${instructorName(single)}</span>
                            <input type="hidden" id="selectedInstructorId" value="${single.id_personal}">`;
        } else {
            profesorHTML = `
              <select id="instructorSelect" class="form-select form-select-sm">
                ${taller.instructors.map(i => `<option value="${i.id_personal}">${instructorName(i)}</option>`).join('')}
              </select>
            `;
        }

        modalBody.innerHTML = `
            <h6 id="tallerTitle" data-id_taller="${id_taller}">${taller.nombre_taller || 'Sin nombre'}</h6>
            <p><strong>Nombre:</strong> <span id="tallerName">${taller.nombre_taller || 'Sin nombre'}</span></p>
            <p><strong>Profesor:</strong> ${profesorHTML}</p>
            <p><strong>Número de Alumnos:</strong> <span id="tallerNumAlumnos">${taller.num_alumnos || 0}</span></p>

            <div class="d-flex justify-content-around mt-3">
                <button id="viewStudentsBtn" class="btn btn-outline-secondary btn-sm rounded-3">
                  <i class="fas fa-users me-1"></i> Ver Alumnos
                </button>
                <button id="editTallerBtn" class="btn btn-outline-secondary btn-sm rounded-3">
                  <i class="fas fa-pen me-1"></i> Editar
                </button>
                <button id="deleteTallerBtn" class="btn btn-outline-danger btn-sm rounded-3">
                  <i class="fas fa-trash me-1"></i> Eliminar
                </button>
            </div>

            <div id="alumnosListContainer" class="mt-3"></div>
        `;

        setupModalButtons(id_taller);

        // --- Inicialización de select con nombre y hidden ---
        const instructorSelect = document.getElementById('instructorSelect');
        if (instructorSelect) {
            const primerId = instructorSelect.value;
            const primerNombre = instructorSelect.selectedOptions && instructorSelect.selectedOptions[0]
              ? instructorSelect.selectedOptions[0].textContent
              : instructorName(taller.instructors[0]);

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
            <h6 class="mt-3">Alumnos inscritos ${tallerNombre ? 'en ' + tallerNombre : ''} ${subtitle}</h6>
            ${listaHtml}
        `;
    } catch (err) {
        console.error('Error al cargar alumnos:', err);
        const container = document.getElementById('alumnosListContainer');
        if (container) container.innerHTML = `<div class="alert alert-danger">Error al cargar alumnos: ${err.message}</div>`;
    }
}


// Modifica viewStudents para usar loadAlumnosForTaller:
// (lo dejamos simple: recoge instructor seleccionado y fuerza la carga)
async function viewStudents(id_taller) {
    try {
        const selected = document.getElementById('selectedInstructorId');
        const id_personal = selected ? selected.value : null;
        await loadAlumnosForTaller(id_taller, id_personal);
        // opcional: desplazarse al contenedor
        const cont = document.getElementById('alumnosListContainer');
        if (cont) cont.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Error al cargar la lista de alumnos.' });
    }
}



function setupModalButtons(id_taller) {
    document.getElementById('viewStudentsBtn').addEventListener('click', () => viewStudents(id_taller));
    document.getElementById('editTallerBtn').addEventListener('click', () => editTaller(id_taller));
    document.getElementById('deleteTallerBtn').addEventListener('click', () => deleteTaller(id_taller));
}

async function editTaller(id_taller) {
    try {
        const res = await fetch(`/talleres-personal-alumnos/${id_taller}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar los datos');

        const taller = data.taller;
        const modal = new bootstrap.Modal(document.getElementById('addTallerModal'));
        document.getElementById('addTallerModal').querySelector('.modal-title').textContent = 'Editar Taller';
        document.getElementById('tallerNameInput').value = taller.nombre_taller || '';
        await populateProfesorSelect();
        document.getElementById('profesorSelect').value = taller.id_personal || '';

        const form = document.getElementById('addTallerForm');
        form.removeEventListener('submit', handleSaveTaller);
        form.addEventListener('submit', (e) => handleEditTaller(id_taller, e));
        modal.show();
    } catch (error) {
        console.error('Error al editar taller:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error al cargar datos para edición.',
            confirmButtonText: 'Aceptar'
        });
    }
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
            body: JSON.stringify({ nombre_taller: nombreTaller, id_personal: parseInt(idProfesor) })
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

    const modal = document.getElementById('addTallerModal');
    modal.dataset.idTaller = '';

    try {
        const token = await obtenerCsrfToken();
        const res = await fetch('/talleres-personal-alumnos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CSRF-Token': token },
            credentials: 'include',
            body: JSON.stringify({ nombre_taller: nombreTaller, id_personal: parseInt(idProfesor) })
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
            text: 'Error al agregar el taller.',
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

function setupEventListeners() {
    document.getElementById('addTallerBtn').addEventListener('click', async () => {
        const modal = new bootstrap.Modal(document.getElementById('addTallerModal'));
        document.getElementById('addTallerModal').querySelector('.modal-title').textContent = 'Agregar Nuevo Taller';
        document.getElementById('addTallerForm').reset();
        await populateProfesorSelect();
        const form = document.getElementById('addTallerForm');
        form.removeEventListener('submit', handleEditTaller);
        form.addEventListener('submit', handleSaveTaller);
        modal.show();
    });

    document.getElementById('talleresTableBody').addEventListener('click', (e) => {
        const button = e.target.closest('.view-details-btn');
        if (button) {
            const id_taller = button.getAttribute('data-id');
            showTallerDetails(id_taller);
        }
    });

    // Escuchar eventos del buscador con debounce
    const buscador = document.getElementById('buscadorTalleres');
    const buscarConDebounce = debounce((term) => buscarTalleres(term), 300);
    buscador.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        buscarConDebounce(term);
    });
}