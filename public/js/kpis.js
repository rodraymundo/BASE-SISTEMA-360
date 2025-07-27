import { renderHeader } from '../assets/js/header.js';

// Exponer funciones al scope global si son usadas en HTML inline:
window.mostrarKPIs = mostrarKPIs;
window.togglePersonas = togglePersonas;
window.guardarTodos = guardarTodos;
window.showMainContent = showMainContent;

let lastEditedKpiId = null;

async function initializePage() {
    try {
        const response = await fetch('/auth-check', {
            method: 'GET',
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.authenticated) {
            window.location.href = '/';
            return;
        }

        const headerContainer = document.getElementById('header-container');
        headerContainer.appendChild(renderHeader(data.user));

        // Mostrar bienvenida solo si no viene de #evaluaciones
        const isInEvaluaciones = window.location.hash === '#evaluaciones';

        document.getElementById('welcomeSection').style.display = isInEvaluaciones ? 'none' : 'flex';
        document.getElementById('mainContent').style.display = isInEvaluaciones ? 'block' : 'none';

        await cargarEvaluaciones();

    } catch (error) {
        console.error('Error al verificar sesión:', error);
        window.location.href = '/';
    }
}

async function cargarEvaluaciones() {
    try {
        const response = await fetch('/evaluaciones-pendientes', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        const data = await response.json();

        const welcomeTitle = document.getElementById('welcomeTitle');
        const welcomeMessage = document.getElementById('welcomeMessage');
        const puestosLista = document.getElementById('puestos-lista');
        const kpisContainer = document.getElementById('kpis-container');

        const userName = data.userName;
        const totalPersonas = data.evaluaciones.length;

        welcomeTitle.textContent = `¡Buen día, ${userName}!`;
        welcomeMessage.textContent = `Tienes ${totalPersonas} persona${totalPersonas !== 1 ? 's' : ''} por evaluar.`;

        if (!data.success || totalPersonas === 0) {
            welcomeMessage.textContent += ' No tienes evaluaciones pendientes en este momento.';
            puestosLista.innerHTML = '';
            kpisContainer.innerHTML = '';
            document.querySelector('.btn-continuar').style.display = 'none';
            return;
        }

        document.querySelector('.btn-continuar').style.display = 'inline-block';

        const evaluacionesPorPuesto = {};
        data.evaluaciones.forEach(persona => {
            if (!evaluacionesPorPuesto[persona.nombre_puesto]) {
                evaluacionesPorPuesto[persona.nombre_puesto] = [];
            }
            evaluacionesPorPuesto[persona.nombre_puesto].push(persona);
        });

        let puestosHtml = '';
        Object.entries(evaluacionesPorPuesto).forEach(([puesto, personas], index) => {
            const idAcordeon = `acordeon-${index}`;

            const personasHtml = personas.map(persona => {
                const yaEvaluado = Object.values(persona.categorias).every(c =>
                    c.kpis.every(k => k.resultado_kpi !== null)
                );

                return `
                    <div class="persona-item ${yaEvaluado ? 'evaluado' : 'no-evaluado'}" data-id-personal="${persona.id_personal}" onclick="mostrarKPIs(${persona.id_personal})">
                        <i class="fas fa-user"></i> ${persona.nombre_completo}
                        ${yaEvaluado
                            ? '<i class="fas text-success ms-2"></i>'
                            : '<i class="fas text-danger ms-2"></i>'}
                    </div>
                `;

            }).join('');

            const todosEvaluados = personas.every(persona =>
                Object.values(persona.categorias).every(c =>
                    c.kpis.every(k => k.resultado_kpi !== null)
                )
            );

            puestosHtml += `
                <div class="puesto-acordeon ${todosEvaluados ? 'evaluado' : 'no-evaluado'}">
                    <div class="puesto-header" onclick="togglePersonas('${idAcordeon}')">
                        <div class="puesto-info">
                            <i class="fas fa-list"></i> ${puesto}
                            ${todosEvaluados ? '<i class="fas text-success ms-2"></i>' : ''}
                        </div>
                        <div class="toggle-container">
                            <i class="fas fa-chevron-down toggle-icon"></i>
                        </div>
                    </div>
                    <div class="personas-lista" id="${idAcordeon}">
                        ${personasHtml}
                    </div>
                </div>
            `;
        });

        puestosLista.innerHTML = puestosHtml;

        window.personasEvaluadas = {};
        const evaluacionesTotales = data.evaluaciones.length;
        const evaluadas = data.evaluaciones.filter(p =>
            Object.values(p.categorias).every(c =>
                c.kpis.every(k => k.resultado_kpi !== null)
            )
        ).length;

        const restantes = evaluacionesTotales - evaluadas;

        document.getElementById('contador-evaluaciones').textContent =
            restantes > 0
                ? `Evaluaciones restantes: ${restantes}`
                : '¡Has completado todas tus evaluaciones!';

        welcomeMessage.textContent = restantes > 0
            ? `Tienes ${restantes} persona${restantes !== 1 ? 's' : ''} por evaluar.`
            : '¡Has completado todas tus evaluaciones! No tienes pendientes en este momento.';

        data.evaluaciones.forEach(persona => {
            window.personasEvaluadas[persona.id_personal] = persona;
        });

        kpisContainer.innerHTML = '<p class="text-muted"><i class="fas fa-info-circle"></i> Selecciona una persona para ver sus KPIs.</p>';
    } catch (error) {
        console.error('Error al cargar evaluaciones:', error);
        document.getElementById('welcomeMessage').textContent = 'Error al conectar con el servidor.';
        document.getElementById('puestos-lista').innerHTML = '';
        document.getElementById('kpis-container').innerHTML = '';
    }
}

function showMainContent() {
    document.getElementById('welcomeSection').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    history.pushState(null, '', '#evaluaciones');
}

function mostrarKPIs(id_personal) {
    const persona = window.personasEvaluadas[id_personal];
    if (!persona) return;

    const evaluacionesTotales = Object.values(window.personasEvaluadas).length;
    const evaluadas = Object.values(window.personasEvaluadas).filter(p =>
        Object.values(p.categorias).every(c =>
            c.kpis.every(k => k.resultado_kpi !== null)
        )
    ).length;

    const restantes = evaluacionesTotales - evaluadas;
    document.getElementById('contador-evaluaciones').textContent =
        restantes > 0
        ? `Evaluaciones restantes: ${restantes}`
        : '✅ ¡Has completado todas tus evaluaciones!';

    let html = `
        <div class="persona-kpi-header">
        <div class="persona-nombre"><i class="fas fa-chalkboard-user"></i> ${persona.nombre_completo}</div>
        <div class="persona-puesto">${persona.nombre_puesto}</div>
        </div>
    `;

    Object.values(persona.categorias).forEach(categoria => {
        html += `<h5 class="kpi-header"></i> ${categoria.nombre_categoria} (${categoria.porcentaje_categoria}%)</h5>`;
        categoria.kpis.forEach(kpi => {
        html += `
            <div class="kpi-card">
            <strong></i> ${kpi.nombre_kpi}</strong> (Meta: ${kpi.meta_kpi}${kpi.tipo_kpi === 'Porcentaje' ? '%' : ''})<br>
            Resultado actual: ${kpi.resultado_kpi !== null ? kpi.resultado_kpi : 'No evaluado'}<br>
            <input type="number" class="form-control mt-2" id="kpi_${kpi.id_kpi}" placeholder="Ingresa resultado" value="${kpi.resultado_kpi !== null ? kpi.resultado_kpi : ''}" onfocus="lastEditedKpiId = 'kpi_${kpi.id_kpi}'">
            </div>
        `;
        });
        html += `
        <div class="text-end mt-4 mb-4">
            <button class="btn btn-success btn-lg" onclick="guardarTodos(${persona.id_puesto}, ${persona.id_personal})">
            <i class="fas fa-save"></i> Guardar cambios
            </button>
        </div>
        `;
    });

    document.getElementById('kpis-container').innerHTML = html;

    // Agregar evento para detectar el último input editado
    const inputs = document.querySelectorAll('#kpis-container input');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            lastEditedKpiId = input.id;
        });
    });
}

