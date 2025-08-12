import { renderHeader } from '../assets/js/header.js';

async function obtenerCsrfToken() {
  const res = await fetch('/csrf-token', { credentials: 'include' });
  const data = await res.json();
  return data.csrfToken;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const authRes = await fetch('/auth-check', { credentials: 'include' });
    const authData = await authRes.json();
    if (!authData.authenticated) {
      window.location.href = '/';
      return;
    }
    document.getElementById('header-container').appendChild(renderHeader(authData.user));

    const resAlumno = await fetch('/mi-alumno', { credentials: 'include' });
    const dataAlumno = await resAlumno.json();
    if (!dataAlumno.success) throw new Error('No se pudo obtener información del alumno');
    window.__MI_ALUMNO__ = dataAlumno.alumno;
    await inicializarVista(dataAlumno.alumno);
  } catch (err) {
    console.error('Error al iniciar elegir-taller:', err);
    Swal.fire('Error', 'No se pudo iniciar la página. Comprueba tu sesión.', 'error');
  }
});

async function inicializarVista(alumno) {
  const cont = document.getElementById('talleres-container');
  cont.innerHTML = `
    <div class="row g-4">
      <!-- Taller de Arte -->
      <div class="col-12 col-md-6">
        <div class="card shadow-sm h-100 border-danger">
          <div class="card-header bg-danger text-white fw-bold">
            Taller de Arte 
            ${esAlumnoPrimeroATercero(alumno.grado) 
              ? '<small class="text-white">(Obligatorio)</small>' 
              : '<small class="text-white-50">(Opcional)</small>'}
          </div>
          <div class="card-body bg-light">
            <div id="arte-container" class="list-group list-group-flush"></div>
          </div>
        </div>
      </div>

      <!-- Talleres Extraescolares -->
      <div class="col-12 col-md-6">
        <div class="card shadow-sm h-100 border-secondary">
          <div class="card-header bg-secondary text-white fw-bold">
            Talleres Extraescolares <small class="text-white">(Opcionales)</small>
          </div>
          <div class="card-body bg-white">
            <div id="extra-container" class="row row-cols-1 row-cols-sm-2 g-3"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="text-end mt-4">
      <button id="guardar-eleccion" class="btn btn-danger btn-lg">
        <i class="fas fa-save me-2"></i> Guardar elección
      </button>
    </div>
  `;

  await Promise.all([
    cargarTalleresExtra(),
    cargarTalleresArte(alumno.id_grado_grupo)
  ]);
  await marcarSeleccionActual();
  document.getElementById('guardar-eleccion').addEventListener('click', guardarEleccion);
}

function esAlumnoPrimeroATercero(gradoStr) {
  if (!gradoStr) return false;
  const n = parseInt(gradoStr, 10);
  if (!isNaN(n)) return n >= 1 && n <= 3;
  const m = gradoStr.match(/[1-6]/);
  return m ? parseInt(m[0], 10) <= 3 : false;
}

let seleccionArte = null; // { id_arte_especialidad, id_personal }
let seleccionExtras = new Set();

async function cargarTalleresExtra() {
  try {
    const res = await fetch('/talleres', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) throw new Error('No se pudieron cargar talleres extra');
    const container = document.getElementById('extra-container');
    container.innerHTML = '';

    data.talleres.forEach(t => {
      const col = document.createElement('div');
      col.className = 'col';

      const card = document.createElement('div');
      card.className = 'card h-100 seleccionable-taller border border-2 border-secondary rounded shadow-sm';
      card.style.cursor = 'pointer';
      card.dataset.id = t.id_taller;

      card.innerHTML = `
        <div class="card-body d-flex align-items-center justify-content-center p-3">
          <h6 class="fw-semibold text-secondary mb-0">${t.nombre_taller}</h6>
        </div>
      `;

      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id, 10);
        if (seleccionExtras.has(id)) {
          seleccionExtras.delete(id);
          card.classList.remove('border-danger', 'shadow');
        } else {
          seleccionExtras.add(id);
          card.classList.add('border-danger', 'shadow');
        }
      });

      col.appendChild(card);
      container.appendChild(col);
    });
  } catch (error) {
    console.error(error);
    document.getElementById('extra-container').innerHTML = '<p class="text-muted">No se pudieron cargar talleres extra.</p>';
  }
}

