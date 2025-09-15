import { renderHeader } from '../assets/js/header.js';

// --- ESTADO DE LA APLICACIÓN ---
// Guardamos objetos con más información (id, nombre) para facilitar la creación del resumen.
let seleccionArte = null; // Será: { id_arte_especialidad, id_personal, nombre }
let seleccionExtras = new Map(); // Usamos un Map para acceder fácilmente por ID: Map<id, {id, nombre}>
// Conteo global de participantes por equipo (se mantiene cuando cargamos y marcamos)
let conteoEquipos = {}; // { id_taller: cantidad }

// Mapa para saber a qué nombre base pertenece un id de equipo: id_taller -> nombreBase
let equipoIdToBase = new Map();


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

    if (alumno.tieneArte && alumno.tieneTaller) {
        cont.innerHTML = `
        <div class="alert alert-danger text-center">
            Ya tienes registrados tu Taller de Arte y tus Talleres Extraescolares.
        </div>`;
        return;
    }

    // --- NUEVO: Contenedor para el resumen ---
    let html = `
        <div id="resumen-container" class="mb-5"></div>
        <div class="row g-4 align-items-stretch">
    `;

    if (!alumno.tieneArte && esAlumnoPrimeroATercero(alumno.grado)) {
        html += `
            <div class="col-12 col-lg-6">
                <div class="card h-100 shadow-sm border-0 rounded-3 overflow-hidden">
                    <div class="card-header bg-danger text-white fw-bold">
                        Taller de Arte <small class="text-50">(Obligatorio)</small>
                    </div>
                    <div class="card-body bg-light">
                        <div id="arte-container" class="d-grid gap-3" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));"></div>
                    </div>
                </div>
            </div>`;
    }

    if (!alumno.tieneTaller) {
        html += `
            <div class="col-12 ${!alumno.tieneArte && esAlumnoPrimeroATercero(alumno.grado) ? 'col-lg-6' : 'col-lg-12'}">
                <div class="card h-100 shadow-sm border-0 rounded-3 overflow-hidden">
                    <div class="card-header bg-danger text-white fw-bold">
                        Talleres Extraescolares <small class="text-50">(Elige hasta 4)</small>
                    </div>
                    <div class="card-body bg-white">
                        <div id="extra-container" class="d-grid gap-3" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));"></div>
                    </div>
                </div>
            </div>`;
    }

    html += '</div>';

    if (!alumno.tieneArte || !alumno.tieneTaller) {
        html += `
        <div class="text-end mt-4">
            <button id="guardar-eleccion" class="btn btn-danger btn-lg">
                <i class="fas fa-save me-2"></i> Guardar elección
            </button>
        </div>`;
    }

    cont.innerHTML = html;

    // --- Carga dinámica y renderizado inicial del resumen ---
    if (document.getElementById('arte-container')) {
        await cargarTalleresArte(alumno.id_grado_grupo);
    }
    if (document.getElementById('extra-container')) {
        await cargarTalleresExtra();
    }
    
    // Marcar selecciones previas si existen
    await marcarSeleccionActual();
    
    // Renderizar el resumen por primera vez
    actualizarResumenYEstilos(); 
    
    const btnGuardar = document.getElementById('guardar-eleccion');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardarEleccion);
    }
}

/**
 * --- NUEVA FUNCIÓN CENTRALIZADA ---
 * Actualiza el resumen de selección y aplica los estilos a las tarjetas.
 * Se llama cada vez que el usuario hace clic en una opción.
 */