function togglePersonas(id) {
    const contenedor = document.getElementById(id);
    const icon = contenedor.previousElementSibling.querySelector('.toggle-icon');
    const isVisible = contenedor.style.display === 'block';

    const allContainers = document.querySelectorAll('.personas-lista');
    const allIcons = document.querySelectorAll('.toggle-icon');

    // Cerrar todos los acordeones y restablecer íconos
    allContainers.forEach(c => c.style.display = 'none');
    allIcons.forEach(i => {
        i.classList.remove('fa-chevron-up', 'fa-rotate-180');
        i.classList.add('fa-chevron-down');
    });

    const kpisContainer = document.getElementById('kpis-container');

    if (!isVisible) {
        // Si estaba cerrado, lo abrimos
        contenedor.style.display = 'block';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up', 'fa-rotate-180');
    } else {
        // Si estaba abierto y se cerró, limpiamos los KPIs
        kpisContainer.innerHTML = '<p class="text-muted"><i class="fas fa-info-circle"></i> Selecciona una persona para ver sus KPIs.</p>';
    }
}

function esperarElemento(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const tiempoLimite = Date.now() + timeout;

        const intervalo = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) {
                clearInterval(intervalo);
                resolve(el);
            } else if (Date.now() > tiempoLimite) {
                clearInterval(intervalo);
                reject(`Elemento "${selector}" no encontrado en ${timeout}ms.`);
            }
        }, 50);
    });
}

