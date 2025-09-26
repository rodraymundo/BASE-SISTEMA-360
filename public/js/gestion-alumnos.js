import { renderHeader } from '../assets/js/header.js';

async function obtenerCsrfToken() {
  const res = await fetch('/csrf-token', { credentials: 'include' });
  const data = await res.json();
  return data.csrfToken;
}


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

const buscadorInput = document.getElementById('buscador-alumnos');
let timeout = null;

buscadorInput.addEventListener('input', () => {
  clearTimeout(timeout);
  const termino = buscadorInput.value.trim();

  if (termino.length < 3) {
    tablaAlumnos.innerHTML = '<p class="text-muted"><i class="fas fa-info-circle me-1"></i>Escribe al menos 3 letras para buscar un alumno.</p>';
    return;
  }

  timeout = setTimeout(() => {
    buscarAlumnos(termino);
  }, 300); // Espera un poco para evitar llamadas excesivas
});

async function buscarAlumnos(termino) {
  try {
    const res = await fetch(`/buscar-alumnos?nombre=${encodeURIComponent(termino)}`, {
      credentials: 'include'
    });
    const data = await res.json();

    if (!data.success) throw new Error('Error al buscar alumnos');
    const alumnos = data.alumnos;

    tituloGrupo.textContent = `Resultados de búsqueda:`;
    contadorAlumnos.textContent = `${alumnos.length} resultado(s)`;
    contadorAlumnos.classList.remove('d-none');

    if (alumnos.length === 0) {
      tablaAlumnos.innerHTML = `<p class="text-muted">No se encontraron alumnos con ese nombre.</p>`;
      return;
    }

    const lista = document.createElement('div');
    lista.className = 'list-group';

    alumnos.forEach(alumno => {
      const item = document.createElement('div');
      item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center flex-wrap';

      item.innerHTML = `
        <div>
          <h6 class="mb-1">
            ${alumno.apaterno_alumno} ${alumno.amaterno_alumno || ''} ${alumno.nombre_alumno}
          </h6>
          <small><strong>Counselor:</strong> ${alumno.nombre_counselor ? alumno.nombre_counselor + ' ' + alumno.apaterno_counselor : '-'}</small><br>
          <small><strong>Correo:</strong> ${alumno.correo_alumno || '-'}</small><br>
          <small><strong>Taller extraescolar:</strong> ${alumno.talleres || '-'}</small><br>
          <small><strong>Grupo:</strong> ${alumno.grado} ${alumno.grupo}</small><br>
          <small><strong>Nivel de Inglés:</strong> ${alumno.nombre_nivel_ingles || '-'}</small><br>
          <small><strong>Arte/Especialidad:</strong> ${alumno.nombre_arte_especialidad || '-'}</small>
        </div>
        <button class="btn btn-sm btn-outline-danger btn-editar-alumno">
          <i class="fas fa-pen me-1"></i>Editar
        </button>
      `;

      item.querySelector('.btn-editar-alumno').addEventListener('click', () => editarAlumno(alumno.id_alumno));
      lista.appendChild(item);
    });

    tablaAlumnos.innerHTML = '';
    tablaAlumnos.appendChild(lista);

  } catch (error) {
    console.error('Error en búsqueda:', error);
    tablaAlumnos.innerHTML = `<div class="alert alert-danger">Error al buscar alumnos.</div>`;
  }
}


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
    contadorAlumnos.classList.remove('d-none');

    if (alumnos.length === 0) {
      tablaAlumnos.innerHTML = `<p class="text-muted">Este grupo no tiene alumnos asignados.</p>`;
      document.getElementById('btn-imprimir').style.display = 'none'; // Oculta el botón
      return;
    } else {
      document.getElementById('btn-imprimir').style.display = 'block'; // Muestra el botón
    }

    // Crear contenedor lista
    const lista = document.createElement('div');
    lista.className = 'list-group';

    alumnos.forEach(alumno => {
      const item = document.createElement('div');
      item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center flex-wrap';

      item.innerHTML = `
        <div>
          <h6 class="mb-1">
            ${alumno.apaterno_alumno} ${alumno.amaterno_alumno || ''} ${alumno.nombre_alumno}
          </h6>
          <small><strong>Counselor:</strong> ${alumno.nombre_counselor ? alumno.nombre_counselor + ' ' + alumno.apaterno_counselor : '-'}</small><br>
          <small><strong>Correo:</strong> ${alumno.correo_alumno || '-'}</small><br>
          <small><strong>Taller Extraescolar:</strong> ${alumno.talleres || '-'}</small><br>
          <small><strong>Nivel de Inglés:</strong> ${alumno.nombre_nivel_ingles || '-'}</small><br>
          <small><strong>Arte/Especialidad:</strong> ${alumno.nombre_arte_especialidad || '-'}</small>
        </div>
        <button class="btn btn-sm btn-outline-danger btn-editar-alumno">
          <i class="fas fa-pen me-1"></i>Editar
        </button>
      `;

      // Asignar evento al botón editar
      item.querySelector('.btn-editar-alumno').addEventListener('click', () => editarAlumno(alumno.id_alumno));

      lista.appendChild(item);
    });

    tablaAlumnos.innerHTML = '';
    tablaAlumnos.appendChild(lista);

  } catch (error) {
    console.error('Error al cargar alumnos del grupo:', error);
    tablaAlumnos.innerHTML = `<div class="alert alert-danger">Error al mostrar alumnos del grupo seleccionado.</div>`;
  }
}

