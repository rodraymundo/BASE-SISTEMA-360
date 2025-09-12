const personnelCards = document.getElementById('personnelCards');
const personalCount = document.getElementById('personalCount');
const evaluationChart = document.getElementById('evaluationChart');
const goalChart = document.getElementById('goalChart');
const roleFilter = document.getElementById('roleFilter');
const groupFilter = document.getElementById('groupFilter');
const applyFilterBtn = document.getElementById('applyFilter');
const positiveCommentsBtn = document.getElementById('positiveCommentsBtn');
const improvementAreasBtn = document.getElementById('improvementAreasBtn');
let commentsModalInstance = null;

const tipoToIdPregunta = {
    'materias': 1,
    'ingles': 1,
    'artes': 1,
    'servicios': 8,
    'talleres': 9,
    'counselors': 2,
    'psicopedagogico': 1,
    'coordinadores': 3,
    '360': 5,
    'pares': 6,
    'jefes': 7,
    'subordinado': 4 
};

// Función para escapar caracteres HTML peligrosos
function escapeHtml(string) {
    if (!string) return '';
    return string
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


let evaluationChartInstance = null;
let goalChartInstance = null;
let roleEvaluationChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!personnelCards || !personalCount) {
        console.error('DOM elements not found:', { personnelCards, personalCount });
        Swal.fire('Error', 'No se encontraron los elementos del DOM necesarios', 'error');
        return;
    }

    try {
        await loadRoles();
        await loadTopPersonnel('', '', 'top');
        applyFilterBtn.addEventListener('click', async () => {
            const group = groupFilter.value;
            const role = roleFilter.value;
            let filterType = '', filterValue = '';
            if (group) {
                filterType = 'group';
                filterValue = group;
            } else if (role) {
                filterType = 'role';
                filterValue = role;
            }
            const sortOrder = document.querySelector('input[name="sortOrder"]:checked')?.value || 'top';
            await loadTopPersonnel(filterType, filterValue, sortOrder);
            bootstrap.Modal.getInstance(document.getElementById('filterModal'))?.hide();
        });

        roleFilter.addEventListener('change', () => {
            if (roleFilter.value !== '') {
                groupFilter.value = '';
            }
        });

        groupFilter.addEventListener('change', () => {
            if (groupFilter.value !== '') {
                roleFilter.value = '';
            }
        });
    } catch (error) {
        console.error('Error al iniciar la página:', error);
        Swal.fire('Error', 'No se pudo cargar el dashboard', 'error');
    }
});