async function guardarTodos(id_puesto, id_personal) {
    const persona = window.personasEvaluadas[id_personal];
    if (!persona) return;

    const resultados = [];

    Object.values(persona.categorias).forEach(categoria => {
        categoria.kpis.forEach(kpi => {
            const input = document.getElementById(`kpi_${kpi.id_kpi}`);
            if (input && !input.disabled && input.value) {
                resultados.push({
                    id_kpi: kpi.id_kpi,
                    resultado: input.value
                });
            }
        });
    });

    if (resultados.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Sin cambios',
            text: 'No hay resultados nuevos para guardar.'
        });
        return;
    }

    // Guardar la posición del scroll y el último KPI editado
    const scrollY = window.scrollY;
    const lastKpiId = lastEditedKpiId || (document.querySelector('.kpi-card:last-child')?.querySelector('input')?.id);

    try {
        const csrfRes = await fetch('/csrf-token', {
            credentials: 'include'
        });
        const { csrfToken } = await csrfRes.json();

        const response = await fetch('/guardar-multiples-resultados', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({
                id_puesto,
                id_personal,
                resultados
            })
        });

        const data = await response.json();

        if (data.success) {
            // Muestra Swal y espera a que se cierre
            await Swal.fire({
                icon: 'success',
                title: '¡Guardado!',
                text: 'Los resultados fueron actualizados correctamente.'
            });

            // Recargar evaluaciones
            await cargarEvaluaciones();

            // Restaurar el acordeón y los KPIs
            try {
                await esperarElemento(`.persona-item[data-id-personal="${id_personal}"]`);
                mostrarKPIs(id_personal);

                const acordeon = document.querySelector(`.persona-item[data-id-personal="${id_personal}"]`);
                const lista = acordeon.closest('.personas-lista');
                const icon = lista?.previousElementSibling?.querySelector('.toggle-icon');

                lista.style.display = 'block';
                if (icon) {
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-up', 'fa-rotate-180');
                }

                // Restaurar el scroll al último KPI si existe
                if (lastKpiId) {
                    await esperarElemento(`#${lastKpiId}`);
                    const kpiElement = document.getElementById(lastKpiId);
                    if (kpiElement) {
                        // Esperar un breve momento para que el renderizado termine
                        await new Promise(resolve => setTimeout(resolve, 100));
                        kpiElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } else {
                        window.scrollTo({ top: scrollY, behavior: 'smooth' }); // Fallback
                    }
                } else {
                    window.scrollTo({ top: scrollY, behavior: 'smooth' }); // Fallback
                }

            } catch (error) {
                console.error('No se pudo reabrir el acordeón:', error);
                window.scrollTo({ top: scrollY, behavior: 'smooth' }); // Fallback
            }
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error al guardar',
                text: data.message || 'Ocurrió un error inesperado.'
            });
        }
    } catch (error) {
        console.error("Error:", error);
        Swal.fire({
            icon: 'error',
            title: 'Error de red',
            text: 'No se pudieron guardar los resultados. Intenta más tarde.'
        });
    }
}

// Manejar cambios en hash para mostrar/ocultar secciones
window.addEventListener('hashchange', () => {
    if (location.hash !== '#evaluaciones') {
        document.getElementById('welcomeSection').style.display = 'flex';
        document.getElementById('mainContent').style.display = 'none';
    } else {
        document.getElementById('welcomeSection').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
    }
});

// Iniciar todo
initializePage();
