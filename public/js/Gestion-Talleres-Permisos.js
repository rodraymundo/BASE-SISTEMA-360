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
    try {
        const res = await fetch('/talleres-personal-alumnos', { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar los talleres');
        
        const talleres = data.talleres;
        document.getElementById('contador-talleres').textContent = `${talleres.length} taller(es)`;
        document.getElementById('contador-talleres').classList.remove('d-none');
        
        populateTable(talleres);
    } catch (error) {
        console.error('Error al cargar talleres:', error);
        document.getElementById('talleresTableBody').innerHTML = '<tr><td colspan="4">Error al cargar talleres.</td></tr>';
    }
}

function populateTable(talleres) {
    const tbody = document.getElementById('talleresTableBody');
    tbody.innerHTML = '';
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
                <button id="viewStudentsBtn" class="btn btn-secondary">Ver Alumnos <i class="fas fa-users"></i></button>
                <button id="editTallerBtn" class="btn btn-secondary"><i class="fas fa-pen"></i> Editar</button>
                <button id="printListBtn" class="btn btn-secondary">Imprimir Lista <i class="fas fa-print"></i></button>
                <button id="deleteTallerBtn" class="btn btn-secondary">Eliminar <i class="fas fa-trash"></i></button>
            </div>
        `;
        setupModalButtons(id_taller);
        new bootstrap.Modal(document.getElementById('tallerDetailsModal')).show();
    } catch (error) {
        console.error('Error al mostrar detalles:', error);
        alert('Error al cargar los detalles del taller.');
    }
}

function setupModalButtons(id_taller) {
    document.getElementById('viewStudentsBtn').addEventListener('click', () => viewStudents(id_taller));
    document.getElementById('editTallerBtn').addEventListener('click', () => editTaller(id_taller));
    document.getElementById('printListBtn').addEventListener('click', () => printStudentList(id_taller));
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
            <button class="btn btn-secondary mt-3" onclick="showTallerDetails(${id_taller})">Volver</button>
        `;
    } catch (error) {
        console.error('Error al cargar alumnos:', error);
        alert('Error al cargar la lista de alumnos.');
    }
}