function actualizarResumenYEstilos() {
    const resumenContainer = document.getElementById('resumen-container');
    if (!resumenContainer) return;

    // Actualizar estilos de Taller de Arte
    document.querySelectorAll('.seleccionable-arte').forEach(card => {
        const cardId = parseInt(card.dataset.id, 10);
        if (seleccionArte && seleccionArte.id_arte_especialidad === cardId) {
            card.classList.add('seleccionado', 'border-danger', 'shadow-lg');
        } else {
            card.classList.remove('seleccionado', 'border-danger', 'shadow-lg');
        }
    });

    // Actualizar estilos de Talleres Extra (tarjetas representando un grupo de equipos)
    document.querySelectorAll('.seleccionable-taller').forEach(card => {
        try {
            const equiposIds = JSON.parse(card.dataset.equipos || '[]'); // array de ids
            // Si alguno de los ids del grupo está en seleccionExtras => marcar la tarjeta de grupo como seleccionada
            const algunoSeleccionado = equiposIds.some(id => seleccionExtras.has(id));
            if (algunoSeleccionado) {
                card.classList.add('seleccionado', 'border-danger', 'shadow-lg');
            } else {
                card.classList.remove('seleccionado', 'border-danger', 'shadow-lg');
            }
        } catch (e) {
            // Fallback: si no tiene dataset.equipos, mantener comportamiento antiguo si existe dataset.id
            const cardId = parseInt(card.dataset.id, 10);
            if (seleccionExtras.has(cardId)) {
                card.classList.add('seleccionado', 'border-danger', 'shadow-lg');
            } else {
                card.classList.remove('seleccionado', 'border-danger', 'shadow-lg');
            }
        }
    });

    
    // Construir el HTML del resumen
    let resumenHtml = `
        <div class="card border-2 shadow-sm rounded-3 mt-4">
            <div class="card-header bg-secondary text-white fw-bold">
                <i class="fas fa-clipboard-list me-2"></i>Tu Selección
            </div>
            <div class="card-body">
                <div class="row">
    `;

    // Sección de Arte en el resumen
    if (document.getElementById('arte-container')) {
        resumenHtml += `
            <div class="col-md-6">
                <strong class="text-secondary">Taller de Arte:</strong>
                <p id="resumen-arte" class="fst-italic text-muted ps-3">
                    ${seleccionArte ? `<span class="badge bg-secondary fs-6">${seleccionArte.nombre}</span>` : 'Ninguno seleccionado'}
                </p>
            </div>
        `;
    }
    
    // Sección Extraescolar en el resumen
    if (document.getElementById('extra-container')) {
        const colClass = document.getElementById('arte-container') ? 'col-md-6' : 'col-12';
        resumenHtml += `
            <div class="${colClass}">
                <strong class="text-secondary">Talleres Extraescolares:</strong>
                <div id="resumen-extra" class="ps-3">`;
        
        if (seleccionExtras.size > 0) {
            resumenHtml += '<div class="d-flex flex-wrap gap-2 mt-2">';
            for (const taller of seleccionExtras.values()) {
                resumenHtml += `<span class="badge bg-secondary fs-6">${taller.nombre}</span>`;
            }
            resumenHtml += '</div>';
        } else {
            resumenHtml += '<p class="fst-italic text-muted">Ninguno seleccionado</p>';
        }

        resumenHtml += '</div></div>';
    }

    resumenHtml += '</div></div></div>';
    resumenContainer.innerHTML = resumenHtml;
}