async function loadRoles() {
    try {
        const res = await fetch('/roles-director', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        console.log('Roles data:', data);
        if (!data.success) throw new Error('No se pudieron obtener los roles');
        roleFilter.innerHTML = '<option value="">Todos los roles</option>';
        data.roles.forEach(rol => {
            const option = document.createElement('option');
            option.value = rol.nombre_rol;
            option.textContent = rol.nombre_rol;
            roleFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Error al cargar roles:', error);
    }
}

async function loadTopPersonnel(filterType = '', filterValue = '', sortOrder = 'top') {
    try {
        let url = `/personnel-director?sort=${sortOrder}`;
        if (filterType && filterValue) url += `&${filterType}=${encodeURIComponent(filterValue)}`;

        console.log('Fetching personnel from:', url);
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error('No se pudieron obtener los datos del personal');

        const personnel = Array.isArray(data.personnel) ? data.personnel : [];
        personnelCards.innerHTML = '';
        personalCount.textContent = personnel.length;

        if (personnel.length === 0) {
            personnelCards.innerHTML = '<div class="col-12 text-muted text-center">No se encontró personal.</div>';
            return;
        }

        // --- 1) Fetch evaluations for all personnel (same as before) ---
        const personnelIds = personnel.map(p => p.id_personal);
        const personnelIdsCsv = personnelIds.join(',');

        let evalData = { evaluations: [] };
        try {
            console.log('Fetching evaluations for IDs:', personnelIdsCsv);
            const evalRes = await fetch(`/evaluations-director-full?ids=${personnelIdsCsv}`, { credentials: 'include' });
            if (!evalRes.ok) throw new Error(`HTTP error ${evalRes.status}`);
            evalData = await evalRes.json();
            if (!evalData.success) {
                console.warn('Evaluación no exitosa, usando datos por defecto:', evalData.message);
                evalData = { evaluations: [] };
            }
        } catch (fetchError) {
            console.error('Error fetching evaluations:', fetchError);
            Swal.fire('Advertencia', 'No se pudieron cargar las evaluaciones, usando valores por defecto', 'warning');
            evalData = { evaluations: [] };
        }

        // Convert evaluations to a Map for O(1) lookup
        const evalMap = new Map((evalData.evaluations || []).map(e => [e.id_personal, e]));

        // --- 2) Render cards quickly using DocumentFragment (one DOM insertion) ---
        const fragment = document.createDocumentFragment();
        personnel.forEach((person, index) => {
            const cardSizeClass = index === 1 ? 'card-middle' : 'card-side';
            const card = document.createElement('div');
            card.className = `card person-card ${cardSizeClass}`;
            const evalInfo = evalMap.get(person.id_personal) || { positive_count: 0, total_count: 0 };
            const percentage = evalInfo.total_count > 0 ? Math.round((evalInfo.positive_count / evalInfo.total_count) * 100) : 0;

            card.innerHTML = `
                <img src="${person.img_personal || './assets/img/iconousuario.png'}" class="card-img-top profile-img" alt="Personnel Photo">
                <div class="card-body text-center p-3">
                    <div class="content-block">
                        <h5 class="card-title fs-6">${escapeHtml(person.nombre_personal)} ${escapeHtml(person.apaterno_personal)} ${escapeHtml(person.amaterno_personal)}</h5>
                        <p class="card-text small"><strong>Puesto:</strong> ${escapeHtml(person.nombre_puesto || '')}</p>
                        ${person.subjects?.length ? `<p class="card-text small"><strong>Materias:</strong> ${escapeHtml(person.subjects.join(', '))}</p>` : ''}
                        <p class="card-text small"><strong>Evaluación:</strong> ${percentage}%</p>
                    </div>
                    <div class="rating-wrapper">
                        <div class="rating-bar">
                            <div class="rating-fill" style="width: ${percentage}%;"></div>
                        </div>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => showPersonnelModal(person));
            fragment.appendChild(card);
        });
        personnelCards.appendChild(fragment);

        // --- 3) Render charts quickly with evaluation data (KPIs may arrive later) ---
        // For kpiData initially pass empty arrays to render some charts fast
        const initialKpiData = personnel.map(p => ({ id_personal: p.id_personal, kpis: [] }));
        renderCharts(personnel, evalData.evaluations || [], initialKpiData);

        // --- 4) Fetch KPIs in background (parallel). When done, update charts. ---
        // If you expect many personnel, consider implementing a batch endpoint /personal-kpis-batch?ids=1,2,3
        (async () => {
            try {
                console.log('Fetching KPIs for personnel IDs (background):', personnelIdsCsv);
                const kpiPromises = personnel.map(person =>
                    fetch(`/personal-kpis/${person.id_personal}`, { credentials: 'include' })
                        .then(res => res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)))
                        .then(data => ({ id_personal: person.id_personal, kpis: Array.isArray(data) ? data : (data.data || []) }))
                        .catch(err => {
                            console.error(`Error fetching KPIs for id_personal ${person.id_personal}:`, err);
                            return { id_personal: person.id_personal, kpis: [] };
                        })
                );
                // Use Promise.allSettled to be resilient to failures
                const settled = await Promise.allSettled(kpiPromises);
                const kpiData = settled.map(s => s.status === 'fulfilled' ? s.value : { id_personal: null, kpis: [] })
                                      .filter(x => x.id_personal != null);
                console.log('KPI data (background):', kpiData);
                // Update charts now with real KPI data
                renderCharts(personnel, evalData.evaluations || [], kpiData);
            } catch (err) {
                console.error('Error fetching KPIs in background:', err);
            }
        })();

    } catch (error) {
        console.error('Error al cargar personal:', error);
        personnelCards.innerHTML = '<div class="col-12 text-muted text-center">Error al cargar personal.</div>';
        Swal.fire('Error', 'No se pudo cargar el personal', 'error');
    }
}

async function showPersonnelModal(person) {
    document.getElementById('modalPersonnelName').textContent = `${person.nombre_personal} ${person.apaterno_personal} ${person.amaterno_personal}`;
    document.getElementById('modalPersonnelPuesto').textContent = person.nombre_puesto;
    document.getElementById('modalPersonnelSubjects').textContent = person.subjects?.join(', ') || 'No aplica';
    document.getElementById('modalPersonnelPhone').textContent = person.telefono_personal || 'No disponible';
    document.getElementById('modalPersonnelBirthDate').textContent = person.fecha_nacimiento_personal || 'No disponible';
    document.getElementById('modalPersonnelPhoto').src = person.img_personal || './assets/img/iconousuario.png';

    positiveCommentsBtn.removeEventListener('click', handlePositiveComments);
    improvementAreasBtn.removeEventListener('click', handleImprovementAreas);

    positiveCommentsBtn.addEventListener('click', () => handlePositiveComments(person.id_personal));
    improvementAreasBtn.addEventListener('click', () => handleImprovementAreas(person.id_personal));

    const modalElement = document.getElementById('personnelModal');
    const modal = new bootstrap.Modal(modalElement);

    const renderChart = async () => {
        await renderRoleEvaluationChart(person.id_personal);
    };
    modalElement.addEventListener('shown.bs.modal', renderChart, { once: true });

    modal.show();
}

async function renderRoleEvaluationChart(idPersonal) {
    const chartContainer = document.getElementById('roleEvaluationChart');
    if (!chartContainer) {
        console.error(`[idPersonal=${idPersonal}] Chart container 'roleEvaluationChart' not found in DOM`);
        return;
    }

    chartContainer.style.display = 'block';
    chartContainer.width = 400;
    chartContainer.height = 300;

    if (roleEvaluationChartInstance) {
        roleEvaluationChartInstance.destroy();
        roleEvaluationChartInstance = null;
    }

    try {
        const typesRes = await fetch(`/personal-evaluaciones-types/${idPersonal}`, {
            credentials: 'include',
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (!typesRes.ok) throw new Error(`HTTP error ${typesRes.status}`);
        const typesData = await typesRes.json();
        if (!Array.isArray(typesData) || typesData.length === 0) {
            chartContainer.insertAdjacentHTML('afterend', '<p class="text-center text-muted">No hay tipos de evaluaciones disponibles.</p>');
            return;
        }

        // Create parallel fetches
        const fetches = typesData.map(type => {
            const normalizedType = type.toLowerCase();
            const idPregunta = tipoToIdPregunta[normalizedType] || 1;
            const url = `/personal-dashboard/${idPersonal}/${type}?id_tipo_pregunta=${idPregunta}`;
            console.log(`[idPersonal=${idPersonal}] queued fetch ${url}`);
            return fetch(url, { credentials: 'include', headers: { 'Cache-Control': 'no-cache' } })
                .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
                .then(json => ({ type, json }))
                .catch(err => {
                    console.warn(`[idPersonal=${idPersonal}] Fetch failed for ${type}:`, err);
                    return { type, json: null };
                });
        });

        // Run all in parallel
        const results = await Promise.all(fetches);

        const evaluations = results.map(r => {
            const label = r.type ? (r.type.charAt(0).toUpperCase() + r.type.slice(1)) : 'Desconocido';
            if (!r.json || !r.json.generalAverage) return { label, value: 0 };
            const value = parseFloat(r.json.generalAverage);
            return { label, value: isNaN(value) ? 0 : Math.min(Math.max(value, 0), 100) };
        });

        if (evaluations.length === 0 || evaluations.every(e => e.value === 0)) {
            chartContainer.insertAdjacentHTML('afterend', '<p class="text-center text-muted">No hay datos de evaluaciones disponibles para este personal.</p>');
            return;
        }

        roleEvaluationChartInstance = new Chart(chartContainer, {
            type: 'bar',
            data: {
                labels: evaluations.map(e => e.label),
                datasets: [{
                    label: 'Evaluaciones por Tipo',
                    data: evaluations.map(e => e.value),
                    backgroundColor: '#36a2eb',
                    borderColor: '#2b8bc6',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100 } },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}%` } }
                }
            }
        });

    } catch (error) {
        console.error(`[idPersonal=${idPersonal}] Error rendering chart:`, error);
        chartContainer.insertAdjacentHTML('afterend', '<p class="text-center text-muted">Error al cargar el gráfico de evaluaciones.</p>');
    }
}
async function handlePositiveComments(idPersonal) {
    try {
        const res = await fetch(`/comments-director?id_personal=${idPersonal}&type=positive`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Error fetching positive comments');
        displayComments('Comentarios Positivos', data.comments);
    } catch (error) {
        console.error(`[idPersonal=${idPersonal}] Error fetching positive comments:`, error);
        Swal.fire('Error', 'No se pudieron cargar los comentarios positivos', 'error');
    }
}

async function handleImprovementAreas(idPersonal) {
    try {
        const res = await fetch(`/comments-director?id_personal=${idPersonal}&type=negative`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Error fetching improvement areas');
        displayComments('Áreas de Mejora', data.comments);
    } catch (error) {
        console.error(`[idPersonal=${idPersonal}] Error fetching improvement areas:`, error);
        Swal.fire('Error', 'No se pudieron cargar las áreas de mejora', 'error');
    }
}

function displayComments(title, comments) {
    const modal = document.getElementById('commentsModal');
    const modalTitle = document.getElementById('commentsModalLabel');
    const commentsList = document.getElementById('commentsList');

    if (!modalTitle || !commentsList) {
        console.error('Modal elements not found:', { modalTitle, commentsList });
        Swal.fire('Error', 'No se pudo cargar el modal de comentarios.', 'error');
        return;
    }

    modalTitle.textContent = title;
    commentsList.innerHTML = comments.length
        ? comments.map(c => `<div class="list-group-item">${c.commenter}: ${c.comment}</div>`).join('')
        : '<div class="list-group-item text-center">No hay comentarios.</div>';

    if (commentsModalInstance) {
        commentsModalInstance.dispose();
    }
    commentsModalInstance = new bootstrap.Modal(modal);
    commentsModalInstance.show();
}

function calculateKPIAverage(categorias) {
    let totalWeightedResult = 0;
    let totalWeight = 0;

    if (!categorias || !Array.isArray(categorias) || categorias.length === 0) {
        return 0;
    }

    categorias.forEach(categoria => {
        const totalKPIs = categoria.kpis?.length || 0;
        if (totalKPIs > 0 && categoria.porcentaje_categoria) {
            const pesoPorKPI = categoria.porcentaje_categoria / totalKPIs;
            let resultadoCategoria = 0;
            categoria.kpis.forEach(kpi => {
                if (kpi.resultado_kpi !== 'No evaluado' && kpi.resultado_kpi !== null) {
                    const resultado = parseFloat(kpi.resultado_kpi);
                    const meta = parseFloat(kpi.meta_kpi);
                    if (!isNaN(resultado) && !isNaN(meta) && meta > 0) {
                        resultadoCategoria += (resultado / meta) * pesoPorKPI;
                    }
                }
            });
            totalWeightedResult += resultadoCategoria;
            totalWeight += categoria.porcentaje_categoria;
        }
    });

    return totalWeight > 0 ? Math.round(totalWeightedResult / totalWeight * 10000) / 100 : 0;
}

function renderCharts(personnel, evaluations, kpiData) {
    if (evaluationChartInstance) {
        evaluationChartInstance.destroy();
    }
    if (goalChartInstance) {
        goalChartInstance.destroy();
    }

    const evalLabels = personnel.map(p => `${p.nombre_personal} ${p.apaterno_personal}`);
    const evalData = personnel.map(p => {
        const evalInfo = (evaluations || []).find(e => e.id_personal === p.id_personal) || { positive_count: 0, total_count: 0 };
        return evalInfo.total_count > 0 ? Math.round((evalInfo.positive_count / evalInfo.total_count) * 100) : 0;
    });

    evaluationChartInstance = new Chart(evaluationChart, {
        type: 'bar',
        data: {
            labels: evalLabels,
            datasets: [{
                label: 'Evaluación',
                data: evalData,
                backgroundColor: '#36a2eb',
                borderColor: '#2b8bc6',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Porcentaje (%)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Personal'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y}%`;
                        }
                    }
                }
            }
        }
    });

    const goalLabels = personnel.map(p => `${p.nombre_personal} ${p.apaterno_personal}`);
    const goalData = personnel.map(p => {
        const kpiInfo = kpiData.find(k => k.id_personal === p.id_personal) || { kpis: [] };
        return calculateKPIAverage(kpiInfo.kpis);
    });

    goalChartInstance = new Chart(goalChart, {
        type: 'bar',
        data: {
            labels: goalLabels,
            datasets: [{
                label: 'Cumplimiento de Metas (KPIs)',
                data: goalData,
                backgroundColor: '#ff6384',
                borderColor: '#d84c6a',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Porcentaje (%)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Personal'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y}%`;
                        }
                    }
                }
            }
        }
    });
}