async function printStudentList(id_taller) {
    try {
        const res = await fetch(`/talleres-personal-alumnos/${id_taller}/alumnos`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'No se pudieron cargar los alumnos');

        const alumnos = data.alumnos;
        const tallerNombre = data.taller_nombre || 'Sin nombre';
        const fecha = new Date().toLocaleDateString('es-MX');

        const tablaFilas = alumnos.map((alumno, i) => `
            <tr>
                <td>${i + 1}</td>
                <td class="nombre-col">${alumno.nombre_completo || '-'}</td>
                <td class="counselor-col">${alumno.grado}${alumno.grupo || ''}</td>
            </tr>
        `).join('');

        const html = `
            <style>
                table { width: 100%; border-collapse: collapse; font-size: 10px; font-family: Roboto, sans-serif; }
                th, td { border: 1px solid black; padding: 2px; text-align: center; }
                thead th { background-color: #eee; }
                .nombre-col { width: 270px; max-width: 270px; }
                .counselor-col { width: 160px; max-width: 160px; }
            </style>
            <div style="display: flex; align-items: flex-start; justify-content: space-between;">
                <img src="/assets/img/logo_balmoral.png" alt="Logo" style="height: 60px;">
                <div style="text-align: center; flex-grow: 1;">
                    <div style="font-size: 18px; font-family: Georgia, serif; font-weight: bold;">PREPARATORIA BALMORAL ESCOCÉS</div>
                    <div style="font-size: 12px; font-family: Georgia, serif; font-style: italic;">"Inspiro a creer que es posible lo que pareciera imposible"</div>
                </div>
                <div style="font-size: 12px; font-family: Arial, serif; display: flex; flex-direction: column; align-items: flex-end;">
                    <span><strong>Taller:</strong> ${tallerNombre}</span>
                    <span><strong>Fecha:</strong> ${fecha}</span>
                </div>
            </div>
            <table border="1" cellspacing="0" cellpadding="3">
                <thead>
                    <tr>
                        <th>No.</th>
                        <th>Nombre</th>
                        <th>Grupo</th>
                    </tr>
                </thead>
                <tbody>${tablaFilas}</tbody>
            </table>
        `;

        const contenedor = document.getElementById('reporte-talleres');
        contenedor.innerHTML = html;
        contenedor.style.display = 'block';

        html2pdf().set({
            margin: 5,
            filename: `Lista_Taller_${tallerNombre.replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(contenedor).save().then(() => {
            contenedor.style.display = 'none';
        });
    } catch (error) {
        console.error('Error al generar PDF:', error);
        alert('Error al generar la lista en PDF.');
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
        alert('Error al cargar datos para edición.');
    }
}

async function handleEditTaller(id_taller, e) {
    e.preventDefault();
    const nombreTaller = document.getElementById('tallerNameInput').value;
    const idProfesor = document.getElementById('profesorSelect').value;

    if (!nombreTaller || !idProfesor) {
        alert('Complete todos los campos.');
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

        if (!res.ok) throw new Error(await res.text());
        await cargarTalleres();
        bootstrap.Modal.getInstance(document.getElementById('addTallerModal')).hide();
        alert('Taller actualizado exitosamente.');
    } catch (error) {
        console.error('Error al actualizar:', error);
        alert('Error al actualizar el taller.');
    }
}

async function deleteTaller(id_taller) {
    if (!confirm('¿Estás seguro de eliminar este taller?')) return;

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
        alert('Taller eliminado exitosamente.');
    } catch (error) {
        console.error('Error al eliminar:', error);
        alert('Error al eliminar el taller.');
    }
}

async function handleSaveTaller(e) {
    e.preventDefault();
    const nombreTaller = document.getElementById('tallerNameInput').value;
    const idProfesor = document.getElementById('profesorSelect').value;

    if (!nombreTaller || !idProfesor) {
        alert('Complete todos los campos.');
        return;
    }

    try {
        const token = await obtenerCsrfToken();
        const res = await fetch('/talleres-personal-alumnos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CSRF-Token': token },
            credentials: 'include',
            body: JSON.stringify({ nombre_taller: nombreTaller, id_personal: parseInt(idProfesor) })
        });

        if (!res.ok) throw new Error(await res.text());
        await cargarTalleres();
        bootstrap.Modal.getInstance(document.getElementById('addTallerModal')).hide();
        alert('Taller agregado exitosamente.');
    } catch (error) {
        console.error('Error al guardar:', error);
        alert('Error al agregar el taller.');
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

function setupEventListeners() {
    document.getElementById('addTallerBtn').addEventListener('click', async () => {
        const modal = new bootstrap.Modal(document.getElementById('addTallerModal'));
        document.getElementById('addTallerModal').querySelector('.modal-title').textContent = 'Agregar Nuevo Taller';
        document.getElementById('addTallerForm').reset();
        await populateProfesorSelect(); // Aseguramos que se llame aquí
        const form = document.getElementById('addTallerForm');
        form.removeEventListener('submit', handleEditTaller);
        form.addEventListener('submit', handleSaveTaller);
        modal.show();
    });

    document.getElementById('searchInput').addEventListener('input', () => {
        const termino = document.getElementById('searchInput').value.toLowerCase();
        fetch(`/talleres-personal-alumnos/buscar?term=${encodeURIComponent(termino)}`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.success) populateTable(data.talleres);
                else console.error('Error en búsqueda:', data.message);
            })
            .catch(error => console.error('Error en búsqueda:', error));
    });

    // Evento delegado para los botones "Ver"
    document.getElementById('talleresTableBody').addEventListener('click', (e) => {
        const button = e.target.closest('.view-details-btn');
        if (button) {
            const id_taller = button.getAttribute('data-id');
            showTallerDetails(id_taller);
        }
    });
}