//PARA IMPRIMIR EL PDF
document.getElementById('btn-imprimir').addEventListener('click', () => {
  const titulo = tituloGrupo.textContent;
  const fecha = new Date().toLocaleDateString('es-MX');
  const alumnos = [...document.querySelectorAll('#tabla-alumnos .list-group-item')];

  if (alumnos.length === 0) {
    alert('No hay alumnos para generar el PDF.');
    return;
  }

  const nombreGrupo = titulo.replace('Alumnos del grupo ', '');

  const tablaFilas = alumnos.map((el, i) => {
    const nombre = el.querySelector('h6').innerText;
    const counselorText = el.querySelector('small')?.innerText || '-';
    const counselor = counselorText.replace('Counselor: ', '');

    const celdasFechas = Array.from({ length: 23 }).map(() => '<td></td>').join('');
    
    return `
      <tr>
        <td>${i + 1}</td>
        <td class="nombre-col">${nombre}</td>
        <td class="counselor-col">${counselor}</td>
        ${celdasFechas}
        <td></td>
        <td></td>
      </tr>
    `;
  }).join('');

  const html = `
      <style>
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
          font-family: Roboto, sans-serif;
        }
        th, td {
          border: 1px solid black;
          padding: 2px;
          text-align: center;
          vertical-align: middle;
        }
        thead th {
          background-color: #eee;
        }
        thead th.encabezado {
          font-size: 12px;
          font-family: Arial, serif;
          font-weight: bold;
        }
        td.fecha, thead th.fecha {
          height: 85px;
          min-width: 25px;
          width: 25px;
        }
        .small-col {
          width: 100px;
          max-width: 100px;
          white-space: nowrap;
        }
        .nombre-col {
          width: 270px;
          max-width: 270px;
        }
        .counselor-col {
          width: 160px;
          max-width: 160px;
        }
      </style>

      <!-- Encabezado -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.5rem;">
        <!-- Logo -->
        <img src="/assets/img/logo_balmoral.png" alt="Logo" style="height: 60px;">

        <!-- Escuela y frase -->
        <div style="text-align: center; flex-grow: 1;">
          <div style="font-size: 18px; font-family: Georgia, serif; font-weight: bold;">
            PREPARATORIA BALMORAL ESCOCÉS
          </div>
          <div style="font-size: 12px; font-family: Georgia, serif; font-style: italic;">
            "Construir consciencias y potenciar talentos"
          </div>
        </div>

        <!-- Datos a la derecha -->
        <div style="font-size: 12px; font-family: Arial, serif; display: flex; flex-direction: column; align-items: flex-end; line-height: 1.4; margin-bottom: 10px;">
          <span style="display: flex; align-items: center; gap: 4px;">
            <strong>Grupo:</strong>
            <span style="min-width: 120px;">${nombreGrupo}</span>
          </span>
          <span style="display: flex; align-items: center; gap: 4px;">
            <strong>Materia:</strong>
            <span style="border-bottom: 1px solid #000; min-width: 120px; height: 1em; display: inline-block;"></span>
          </span>
          <span style="display: flex; align-items: center; gap: 4px;">
            <strong>Docente:</strong>
            <span style="border-bottom: 1px solid #000; min-width: 120px; height: 1em; display: inline-block;"></span>
          </span>
        </div>
        
        <div style="height: 8px;"></div>  

      </div>

      <!-- Tabla -->
      <table border="1" cellspacing="0" cellpadding="3" style="width: 100%; font-size: 10px; border-collapse: collapse;">
        <thead style="background-color: #eee;">
          <tr>
            <th class="encabezado" style="width: 40px; max-width: 40px;">No.</th>
            <th class="encabezado nombre-col">Balmoree</th>
            <th class="encabezado counselor-col">Counselor</th>
            ${Array.from({ length: 23 }).map(() => `<th class="encabezado fecha"></th>`).join('')}
            <th class="encabezado small-col" style="width: 100px; white-space: normal;">
              Cantidad de Inasistencias
            </th>

            <th class="encabezado small-col">Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          ${tablaFilas}
        </tbody>
      </table>

  `;

  const contenedor = document.getElementById('reporte-asistencia');
  contenedor.innerHTML = html;
  contenedor.style.display = 'block';

  html2pdf().set({
    margin: 5,
    filename: `Lista_Asistencia_${nombreGrupo.replace(/\s+/g, '_')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  }).from(contenedor).save().then(() => {
    contenedor.style.display = 'none';
  });
});

async function cargarOpcionesInglesYArte(id_grado_grupo) {
  try {
    const res = await fetch(`/opciones-ingles-y-arte/${id_grado_grupo}`, { credentials: 'include' });
    const data = await res.json();
    if (!data.success) throw new Error('No se pudieron cargar las opciones de inglés y arte');

    const selectIngles = document.getElementById('swal-nivel-ingles');
    const selectArte = document.getElementById('swal-arte-especialidad');

    // Limpiar y llenar select de inglés
    selectIngles.innerHTML = data.niveles.length
      ? data.niveles.map(n => `<option value="${n.id_nivel_ingles}" data-personal="${n.id_personal}" data-materia="${n.id_materia}">${n.nombre_nivel_ingles}</option>`).join('')
      : '<option value="">(Sin niveles de inglés)</option>';

    // Limpiar y llenar select de arte
    selectArte.innerHTML = data.artes.length
      ? data.artes.map(a => `<option value="${a.id_arte_especialidad}" data-personal="${a.id_personal}" data-materia="${a.id_materia}">${a.nombre_arte_especialidad}</option>`).join('')
      : '<option value="">(Sin artes)</option>';
  } catch (error) {
    console.error('Error al cargar opciones de inglés y arte:', error);
    Swal.fire('Error', 'No se pudieron cargar las opciones de inglés y arte.', 'error');
  }
}

async function editarAlumno(id_alumno) {
  try {
    // Obtener datos actuales del alumno (incluye counselor actual)
    const resAlumno = await fetch(`/alumno/${id_alumno}`, { credentials: 'include' });
    const dataAlumno = await resAlumno.json();
    if (!dataAlumno.success) throw new Error('No se pudo obtener el alumno');
    const alumno = dataAlumno.alumno;

    // Obtener talleres disponibles
    const resTalleres = await fetch('/talleres-para-alumnos', { credentials: 'include' });
    const dataTalleres = await resTalleres.json();
    if (!dataTalleres.success) throw new Error('No se pudo obtener talleres');
    const talleresDisponibles = dataTalleres.talleres;

    // Obtener counselors disponibles
    const resCounselors = await fetch('/counselors-disponibles', { credentials: 'include' });
    const dataCounselors = await resCounselors.json();
    if (!dataCounselors.success) throw new Error('No se pudo obtener counselors');
    const counselorsDisponibles = dataCounselors.counselors;

    // Obtener talleres asignados al alumno
    const resTalleresAlumno = await fetch(`/talleres-por-alumno/${id_alumno}`, { credentials: 'include' });
    const dataTalleresAlumno = await resTalleresAlumno.json();
    if (!dataTalleresAlumno.success) throw new Error('No se pudo obtener talleres del alumno');
    const talleresAlumno = dataTalleresAlumno.talleres;

    // Obtener grupos del mismo grado
    const resGruposMismoGrado = await fetch(`/grupos-mismo-grado/${alumno.grado}`, { credentials: 'include' });
    const dataGruposMismoGrado = await resGruposMismoGrado.json();
    if (!dataGruposMismoGrado.success) throw new Error('No se pudo obtener los grupos del mismo grado');
    const gruposMismoGrado = dataGruposMismoGrado.grupos;

    // Obtener opciones de inglés y arte para el grupo actual del alumno
    const resOpcionesIA = await fetch(`/opciones-ingles-y-arte/${alumno.id_grado_grupo}`, { credentials: 'include' });
    const dataOpcionesIA = await resOpcionesIA.json();
    if (!dataOpcionesIA.success) throw new Error('No se pudo obtener opciones de inglés y arte');

    // Crear opciones de grupo (solo del mismo grado)
    const opcionesGrupo = gruposMismoGrado.map(g => `
      <option value="${g.id_grado_grupo}" ${g.id_grado_grupo === alumno.id_grado_grupo ? 'selected' : ''}>
        ${g.grado} ${g.grupo}
      </option>
    `).join('');

    // Crear opciones para talleres (multi-select)
    const opcionesTalleres = talleresDisponibles.map(t => `
      <option value="${t.id_taller}" ${talleresAlumno.some(ta => ta.id_taller === t.id_taller) ? 'selected' : ''}>
        ${t.nombre_taller}
      </option>
    `).join('');

    // Crear opciones para counselor (select simple)
    const opcionesCounselors = counselorsDisponibles.map(c => `
      <option value="${c.id_personal}" ${c.id_personal === alumno.id_personal ? 'selected' : ''}>
        ${c.nombre_personal} ${c.apaterno_personal} ${c.amaterno_personal || ''}
      </option>
    `).join('');

    // Crear opciones para nivel de inglés y arte
    const opcionesIngles = dataOpcionesIA.niveles.length
      ? dataOpcionesIA.niveles.map(n => `
          <option value="${n.id_nivel_ingles}" 
                  data-personal="${n.id_personal}" 
                  data-materia="${n.id_materia}"
                  ${n.id_nivel_ingles === alumno.id_nivel_ingles ? 'selected' : ''}>
            ${n.nombre_nivel_ingles}
          </option>`).join('')
      : '<option value="">(Sin niveles de inglés)</option>';

    const opcionesArte = dataOpcionesIA.artes.length
      ? dataOpcionesIA.artes.map(a => `
          <option value="${a.id_arte_especialidad}" 
                  data-personal="${a.id_personal}" 
                  data-materia="${a.id_materia}"
                  ${a.id_arte_especialidad === alumno.id_arte_especialidad ? 'selected' : ''}>
            ${a.nombre_arte_especialidad}
          </option>`).join('')
      : '<option value="">(Sin artes)</option>';

    const { value: formValues } = await Swal.fire({
      title: `${alumno.nombre_alumno} ${alumno.apaterno_alumno} ${alumno.amaterno_alumno || ''}`,
      html: `
        <div class="text-start">
          <div class="mb-3">
            <label for="swal-counselor" class="form-label fw-bold">Counselor</label>
            <select id="swal-counselor" class="form-select">
              ${opcionesCounselors}
            </select>
          </div>
          <div class="mb-3">
            <label for="swal-talleres" class="form-label fw-bold">Talleres</label>
            <select id="swal-talleres" class="form-select" multiple size="6">
              ${opcionesTalleres}
            </select>
            <div class="form-text">Usa Ctrl o Cmd para seleccionar varios.</div>
          </div>
          <div class="mb-3">
            <label for="swal-grupo" class="form-label fw-bold">Grupo</label>
            <select id="swal-grupo" class="form-select">
              ${opcionesGrupo}
            </select>
          </div>
          <div class="mb-3">
            <label for="swal-nivel-ingles" class="form-label fw-bold">Nivel de Inglés</label>
            <select id="swal-nivel-ingles" class="form-select">
              ${opcionesIngles}
            </select>
          </div>
          <div class="mb-3">
            <label for="swal-arte-especialidad" class="form-label fw-bold">Arte/Especialidad</label>
            <select id="swal-arte-especialidad" class="form-select">
              ${opcionesArte}
            </select>
          </div>
          <button id="btn-baja-alumno" class="btn btn-danger w-100 mt-3">Dar de baja alumno</button>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      didOpen: () => {
        // Evento para actualizar inglés y arte al cambiar el grupo
        document.getElementById('swal-grupo').addEventListener('change', async () => {
          const id_grado_grupo = document.getElementById('swal-grupo').value;
          await cargarOpcionesInglesYArte(id_grado_grupo);
        });

        // Evento para el botón de baja
        document.getElementById('btn-baja-alumno')?.addEventListener('click', async () => {
          const confirm = await Swal.fire({
            title: '¿Estás seguro?',
            text: 'Esta acción dará de baja al alumno.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, dar de baja',
            cancelButtonText: 'Cancelar'
          });

          if (confirm.isConfirmed) {
            try {
              const token = await obtenerCsrfToken();
              const res = await fetch('/dar-baja-alumno', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'CSRF-Token': token
                },
                credentials: 'include',
                body: JSON.stringify({ id_alumno })
              });

              const data = await res.json();
              if (data.success) {
                Swal.fire({
                  title: 'Alumno dado de baja exitosamente',
                  icon: 'success'
                });
                document.querySelector('#lista-grupos .active')?.click(); // recarga lista
              } else {
                throw new Error(data.message || 'Error desconocido');
              }
            } catch (error) {
              console.error(error);
              Swal.fire('Error', 'No se pudo dar de baja al alumno.', 'error');
            }
          }
        });
      },
      preConfirm: () => {
        const counselorId = document.getElementById('swal-counselor').value;
        const grupoId = document.getElementById('swal-grupo').value;
        const talleresSelected = Array.from(document.getElementById('swal-talleres').selectedOptions).map(opt => opt.value);
        const nivelInglesOption = document.getElementById('swal-nivel-ingles').selectedOptions[0];
        const arteOption = document.getElementById('swal-arte-especialidad').selectedOptions[0];

        return {
          id_alumno,
          id_personal: counselorId || null,
          id_grado_grupo: grupoId || null,
          talleres: talleresSelected,
          nivel_ingles: nivelInglesOption && nivelInglesOption.value ? {
            id_nivel_ingles: nivelInglesOption.value,
            id_personal: nivelInglesOption.dataset.personal,
            id_materia: nivelInglesOption.dataset.materia
          } : null,
          arte_especialidad: arteOption && arteOption.value ? {
            id_arte_especialidad: arteOption.value,
            id_personal: arteOption.dataset.personal,
            id_materia: arteOption.dataset.materia
          } : null
        };
      }
    });

    if (formValues) {
      const token = await obtenerCsrfToken();

      // Actualizar counselor
      const counselorResponse = await fetch('/actualizar-counselor-alumno', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': token
        },
        credentials: 'include',
        body: JSON.stringify({ id_alumno: formValues.id_alumno, id_personal: formValues.id_personal })
      });
      const counselorData = await counselorResponse.json();
      if (!counselorData.success) {
        throw new Error(counselorData.message || 'Error al actualizar el counselor');
      }

      // Actualizar talleres
      const talleresParaActualizar = formValues.talleres.map(id_taller => ({
        id_taller: parseInt(id_taller),
        estado_evaluacion_taller: 0
      }));
      const talleresResponse = await fetch('/actualizar-talleres-alumno', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': token
        },
        credentials: 'include',
        body: JSON.stringify({ id_alumno: formValues.id_alumno, talleres: talleresParaActualizar })
      });
      const talleresData = await talleresResponse.json();
      if (!talleresData.success) {
        throw new Error(talleresData.message || 'Error al actualizar los talleres');
      }

      // Actualizar grupo
      const grupoResponse = await fetch('/actualizar-grupo-alumno', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': token
        },
        credentials: 'include',
        body: JSON.stringify({ id_alumno: formValues.id_alumno, id_grado_grupo: formValues.id_grado_grupo })
      });
      const grupoData = await grupoResponse.json();
      if (!grupoData.success) {
        throw new Error(grupoData.message || 'Error al actualizar el grupo');
      }

      // Actualizar nivel de inglés
      if (formValues.nivel_ingles) {
        const inglesResponse = await fetch('/actualizar-nivel-ingles-alumno', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CSRF-Token': token
          },
          credentials: 'include',
          body: JSON.stringify({ 
            id_alumno: formValues.id_alumno, 
            id_nivel_ingles: formValues.nivel_ingles.id_nivel_ingles,
            id_personal: formValues.nivel_ingles.id_personal,
            id_materia: formValues.nivel_ingles.id_materia
          })
        });
        const inglesData = await inglesResponse.json();
        if (!inglesData.success) {
          throw new Error(inglesData.message || 'Error al actualizar el nivel de inglés');
        }
      }

      // Actualizar arte/especialidad
      if (formValues.arte_especialidad) {
        const arteResponse = await fetch('/actualizar-arte-especialidad-alumno', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CSRF-Token': token
          },
          credentials: 'include',
          body: JSON.stringify({ 
            id_alumno: formValues.id_alumno, 
            id_arte_especialidad: formValues.arte_especialidad.id_arte_especialidad,
            id_personal: formValues.arte_especialidad.id_personal,
            id_materia: formValues.arte_especialidad.id_materia
          })
        });
        const arteData = await arteResponse.json();
        if (!arteData.success) {
          throw new Error(arteData.message || 'Error al actualizar la especialidad de arte');
        }
      }

      Swal.fire('Actualizado', 'Se actualizó la información del alumno.', 'success');

      // Recargar la lista del grupo actual para reflejar cambios
      document.querySelector('#lista-grupos .active')?.click();
    }

  } catch (error) {
    console.error('Error al editar alumno:', error);
    Swal.fire('Error', error.message || 'No se pudo cargar o actualizar la información.', 'error');
  }
}