async function cargarTalleresArte(id_grado_grupo) {
    try {
        const res = await fetch(`/talleres-arte/${id_grado_grupo}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron cargar talleres de arte');
        const container = document.getElementById('arte-container');
        container.innerHTML = '';

        data.artes.forEach(a => {
            const card = document.createElement('div');
            card.className = 'card h-100 seleccionable-arte border-2 rounded-3 shadow-sm';
            card.style.cursor = 'pointer';
            card.dataset.id = a.id_arte_especialidad;
            card.dataset.personal = a.id_personal || '';
            card.dataset.nombre = a.nombre_arte_especialidad; // Guardamos el nombre aquí

            card.innerHTML = `
                <div class="card-body d-flex flex-column justify-content-center align-items-center text-center p-3">
                    <h6 class="fw-semibold text-danger mb-1">${a.nombre_arte_especialidad}</h6>
                </div>`;
            
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id, 10);
                // Si se hace clic en el ya seleccionado, se deselecciona. Si no, se selecciona.
                if (seleccionArte && seleccionArte.id_arte_especialidad === id) {
                    seleccionArte = null;
                } else {
                    seleccionArte = {
                        id_arte_especialidad: id,
                        id_personal: card.dataset.personal ? parseInt(card.dataset.personal, 10) : null,
                        nombre: card.dataset.nombre
                    };
                }
                actualizarResumenYEstilos(); // Actualiza todo
            });
            container.appendChild(card);
        });
    } catch (err) {
        console.error(err);
        document.getElementById('arte-container').innerHTML = '<p class="text-muted">Error cargando talleres de arte.</p>';
    }
}

async function cargarTalleresExtra() {
    try {
        const res = await fetch('/talleres', { credentials: 'include' });
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron cargar talleres extra');

        const container = document.getElementById('extra-container');
        container.innerHTML = '';

        // --- Agrupar talleres por nombre base (quitando E1/E2) ---
        const talleresMap = new Map();
        data.talleres.forEach(t => {
            const nombreBase = t.nombre_taller.replace(/ E[12]$/, '');
            if (!talleresMap.has(nombreBase)) {
                talleresMap.set(nombreBase, []);
            }
            talleresMap.get(nombreBase).push(t);
            // Guardamos también la relación id_taller -> nombreBase
            equipoIdToBase.set(t.id_taller, nombreBase);
        });

        // Asegurarnos que el conteo empieza vacío si no existe
        conteoEquipos = conteoEquipos || {};

        // --- Crear tarjetas por nombre base ---
        talleresMap.forEach((equipos, nombreBase) => {
            const card = document.createElement('div');
            card.className = 'card h-100 text-center seleccionable-taller border-2 rounded-3 shadow-sm';
            card.style.cursor = 'pointer';
            card.dataset.nombreBase = nombreBase;
            // Guardamos los ids de los equipos en JSON (p. ej. [12,13])
            card.dataset.equipos = JSON.stringify(equipos.map(e => e.id_taller));

            card.innerHTML = `
                <div class="card-body d-flex justify-content-center align-items-center p-3">
                    <h6 class="fw-semibold text-danger mb-0">${nombreBase}</h6>
                </div>
            `;

            card.addEventListener('click', () => {
                // Si ya está seleccionado alguno de los equipos de este grupo -> lo quitamos (toggle)
                const equiposIds = JSON.parse(card.dataset.equipos);
                const equipoSeleccionadoEnEsteGrupo = equiposIds.find(id => seleccionExtras.has(id));

                if (equipoSeleccionadoEnEsteGrupo) {
                    // Deseleccionar ese equipo
                    seleccionExtras.delete(equipoSeleccionadoEnEsteGrupo);
                    conteoEquipos[equipoSeleccionadoEnEsteGrupo] = Math.max((conteoEquipos[equipoSeleccionadoEnEsteGrupo]||1) - 1, 0);
                    actualizarResumenYEstilos();
                    return;
                }

                // Si intenta seleccionar más de 4 talleres (contando ya seleccionados) bloqueamos
                if (seleccionExtras.size >= 4) {
                    Swal.fire('Atención', 'Solo puedes seleccionar hasta 4 talleres extraescolares.', 'warning');
                    return;
                }

                // Elegir el equipo (id) con menos participantes para balancear
                let minAlumnos = Infinity;
                let candidatos = [];

                // Buscar equipos con menor cantidad de alumnos
                equipos.forEach(e => {
                    const count = conteoEquipos[e.id_taller] || 0;
                    if (count < minAlumnos) {
                        minAlumnos = count;
                        candidatos = [e];
                    } else if (count === minAlumnos) {
                        candidatos.push(e);
                    }
                });

                // Elegir aleatoriamente entre los que tienen menor cantidad (para balancear)
                const equipoElegido = candidatos[Math.floor(Math.random() * candidatos.length)];


                // Agregar selección: guardamos el id real del equipo pero como nombre mostramos el nombre base
                seleccionExtras.set(equipoElegido.id_taller, { id: equipoElegido.id_taller, nombre: nombreBase });
                conteoEquipos[equipoElegido.id_taller] = (conteoEquipos[equipoElegido.id_taller] || 0) + 1;

                actualizarResumenYEstilos();
            });

            container.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        document.getElementById('extra-container').innerHTML = '<p class="text-muted">No se pudieron cargar talleres extra.</p>';
    }
}

async function marcarSeleccionActual() {
    try {
        const res = await fetch('/talleres-por-alumno', { credentials: 'include' });
        const data = await res.json();
        if (!data.success) return;

        // --- Extras: si el backend devuelve los equipos seleccionados (ids) los registramos ---
        if (data.extraescolares) {
            data.extraescolares.forEach(e => {
                const id = parseInt(e.id_taller ?? e.id ?? e.id_extra, 10);
                if (isNaN(id)) return;

                // Buscar el nombre base en nuestro mapa (equipoIdToBase) si ya fue cargado,
                // si no existe, tomar lo que venga del servidor
                const nombreBase = equipoIdToBase.get(id) || e.nombre_taller || e.nombre || 'Taller extra';
                seleccionExtras.set(id, { id, nombre: nombreBase });

                // Aumentar conteo (importante para la lógica de balanceo)
                conteoEquipos[id] = (conteoEquipos[id] || 0) + 1;
            });
        }

        // --- Arte: lo guardamos en la variable aún si no existe la tarjeta en DOM ---
        if (data.arte) {
            const idArte = parseInt(data.arte.id_arte_especialidad ?? data.arte.id_arte ?? data.arte.id, 10);
            const idPersonal = data.arte.id_personal ? parseInt(data.arte.id_personal, 10) : null;
            const nombreArte = data.arte.nombre_arte_especialidad
                || data.arte.nombre
                || data.arte.nombre_arte
                || 'Taller de arte guardado';

            const cardArte = document.querySelector(`.seleccionable-arte[data-id="${idArte}"]`);
            const nombreFinal = cardArte?.dataset.nombre || nombreArte;

            seleccionArte = {
                id_arte_especialidad: idArte,
                id_personal: idPersonal,
                nombre: nombreFinal
            };

            if (cardArte) {
                cardArte.dataset.nombre = nombreFinal;
                cardArte.classList.add('border-danger', 'shadow-lg', 'seleccionado');
            }

        }

        // Finalmente, actualizar resumen y estilos (si ya existe el DOM del resumen)
        actualizarResumenYEstilos();

    } catch (err) {
        console.error('Error marcando selección actual:', err);
    }
}


async function guardarEleccion() {
    const alumno = window.__MI_ALUMNO__;

    // Validaciones
    if (esAlumnoPrimeroATercero(alumno.grado) && !alumno.tieneArte && !seleccionArte) {
        return Swal.fire('Atención', 'Debes seleccionar un taller de arte.', 'warning');
    }

    // Construir payload con cuidado:
    // - Si seleccionArte existe, enviamos solo lo que el backend necesita (ids).
    // - Si seleccionArte es null y el alumno tenía arte originalmente, entonces asumimos
    //   que el usuario lo ha querido eliminar (se deselectó intencionalmente) -> enviamos arte: null.
    // - Si seleccionArte es null y el alumno originalmente NO tenía arte, enviamos arte: null.
    let artePayload = null;
    if (seleccionArte) {
        artePayload = {
            id_arte_especialidad: seleccionArte.id_arte_especialidad,
            id_personal: seleccionArte.id_personal ?? null
        };
    } else {
        // Aquí enviamos explícitamente null si no hay selección actual (significa eliminar o no seleccionar)
        artePayload = null;
    }

    const payload = {
        arte: artePayload,
        extraescolares: Array.from(seleccionExtras.keys()) // solo IDs
    };

    try {
        const token = await obtenerCsrfToken();
        const res = await fetch('/guardar-eleccion-taller', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CSRF-Token': token },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            Swal.fire('¡Guardado!', 'Tus elecciones se han guardado correctamente.', 'success')
                .then(() => location.reload()); // recarga para sincronizar estado
        } else {
            throw new Error(data.message || 'Error al guardar la elección');
        }
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo guardar la elección. Inténtalo de nuevo.', 'error');
    }
}



function esAlumnoPrimeroATercero(gradoStr) {
    if (!gradoStr) return false;
    const n = parseInt(gradoStr.match(/\d+/)?.[0], 10);
    return !isNaN(n) && n >= 1 && n <= 3;
}