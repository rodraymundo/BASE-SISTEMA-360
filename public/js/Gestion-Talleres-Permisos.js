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


function populateTable(talleres) {
    const tbody = document.getElementById('talleresTableBody');
    tbody.innerHTML = ''; // Limpiar la tabla antes de volver a poblarla
    talleres.forEach(taller => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${taller.nombre_taller || '-'}</td>
            <td>${taller.profesor || '-'}</td>
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

async function showTallerDetails(id_taller) {
    try {
        const res = await fetch(`/talleres-personal-alumnos/${id_taller}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar los detalles');

        const taller = data.taller;
        const modalBody = document.querySelector('#tallerDetailsModal .modal-body');
        modalBody.innerHTML = `
            <h6 id="tallerTitle" data-id_taller="${id_taller}">${taller.nombre_taller || 'Sin nombre'}</h6>
            <p><strong>Nombre:</strong> <span id="tallerName">${taller.nombre_taller || 'Sin nombre'}</span></p>
            <p><strong>Profesor:</strong> <span id="tallerProfesor">${taller.profesor || '-'}</span></p>
            <p><strong>Número de Alumnos:</strong> <span id="tallerNumAlumnos">${taller.num_alumnos || 0}</span></p>
            <div class="d-flex justify-content-around mt-4">
                <button id="viewStudentsBtn" class="btn btn-outline-secondary btn-sm rounded-3"><i class="fas fa-users me-1"></i>Ver Alumnos</button>
                <button id="editTallerBtn" class="btn btn-outline-secondary btn-sm rounded-3"><i class="fas fa-pen me-1"></i>Editar</button>
                <button id="deleteTallerBtn" class="btn btn-outline-danger btn-sm rounded-3"><i class="fas fa-trash me-1"></i>Eliminar</button>
            </div>
        `;
        setupModalButtons(id_taller);
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

function setupModalButtons(id_taller) {
    document.getElementById('viewStudentsBtn').addEventListener('click', () => viewStudents(id_taller));
    document.getElementById('editTallerBtn').addEventListener('click', () => editTaller(id_taller));
    document.getElementById('deleteTallerBtn').addEventListener('click', () => deleteTaller(id_taller));
}

async function viewStudents(id_taller) {
    try {
        const res = await fetch(`/talleres-personal-alumnos/${id_taller}/alumnos`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar los alumnos');

        const modalBody = document.querySelector('#tallerDetailsModal .modal-body');
        modalBody.innerHTML = `
            <h6>Alumnos inscritos en ${data.taller_nombre || 'Sin nombre'}</h6>
            <ul>
                ${data.alumnos.length > 0 ? data.alumnos.map(a => `<li>${a.nombre_completo || '-'} (${a.grado}${a.grupo || ''})</li>`).join('') : '<li>No hay alumnos inscritos.</li>'}
            </ul>
            <button id="backToDetailsBtn" class="btn btn-secondary mt-3">Volver</button>
        `;

        const backButton = document.getElementById('backToDetailsBtn');
        backButton.addEventListener('click', () => {
            const modal = bootstrap.Modal.getInstance(document.getElementById('tallerDetailsModal'));
            if (modal) {
                modal.hide();
                setTimeout(() => showTallerDetails(id_taller), 100);
            }
        }, { once: true });
    } catch (error) {
        console.error('Error al cargar alumnos:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error al cargar la lista de alumnos.',
            confirmButtonText: 'Aceptar'
        });
    }
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