//AGREGAR NUEVO ALUMNO
document.getElementById('btn-nuevo-alumno').addEventListener('click', async () => {
  try {
    // Obtener datos necesarios
    const [talleres, counselors, grupos] = await Promise.all([
      fetch('/talleres-para-alumnos', { credentials: 'include' }).then(r => r.json()),
      fetch('/counselors-disponibles', { credentials: 'include' }).then(r => r.json()),
      fetch('/grupos', { credentials: 'include' }).then(r => r.json())
    ]);

    if (!talleres.success || !counselors.success || !grupos.success)
      throw new Error('Error al cargar datos para nuevo alumno');

    const id_grado_grupo_predeterminado = grupos.grupos[0]?.id_grado_grupo;

    const resOpcionesIA = await fetch(`/opciones-ingles-y-arte/${id_grado_grupo_predeterminado}`, { credentials: 'include' });
    const opcionesIA = await resOpcionesIA.json();

    if (!opcionesIA.success)
      throw new Error('Error al cargar niveles de inglés y especialidades de arte');

    // Armar selects
    const opcionesTalleres = talleres.talleres.map(t => `<option value="${t.id_taller}">${t.nombre_taller}</option>`).join('');
    const opcionesCounselors = counselors.counselors.map(c => `<option value="${c.id_personal}">${c.nombre_personal} ${c.apaterno_personal}</option>`).join('');
    const opcionesGrupos = grupos.grupos.map(g => `<option value="${g.id_grado_grupo}">${g.grado} ${g.grupo}</option>`).join('');
    const opcionesIngles = opcionesIA.niveles.length
      ? opcionesIA.niveles.map(n => `<option value="${n.id_nivel_ingles}" data-personal="${n.id_personal}" data-materia="${n.id_materia}">${n.nombre_nivel_ingles}</option>`).join('')
      : '<option value="">(Sin niveles de inglés)</option>';
    const opcionesArte = opcionesIA.artes.length
      ? opcionesIA.artes.map(a => `<option value="${a.id_arte_especialidad}" data-personal="${a.id_personal}" data-materia="${a.id_materia}">${a.nombre_arte_especialidad}</option>`).join('')
      : '<option value="">(Sin artes)</option>';

    const { value: form } = await Swal.fire({
      title: 'Agregar nuevo alumno',
      html: `
        <input id="swal-id-alumno" class="form-control mb-2" placeholder="Matrícula del alumno">
        <input id="swal-nombre" class="form-control mb-2" placeholder="Nombre(s)">
        <input id="swal-apaterno" class="form-control mb-2" placeholder="Apellido paterno">
        <input id="swal-amaterno" class="form-control mb-2" placeholder="Apellido materno">
        <input id="swal-correo" type="email" class="form-control mb-2" placeholder="Correo electrónico">
        <select id="swal-grupo" class="form-select mb-2">${opcionesGrupos}</select>
        <select id="swal-nivel-ingles" class="form-select mb-2">${opcionesIngles}</select>
        <select id="swal-arte-especialidad" class="form-select mb-2">${opcionesArte}</select>
        <select id="swal-counselor" class="form-select mb-2">${opcionesCounselors}</select>
        <select id="swal-talleres" class="form-select mb-2" multiple size="5">${opcionesTalleres}</select>
        <div class="form-text">Ctrl/Cmd para seleccionar múltiples talleres</div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      focusConfirm: false,
      didOpen: () => {
        // Evento para actualizar inglés y arte al cambiar el grupo
        document.getElementById('swal-grupo').addEventListener('change', async () => {
          const id_grado_grupo = document.getElementById('swal-grupo').value;
          await cargarOpcionesInglesYArte(id_grado_grupo);
        });
      },
      preConfirm: () => {
        const id_alumno = document.getElementById('swal-id-alumno').value.trim();
        const nombre = document.getElementById('swal-nombre').value.trim();
        const apaterno = document.getElementById('swal-apaterno').value.trim();
        const amaterno = document.getElementById('swal-amaterno').value.trim();
        const correo = document.getElementById('swal-correo').value.trim();
        const id_grado_grupo = document.getElementById('swal-grupo').value;
        const nivelInglesOption = document.getElementById('swal-nivel-ingles').selectedOptions[0];
        const arteOption = document.getElementById('swal-arte-especialidad').selectedOptions[0];
        const id_personal = document.getElementById('swal-counselor').value;
        const talleres = Array.from(document.getElementById('swal-talleres').selectedOptions).map(opt => opt.value);

        if (!id_alumno || !nombre || !apaterno || !id_grado_grupo || !id_personal || !correo)
          return Swal.showValidationMessage('Todos los campos son obligatorios');

        return {
          id_alumno,
          nombre,
          apaterno,
          amaterno,
          correo,
          id_grado_grupo,
          id_personal,
          talleres,
          nivel_ingles: nivelInglesOption && nivelInglesOption.value ? {
            id_nivel_ingles: nivelInglesOption.value,
            id_personal: nivelInglesOption.dataset.personal,
            id_materia: nivelInglesOption.dataset.materia
          } : null,
          arte_especialidad: arteOption && arteOption.value ? {
            id_arte_especialidad: arteOption.value,
            id_personal: arteOption.dataset.personal,
            id_materia: arteOption.dataset.materia
          } : null
        };
      }
    });

    if (!form) return;

    // Enviar al backend
    const token = await obtenerCsrfToken();
    const res = await fetch('/insertar-nuevo-alumno', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': token
      },
      credentials: 'include',
      body: JSON.stringify(form)
    });

    const result = await res.json();
    if (result.success) {
      Swal.fire('Listo', 'Alumno agregado correctamente.', 'success');
      await cargarGrupos(); // actualiza vista
    } else {
      throw new Error(result.message || 'Error al insertar alumno');
    }

  } catch (error) {
    console.error(error);
    Swal.fire('Error', error.message || 'No se pudo insertar alumno.', 'error');
  }
});

// --- IMPORTAR EXCEL: lógica del modal + preview + confirm ---
(function () {
  // Asegúrate de que el botón exista en DOM
  const btnAbrir = document.getElementById('btn-importar-excel');
  if (!btnAbrir) return;

  // Crear referencia al modal de bootstrap
  const modalEl = document.getElementById('modalImportarExcel');
  const modalInstance = new bootstrap.Modal(modalEl);

  const inputFile = document.getElementById('archivo-excel');
  const btnPreview = document.getElementById('btn-preview-excel');
  const btnReset = document.getElementById('btn-reset-preview');
  const previewBody = document.getElementById('preview-excel-body');
  const statusLabel = document.getElementById('preview-status');
  const btnConfirmImport = document.getElementById('btn-confirm-import');
  const checkSelectAll = document.getElementById('check-select-all');

  let lastPreviewData = []; // array de objetos { raw: rowFromXLS, valid: bool, message: string, include: bool }

  btnAbrir.addEventListener('click', () => {
    // resetear estado al abrir
    inputFile.value = '';
    previewBody.innerHTML = '<p class="text-muted">Sube un archivo y haz clic en <strong>Previsualizar</strong>.</p>';
    statusLabel.textContent = '';
    lastPreviewData = [];
    btnConfirmImport.disabled = true;
    checkSelectAll.checked = true;
    modalInstance.show();
  });

  btnReset.addEventListener('click', () => {
    inputFile.value = '';
    previewBody.innerHTML = '<p class="text-muted">Sube un archivo y haz clic en <strong>Previsualizar</strong>.</p>';
    statusLabel.textContent = '';
    lastPreviewData = [];
    btnConfirmImport.disabled = true;
  });

  checkSelectAll.addEventListener('change', () => {
    const checked = checkSelectAll.checked;
    lastPreviewData.forEach(row => row.include = checked && row.valid);
    renderPreviewTable();
  });

  btnPreview.addEventListener('click', async () => {
    if (!inputFile.files || !inputFile.files[0]) {
      Swal.fire('Atención', 'Selecciona un archivo Excel primero.', 'warning');
      return;
    }

    statusLabel.textContent = 'Procesando...';
    btnPreview.disabled = true;

    try {
      const token = await obtenerCsrfToken();
      const fd = new FormData();
      fd.append('file', inputFile.files[0]);

      const res = await fetch('/preview-excel', {
        method: 'POST',
        headers: { 'CSRF-Token': token },
        credentials: 'include',
        body: fd
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Error al procesar el archivo en el servidor.');
      }

      // data.alumnos => array de rows del excel (nombres de columnas según el excel)
      // Normalizar y validar mínimamente en frontend (puedes mejorar esto)
      lastPreviewData = data.alumnos.map((r, idx) => {
        // Mapear campos esperados (intenta varias variantes de nombres)
        const nombre = r.Nombre ?? r.Nombre1 ?? r.nombre ?? r['Nombre(s)'] ?? '';
        const apaterno = r.ApellidoP ?? r.ApellidoPaterno ?? r['Apellido Paterno'] ?? r.apaterno ?? '';
        const amaterno = r.ApellidoM ?? r.ApellidoMaterno ?? r['Apellido Materno'] ?? r.amaterno ?? '';
        const matricula = r.Matricula ?? r.Matrícula ?? r.matricula ?? r['Matrícula'] ?? '';
        const counselor = r.Counselor ?? r.counselor ?? r['Counselor'] ?? r['Counselor Name'] ?? '';
        const grado = r.Grado ?? r.grado ?? '';
        const grupo = r.Grupo ?? r.grupo ?? '';

        // validaciones básicas
        const problems = [];
        if (!nombre) problems.push('Falta Nombre');
        if (!apaterno) problems.push('Falta Apellido paterno');
        if (!matricula) problems.push('Falta Matrícula');
        if (!grado || !grupo) problems.push('Falta Grado/Grupo');
        // Nota: validación de counselor se hará en el servidor al importar

        const valid = problems.length === 0;

        return {
          id: idx,
          raw: { nombre, apaterno, amaterno, matricula, counselor, grado, grupo },
          valid,
          message: problems.join('; '),
          include: valid // por defecto incluimos sólo las válidas
        };
      });

      renderPreviewTable();
      statusLabel.textContent = `${lastPreviewData.length} fila(s) leídas — ${lastPreviewData.filter(r=>r.valid).length} válidas`;
      btnConfirmImport.disabled = lastPreviewData.filter(r => r.include).length === 0;

    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.message || 'Error al previsualizar el Excel', 'error');
      statusLabel.textContent = '';
    } finally {
      btnPreview.disabled = false;
    }
  });

  function renderPreviewTable() {
    if (!lastPreviewData || lastPreviewData.length === 0) {
      previewBody.innerHTML = '<p class="text-muted">No hay filas para previsualizar.</p>';
      btnConfirmImport.disabled = true;
      return;
    }

    // Construir tabla
    const rowsHtml = lastPreviewData.map(r => {
      const { nombre, apaterno, amaterno, matricula, counselor, grado, grupo } = r.raw;
      const badge = r.valid ? '' : `<span class="badge bg-warning text-dark">Problem: ${r.message}</span>`;
      const checked = r.include ? 'checked' : '';
      const disabled = r.valid ? '' : 'disabled';
      return `
        <tr data-rowid="${r.id}">
          <td class="text-center align-middle"><input type="checkbox" class="row-include" ${checked} ${disabled}></td>
          <td class="align-middle">${apaterno} ${amaterno || ''} ${nombre}</td>
          <td class="align-middle">${matricula}</td>
          <td class="align-middle">${counselor || '<span class="text-muted">—</span>'}</td>
          <td class="align-middle">${grado} ${grupo}</td>
          <td class="align-middle">${badge}</td>
        </tr>
      `;
    }).join('');

    previewBody.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-bordered mb-0">
          <thead class="table-light">
            <tr>
              <th style="width:40px;" class="text-center">OK</th>
              <th>Nombre completo</th>
              <th>Matrícula</th>
              <th>Counselor</th>
              <th>Grado/Grupo</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    // Hook: checkbox listeners
    previewBody.querySelectorAll('.row-include').forEach(chk => {
      chk.addEventListener('change', (ev) => {
        const tr = ev.target.closest('tr');
        const id = parseInt(tr.dataset.rowid, 10);
        const row = lastPreviewData.find(r => r.id === id);
        if (row && row.valid) row.include = ev.target.checked;
        btnConfirmImport.disabled = lastPreviewData.filter(r => r.include).length === 0;
        // Update "select all" checkbox based on current rows
        const allIncluded = lastPreviewData.filter(r=>r.valid).every(r=>r.include);
        checkSelectAll.checked = !!allIncluded;
      });
    });

    // set select-all checkbox state
    const allIncluded = lastPreviewData.filter(r=>r.valid).every(r=>r.include);
    checkSelectAll.checked = !!allIncluded;
    btnConfirmImport.disabled = lastPreviewData.filter(r => r.include).length === 0;
  }

  // Confirm import
  btnConfirmImport.addEventListener('click', async () => {
    const toImport = lastPreviewData.filter(r => r.include).map(r => r.raw);
    if (toImport.length === 0) {
      Swal.fire('Atención', 'No hay filas seleccionadas para importar.', 'warning');
      return;
    }

    // Mostrar confirmación y resumen
    const resumen = `
      Se importarán <strong>${toImport.length}</strong> alumno(s).<br>
      ¿Deseas continuar? Esta acción creará usuarios (correo institucional) y registros en la base de datos.
    `;
    const confirmed = await Swal.fire({
      title: 'Confirmar importación',
      html: resumen,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Importar ahora',
      cancelButtonText: 'Cancelar'
    });

    if (!confirmed.isConfirmed) return;

    try {
      const token = await obtenerCsrfToken();

      btnConfirmImport.disabled = true;
      btnConfirmImport.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Importando...';

      const res = await fetch('/import-excel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': token },
        body: JSON.stringify({ alumnos: toImport })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Error al importar');

      Swal.fire('Listo', data.message || `${data.insertados || toImport.length} alumnos importados.`, 'success');
      modalInstance.hide();

      // refrescar lista (si hay grupo activo)
      document.querySelector('#lista-grupos .active')?.click();

    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.message || 'No se pudo completar la importación', 'error');
    } finally {
      btnConfirmImport.disabled = false;
      btnConfirmImport.innerHTML = '<i class="fas fa-file-import me-1"></i> Importar seleccionados';
    }
  });

})();
