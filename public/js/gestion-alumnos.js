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
          <h6 class="mb-1">${alumno.nombre_alumno} ${alumno.apaterno_alumno} ${alumno.amaterno_alumno || ''}</h6>
          <small><strong>Counselor:</strong> ${alumno.nombre_counselor ? alumno.nombre_counselor + ' ' + alumno.apaterno_counselor : '-'}</small><br>
          <small><strong>Talleres:</strong> ${alumno.talleres || '-'}</small><br>
          <small><strong>Grupo:</strong> ${alumno.grado} ${alumno.grupo}</small>
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
          <h6 class="mb-1">${alumno.nombre_alumno} ${alumno.apaterno_alumno} ${alumno.amaterno_alumno || ''}</h6>
          <small><strong>Counselor:</strong> ${alumno.nombre_counselor ? alumno.nombre_counselor + ' ' + alumno.apaterno_counselor : '-'}</small><br>
          <small><strong>Correo:</strong> ${alumno.correo_alumno || '-'}</small><br>
          <small><strong>Talleres:</strong> ${alumno.talleres || '-'}</small>
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
            "Inspiro a creer que es posible lo que pareciera imposible"
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


async function editarAlumno(id_alumno) {
  try {
    // Obtener datos actuales del alumno (incluye counselor actual)
    const resAlumno = await fetch(`/alumno/${id_alumno}`, { credentials: 'include' });
    const dataAlumno = await resAlumno.json();
    if (!dataAlumno.success) throw new Error('No se pudo obtener el alumno');
    const alumno = dataAlumno.alumno;

    // Obtener talleres disponibles
    const resTalleres = await fetch('/talleres', { credentials: 'include' });
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

    // Crear opciones de grupo (solo del mismo grado)
    const opcionesGrupo = gruposMismoGrado.map(g => `
      <option value="${g.id_grado_grupo}" ${g.grupo === alumno.grupo ? 'selected' : ''}>
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

    const { value: formValues } = await Swal.fire({
      title: ` ${alumno.nombre_alumno} ${alumno.apaterno_alumno} ${alumno.amaterno_alumno || ''}`,
      html: `
  <div class="text-start">
    <div class="mb-3">
      <label for="swal-counselor" class="form-label fw-bold">Counselor</label>
      <select id="swal-counselor" class="form-select">
        ${opcionesCounselors}
      </select>
    </div>

    <div class="mb-2">
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
    <button id="btn-baja-alumno" class="btn btn-danger w-100 mt-3">Dar de baja alumno</button>
  </div>
`,

      focusConfirm: false,
      showCancelButton: true,
      didOpen: () => {
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
        return {
          id_alumno,
          id_personal: counselorId || null,
          id_grado_grupo: grupoId || null,
          talleres: talleresSelected
        };
        
      }
    });

    if (formValues) {
      // Enviar actualización counselor
      const token = await obtenerCsrfToken(); // 👈 ahora sí definimos el token
      await fetch('/actualizar-counselor-alumno', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'CSRF-Token': token // 👈 nombre correcto del header
         },
        credentials: 'include',
        body: JSON.stringify({ id_alumno: formValues.id_alumno, id_personal: formValues.id_personal })
      });

      // Preparar array para actualizar talleres (con estado 0 por default)
      const talleresParaActualizar = formValues.talleres.map(id_taller => ({
        id_taller: parseInt(id_taller),
        estado_evaluacion_taller: 0
      }));

      // Enviar actualización talleres
      
      await fetch('/actualizar-talleres-alumno', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': token // 👈 nombre correcto del header
        },
        credentials: 'include',
        body: JSON.stringify({ id_alumno: formValues.id_alumno, talleres: talleresParaActualizar })
      });

      await fetch('/actualizar-grupo-alumno', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': token
        },
        credentials: 'include',
        body: JSON.stringify({ id_alumno: formValues.id_alumno, id_grado_grupo: formValues.id_grado_grupo })
      });



      Swal.fire('Actualizado', 'Se actualizó la información del alumno.', 'success');

      // Recargar la lista del grupo actual para reflejar cambios
      document.querySelector('#lista-grupos .active')?.click();
    }

  } catch (error) {
    console.error(error);
    Swal.fire('Error', 'No se pudo cargar o actualizar la información.', 'error');
  }
}

//AGREGAR NUEVO ALUMNO
document.getElementById('btn-nuevo-alumno').addEventListener('click', async () => {
  try {
    // Obtener datos necesarios
    const [talleres, counselors, grupos] = await Promise.all([
      fetch('/talleres', { credentials: 'include' }).then(r => r.json()),
      fetch('/counselors-disponibles', { credentials: 'include' }).then(r => r.json()),
      fetch('/grupos', { credentials: 'include' }).then(r => r.json())
    ]);

    if (!talleres.success || !counselors.success || !grupos.success)
      throw new Error('Error al cargar datos para nuevo alumno');

    // Armar selects
    const opcionesTalleres = talleres.talleres.map(t => `<option value="${t.id_taller}">${t.nombre_taller}</option>`).join('');
    const opcionesCounselors = counselors.counselors.map(c => `<option value="${c.id_personal}">${c.nombre_personal} ${c.apaterno_personal}</option>`).join('');
    const opcionesGrupos = grupos.grupos.map(g => `<option value="${g.id_grado_grupo}">${g.grado} ${g.grupo}</option>`).join('');

    const { value: form } = await Swal.fire({
      title: 'Agregar nuevo alumno',
      html: `
        <input id="swal-id-alumno" class="form-control mb-2" placeholder="Matrícula del alumno">
        <input id="swal-nombre" class="form-control mb-2" placeholder="Nombre(s)">
        <input id="swal-apaterno" class="form-control mb-2" placeholder="Apellido paterno">
        <input id="swal-amaterno" class="form-control mb-2" placeholder="Apellido materno">
        <input id="swal-correo" type="email" class="form-control mb-2" placeholder="Correo electrónico">
        <input id="swal-password" type="password" class="form-control mb-2" placeholder="Contraseña">
        <select id="swal-grupo" class="form-select mb-2">${opcionesGrupos}</select>
        <select id="swal-counselor" class="form-select mb-2">${opcionesCounselors}</select>
        <select id="swal-talleres" class="form-select mb-2" multiple size="5">${opcionesTalleres}</select>
        <div class="form-text">Ctrl/Cmd para seleccionar múltiples talleres</div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Agregar',
      focusConfirm: false,
      preConfirm: () => {
        const id_alumno = document.getElementById('swal-id-alumno').value.trim();
        const nombre = document.getElementById('swal-nombre').value.trim();
        const apaterno = document.getElementById('swal-apaterno').value.trim();
        const amaterno = document.getElementById('swal-amaterno').value.trim();
        const correo = document.getElementById('swal-correo').value.trim();
        const password = document.getElementById('swal-password').value.trim();
        const id_grado_grupo = document.getElementById('swal-grupo').value;
        const id_personal = document.getElementById('swal-counselor').value;
        const talleres = Array.from(document.getElementById('swal-talleres').selectedOptions).map(opt => opt.value);

        if (!id_alumno || !nombre || !apaterno || !id_grado_grupo || !id_personal || !correo || !password)
          return Swal.showValidationMessage('Todos los campos son obligatorios');

        return { id_alumno, nombre, apaterno, amaterno, correo, password, id_grado_grupo, id_personal, talleres };
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