async function cargarTalleresArte(id_grado_grupo) {
  try {
    const res = await fetch(`/talleres-arte/${id_grado_grupo}`, { credentials: 'include' });
    const data = await res.json();
    if (!data.success) throw new Error('No se pudieron cargar talleres de arte');
    const container = document.getElementById('arte-container');
    container.innerHTML = '';

    if (!data.artes.length) {
      container.innerHTML = '<p class="text-muted">No hay talleres de arte disponibles para este grado.</p>';
      return;
    }

    container.className = 'row row-cols-1 row-cols-sm-2 g-3';

    data.artes.forEach(a => {
      const col = document.createElement('div');
      col.className = 'col';

      const card = document.createElement('div');
      card.className = 'card h-100 seleccionable-arte border border-2 border-secondary rounded shadow-sm';
      card.style.cursor = 'pointer';
      card.dataset.id = a.id_arte_especialidad;
      card.dataset.personal = a.id_personal || '';

      card.innerHTML = `
        <div class="card-body d-flex flex-column justify-content-center align-items-center text-center p-3">
          <h6 class="fw-semibold text-danger mb-2">${a.nombre_arte_especialidad}</h6>
          <small class="text-secondary mb-2">Docente: ${a.nombre_personal || '-'}</small>
        </div>
      `;

      card.addEventListener('click', () => {
        // Deseleccionar todas
        document.querySelectorAll('#arte-container .seleccionable-arte').forEach(el => {
          el.classList.remove('border-danger', 'shadow');
        });

        // Seleccionar esta - sólo borde y sombra
        card.classList.add('border-danger', 'shadow');

        seleccionArte = {
          id_arte_especialidad: parseInt(card.dataset.id, 10),
          id_personal: card.dataset.personal ? parseInt(card.dataset.personal, 10) : null
        };
      });

      col.appendChild(card);
      container.appendChild(col);
    });
  } catch (err) {
    console.error(err);
    const container = document.getElementById('arte-container');
    container.innerHTML = '<p class="text-muted">Error cargando talleres de arte.</p>';
  }
}


async function marcarSeleccionActual() {
  try {
    const res = await fetch('/talleres-por-alumno', { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return;

    // marcar extras
    (data.extraescolares || []).forEach(e => {
      const el = document.querySelector(`.seleccionable-taller[data-id="${e.id_taller}"]`);
      if (el) {
        el.classList.add('border-danger', 'shadow');
        seleccionExtras.add(parseInt(e.id_taller, 10));
      }
    });

    // marcar arte
    const arte = data.arte || null;
    if (arte) {
      const el = document.querySelector(`#arte-container .seleccionable-arte[data-id="${arte.id_arte_especialidad}"]`);
      if (el) {
        el.classList.add('border-danger', 'shadow');
        seleccionArte = {
          id_arte_especialidad: parseInt(arte.id_arte_especialidad, 10),
          id_personal: arte.id_personal ? parseInt(arte.id_personal, 10) : null
        };
      }
    }

  } catch (err) {
    console.error('Error marcando selección actual:', err);
  }
}

async function guardarEleccion() {
  try {
    const alumno = window.__MI_ALUMNO__;
    const exigeArte = esAlumnoPrimeroATercero(alumno.grado);

    if (exigeArte && !seleccionArte) {
      return Swal.fire('Atención', 'Debes seleccionar un taller de arte (obligatorio para tu grado).', 'warning');
    }

    const payload = {
      arte: seleccionArte ? {
        id_arte_especialidad: seleccionArte.id_arte_especialidad,
        id_personal: seleccionArte.id_personal
      } : null,
      extraescolares: Array.from(seleccionExtras)
    };

    const token = await obtenerCsrfToken();
    const res = await fetch('/guardar-eleccion-taller', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': token
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      Swal.fire('¡Listo!', 'Se guardaron tus elecciones.', 'success');
    } else {
      throw new Error(data.message || 'Error al guardar elección');
    }
  } catch (err) {
    console.error(err);
    Swal.fire('Error', 'No se pudo guardar la elección. Revisa la consola.', 'error');
  }
}
