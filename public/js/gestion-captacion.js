import { renderHeader } from '../assets/js/header.js';

const listaGrupos = document.getElementById('lista-grupos');
const tablaAlumnos = document.getElementById('tabla-alumnos');
const tituloGrupo = document.getElementById('titulo-grupo');
const contadorAlumnos = document.getElementById('contador-alumnos');

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Verificar sesión
    const response = await fetch('/auth-check', { credentials: 'include' });
    const data = await response.json();

    if (!data.authenticated) {
      window.location.href = '/';
      return;
    }

    // Insertar encabezado
    document.getElementById('header-container').appendChild(renderHeader(data.user));

    // Cargar lista de grupos
    await cargarGrupos();
  } catch (error) {
    console.error('Error al iniciar la página:', error);
    window.location.href = '/';
  }
});

async function cargarGrupos() {
  try {
    const res = await fetch('/grupos', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) throw new Error('No se pudo obtener la lista de grupos');

    listaGrupos.innerHTML = '';

    data.grupos.forEach(grupo => {
      const li = document.createElement('li');
      li.classList.add('list-group-item', 'list-group-item-action');
      li.textContent = `${grupo.grado} ${grupo.grupo}`;
      li.dataset.id = grupo.id_grado_grupo;

      li.addEventListener('click', () => {
        marcarSeleccionado(li);
        cargarAlumnosPorGrupo(grupo.id_grado_grupo, `${grupo.grado} ${grupo.grupo}`);
      });

      listaGrupos.appendChild(li);
    });
  } catch (error) {
    console.error('Error al cargar grupos:', error);
    tablaAlumnos.innerHTML = `<div class="alert alert-danger">No se pudieron cargar los grupos.</div>`;
  }
}

function marcarSeleccionado(elemento) {
  document.querySelectorAll('#lista-grupos .list-group-item').forEach(el => el.classList.remove('active'));
  elemento.classList.add('active');
}

async function cargarAlumnosPorGrupo(id_grado_grupo, nombreGrupo) {
  try {
    const res = await fetch(`/alumnos-por-grupo/${id_grado_grupo}`, { credentials: 'include' });
    const data = await res.json();
    if (!data.success) throw new Error('No se pudo obtener la lista de alumnos');

    const alumnos = data.alumnos;

    tituloGrupo.textContent = `Alumnos del grupo ${nombreGrupo}`;
    contadorAlumnos.textContent = `${alumnos.length} alumno(s)`;

    if (alumnos.length === 0) {
      tablaAlumnos.innerHTML = `<p class="text-muted">Este grupo no tiene alumnos asignados.</p>`;
      return;
    }

    const tabla = document.createElement('table');
    tabla.className = 'table table-striped';

   tabla.innerHTML = `
    <thead>
        <tr>
        <th>#</th>
        <th>Nombre</th>
        <th>Counselor</th>
        </tr>
    </thead>
    <tbody>
        ${alumnos.map((al, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${al.nombre_alumno} ${al.apaterno_alumno} ${al.amaterno_alumno || ''}</td>
            <td>${al.nombre_counselor ? `${al.nombre_counselor} ${al.apaterno_counselor}` : '-'}</td>
        </tr>
        `).join('')}
    </tbody>
    `;

    tablaAlumnos.innerHTML = '';
    tablaAlumnos.appendChild(tabla);

  } catch (error) {
    console.error('Error al cargar alumnos del grupo:', error);
    tablaAlumnos.innerHTML = `<div class="alert alert-danger">Error al mostrar alumnos del grupo seleccionado.</div>`;
  }
}
