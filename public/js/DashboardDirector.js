const personnelCards = document.getElementById('personnelCards');
const personalCount = document.getElementById('personalCount');
const evaluationChart = document.getElementById('evaluationChart');
const goalChart = document.getElementById('goalChart');
const roleFilter = document.getElementById('roleFilter');
const applyFilterBtn = document.getElementById('applyFilter');
const positiveCommentsBtn = document.getElementById('positiveCommentsBtn');
const improvementAreasBtn = document.getElementById('improvementAreasBtn');
let commentsModalInstance = null;

const tipoToIdPregunta = {
    'materias': 1, // DOCENTE
    'ingles': 1, // DOCENTE
    'artes': 1, // DOCENTE
    'servicios': 8, // SERVICIO
    'talleres': 9, // TALLERES EXTRA CLASE
    'counselors': 2, // COUNSELOR
    'psicopedagogico': 1, // DOCENTE
    'coordinadores': 3, // COORDINADOR
    '360': 5, // 360
    'pares': 6, // PARES
    'jefes': 7, // JEFE
    'disciplina_deportiva': 1, // DOCENTE
    'liga_deportiva': 1 // DOCENTE
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!personnelCards || !personalCount) {
        console.error('DOM elements not found:', { personnelCards, personalCount });
        Swal.fire('Error', 'No se encontraron los elementos del DOM necesarios', 'error');
        return;
    }

    try {
        await loadRoles();
        await loadTopPersonnel();
        applyFilterBtn.addEventListener('click', async () => {
            const role = roleFilter.value;
            const sortOrder = document.querySelector('input[name="sortOrder"]:checked')?.value || 'top';
            await loadTopPersonnel(role, sortOrder);
            bootstrap.Modal.getInstance(document.getElementById('filterModal'))?.hide();
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

async function loadTopPersonnel(role = '', sortOrder = 'top') {
    try {
        const url = `/personnel-director?role=${encodeURIComponent(role)}&sort=${sortOrder}`;
        console.log('Fetching personnel from:', url);
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        console.log('Personnel data:', data);
        if (!data.success) throw new Error('No se pudieron obtener los datos del personal');

        let personnel = Array.isArray(data.personnel) ? data.personnel : [];
        personnelCards.innerHTML = '';
        personalCount.textContent = personnel.length;

        if (personnel.length === 0) {
            personnelCards.innerHTML = '<div class="col-12 text-muted text-center">No se encontró personal.</div>';
            return;
        }

        const personnelIds = personnel.map(p => p.id_personal).join(',');
        let evalData = { evaluations: [] };
        try {
            console.log('Fetching evaluations for IDs:', personnelIds);
            const evalRes = await fetch(`/evaluations-director-full?ids=${personnelIds}`, { credentials: 'include' });
            if (!evalRes.ok) throw new Error(`HTTP error ${evalRes.status}`);
            evalData = await evalRes.json();
            console.log('Evaluations data:', evalData);
            if (!evalData.success) {
                console.warn('Evaluación no exitosa, usando datos por defecto:', evalData.message);
                evalData = { evaluations: [] };
            }
        } catch (fetchError) {
            console.error('Error fetching evaluations:', fetchError);
            Swal.fire('Advertencia', 'No se pudieron cargar las evaluaciones, usando valores por defecto', 'warning');
        }

        personnel.forEach((person, index) => {
            const cardSizeClass = index === 1 ? 'card-middle' : 'card-side';
            const card = document.createElement('div');
            card.className = `card mx-3 ${cardSizeClass}`;
            card.style.width = index === 1 ? '16rem' : '12rem';
            const evalInfo = (evalData.evaluations || []).find(e => e.id_personal === person.id_personal) || { positive_count: 0, total_count: 0 };
            const percentage = evalInfo.total_count > 0 ? Math.round((evalInfo.positive_count / evalInfo.total_count) * 100) : 0;
            card.innerHTML = `
                <img src="./assets/img/${person.img_personal || 'iconousuario.png'}" class="card-img-top profile-img" alt="Personnel Photo" style="width: ${index === 1 ? '90px' : '70px'}; height: ${index === 1 ? '90px' : '70px'}; border-radius: 50%; margin: 10px auto;">
                <div class="card-body text-center p-3">
                    <h5 class="card-title fs-6">${person.nombre_personal} ${person.apaterno_personal} ${person.amaterno_personal}</h5>
                    <p class="card-text small"><strong>Puesto:</strong> ${person.nombre_puesto}</p>
                    ${person.subjects?.length ? `<p class="card-text small"><strong>Materias:</strong> ${person.subjects.join(', ')}</p>` : ''}
                    <p class="card-text small"><strong>Evaluación:</strong> ${percentage}%</p>
                    <div class="rating-bar">
                        <div class="rating-fill" style="width: ${percentage}%;"></div>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => showPersonnelModal(person));
            personnelCards.appendChild(card);
        });

        renderCharts(personnel, evalData.evaluations || []);
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

    const modal = new bootstrap.Modal(document.getElementById('personnelModal'));
    modal.show();

    await renderRoleEvaluationChart(person.id_personal);
}

async function renderRoleEvaluationChart(idPersonal) {
    const chartContainer = document.getElementById('roleEvaluationChart');
    if (!chartContainer) {
        console.error('Chart container not found');
        return;
    }
    chartContainer.innerHTML = '<div class="custom-chart-container"></div>';
    const container = chartContainer.querySelector('.custom-chart-container');

    try {
        console.log(`[idPersonal=${idPersonal}] Fetching evaluation types`);
        const typesRes = await fetch(`/personal-evaluaciones-types/${idPersonal}`, { credentials: 'include' });
        if (!typesRes.ok) throw new Error(`HTTP error ${typesRes.status}: ${typesRes.statusText}`);
        const typesData = await typesRes.json();
        console.log(`[idPersonal=${idPersonal}] Evaluation types response:`, JSON.stringify(typesData, null, 2));

        if (!Array.isArray(typesData)) {
            throw new Error('Evaluation types is not an array');
        }

        const evaluations = [];
        for (const type of typesData) {
            const idTipoPregunta = tipoToIdPregunta[type.toLowerCase()];
            if (idTipoPregunta) {
                console.log(`[idPersonal=${idPersonal}] Fetching results for type=${type}, idTipoPregunta=${idTipoPregunta}`);
                const resultsRes = await fetch(`/personal-evaluaciones-results/${idPersonal}/${type}?id_tipo_pregunta=${idTipoPregunta}`, { credentials: 'include' });
                if (!resultsRes.ok) {
                    console.warn(`[idPersonal=${idPersonal}] Failed to fetch results for type ${type}: HTTP ${resultsRes.status}`);
                    evaluations.push({
                        label: type.charAt(0).toUpperCase() + type.slice(1),
                        value: 0
                    });
                    continue;
                }
                const resultsData = await resultsRes.json();
                console.log(`[idPersonal=${idPersonal}] Results for ${type}:`, JSON.stringify(resultsData, null, 2));
                const value = parseFloat(resultsData.generalAverage) || 0;
                evaluations.push({
                    label: type.charAt(0).toUpperCase() + type.slice(1),
                    value
                });
            } else {
                console.warn(`[idPersonal=${idPersonal}] No idTipoPregunta found for type=${type}`);
            }
        }

        if (evaluations.length === 0) {
            console.log(`[idPersonal=${idPersonal}] No evaluations found for rendering`);
            container.innerHTML = '<p class="text-center text-muted">No hay evaluaciones disponibles.</p>';
            return;
        }

        console.log(`[idPersonal=${idPersonal}] Rendering evaluations:`, JSON.stringify(evaluations, null, 2));
        container.innerHTML = evaluations.map(evaluation => `
            <div class="chart-bar">
                <div class="custom-bar" style="height: ${Math.min(evaluation.value, 100)}%; background-color: #36a2eb;"></div>
                <span class="bar-label">${evaluation.label} (${evaluation.value > 0 ? evaluation.value + '%' : 'No evaluado'})</span>
            </div>
        `).join('');
    } catch (error) {
        console.error(`[idPersonal=${idPersonal}] Error fetching role evaluations:`, error);
        container.innerHTML = '<p class="text-center text-muted">Error al cargar evaluaciones.</p>';
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

function renderCharts(personnel, evaluations) {
    evaluationChart.innerHTML = '';
    goalChart.innerHTML = '';

    evaluationChart.innerHTML = `
        <div class="custom-chart-container">
            ${personnel.map(p => {
                const evalData = (evaluations || []).find(e => e.id_personal === p.id_personal) || { positive_count: 0, total_count: 0 };
                const positiveCount = evalData.positive_count || 0;
                const totalCount = evalData.total_count || 1;
                const percentage = Math.min((positiveCount / totalCount) * 100, 100);
                return `
                    <div class="chart-bar">
                        <div class="custom-bar" style="height: ${percentage}%; background-color: #36a2eb;"></div>
                        <span class="bar-label">${p.nombre_personal} ${p.apaterno_personal} (${positiveCount}/${totalCount})</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    goalChart.innerHTML = `
        <div class="custom-chart-container">
            ${personnel.map(p => `
                <div class="chart-bar">
                    <div class="custom-bar" style="height: ${p.goalAchievement || 0}%; background-color: #ff6384;"></div>
                    <span class="bar-label">${p.nombre_personal} ${p.apaterno_personal}</span>
                </div>
            `).join('')}
        </div>
    `;
}