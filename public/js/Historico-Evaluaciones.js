import { renderHeader } from '../assets/js/header.js';

const tipoToIdPregunta = {
  'materias': 1,
  'counselors': 2,
  'coordinadores': 3,
  'subordinados': 4,
  '360': 5,
  'pares': 6,
  'jefes': 7,
  'servicios': 8,
  'talleres': 9,
  'instalaciones': 10,
  'ingles': 1,
  'artes': 1,
  'psicopedagogico': 1
};

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Error en la respuesta del servidor: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Bootstrap disponible:', typeof bootstrap !== 'undefined' ? bootstrap : 'No encontrado');
  const sidebar = document.getElementById('sidebar');
  const personalContainer = document.getElementById('personalContainer');
  const buscadorPersonal = document.getElementById('buscadorPersonal');
  const ciclosList = document.getElementById('ciclosList');
  let ciclos = [];
  let personal = [];
  let personalCompleto = [];
  let currentCiclo = '';

  try {
    const response = await fetch('/auth-check', { credentials: 'include' });
    if (!response.ok) throw new Error(`Error al verificar autenticación: ${response.status}`);
    const data = await response.json();
    if (!data.authenticated) {
      Swal.fire({
        title: 'Sesión Expirada',
        text: 'Por favor, inicie sesión nuevamente.',
        icon: 'warning',
        confirmButtonText: 'Ir al inicio'
      }).then(() => window.location.href = '/');
      return;
    }
    document.getElementById('header-container').appendChild(renderHeader(data.user));
  } catch (error) {
    console.error('Error al verificar sesión:', error);
    Swal.fire({
      title: 'Error de Sesión',
      text: 'No se pudo verificar la sesión. Asegúrese de que el servidor esté corriendo.',
      icon: 'error',
      confirmButtonText: 'Ir al inicio'
    }).then(() => window.location.href = '/');
    return;
  }

  async function cargarCiclos() {
    try {
      const ciclosData = await fetchWithRetry('/historico-ciclos', { credentials: 'include' });
      console.log('Ciclos received:', ciclosData);
      ciclos = ciclosData;
      ciclosList.innerHTML = ciclos.length > 0 ? ciclos.map(c => `
        <li class="list-group-item ciclo-item" data-ciclo="${c.ciclo}">${c.ciclo}</li>
      `).join('') : '<li class="list-group-item text-muted">No hay ciclos disponibles</li>';

      if (ciclos.length > 0) {
        const firstCiclo = ciclos[0].ciclo;
        currentCiclo = firstCiclo;
        ciclosList.querySelector(`.ciclo-item[data-ciclo="${firstCiclo}"]`).classList.add('active');
        await cargarPersonalPorCiclo(firstCiclo);
      }
    } catch (error) {
      console.error('Error al cargar ciclos:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudieron cargar los ciclos. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  async function cargarPersonalPorCiclo(ciclo) {
    try {
      console.log(`Loading personal for ciclo: ${ciclo}`);
      personalContainer.innerHTML = '<div class="col-12 text-muted text-center">Cargando personal...</div>';
      personal = await fetchWithRetry(`/historico-personal-resultados/${ciclo}`, { credentials: 'include' });
      personalCompleto = personal;
      mostrarPersonal(personal);
    } catch (error) {
      console.error('Error al cargar personal por ciclo:', error);
      personalContainer.innerHTML = '<div class="col-12 text-muted text-center">Error al cargar personal.</div>';
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404')
          ? 'No se encontraron datos para el ciclo seleccionado.'
          : 'No se pudieron cargar los datos del personal. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) cargarPersonalPorCiclo(ciclo);
      });
    }
  }

  function mostrarPersonal(personalList) {
    console.log('Personal to display:', personalList);
    const textoBusqueda = buscadorPersonal.value.trim().toLowerCase();
    const filtrados = textoBusqueda ? personalCompleto.filter(item =>
      `${item.nombre_personal} ${item.apaterno_personal} ${item.amaterno_personal}`.toLowerCase().includes(textoBusqueda)
    ) : personalList;

    if (filtrados.length === 0) {
      console.log('No personnel to display after filtering');
      personalContainer.innerHTML = '<div class="col-12 text-muted text-center">No se encontraron resultados.</div>';
      return;
    }

    personalContainer.innerHTML = filtrados.map(item => `
      <div class="col-12 col-sm-6 col-md-4 col-lg-3 mb-4">
        <div class="personal-card">
          <img src="/assets/img/${item.img_personal || 'user.png'}" alt="Foto de ${item.nombre_personal}">
          <h5>${item.nombre_personal} ${item.apaterno_personal} ${item.amaterno_personal}</h5>
          <p>${item.roles_puesto || item.roles || 'Sin puesto'}</p>
          <div>
            <button class="btn btn-perfil" data-id="${item.id_personal}" data-ciclo="${currentCiclo}">Perfil</button>
            <button class="btn btn-resultados" data-id="${item.id_personal}" data-ciclo="${currentCiclo}">Resultados</button>
          </div>
        </div>
      </div>
    `).join('');
    console.log('Personnel cards rendered:', filtrados.length);

    personalContainer.querySelectorAll('.btn-perfil').forEach(button => {
      button.addEventListener('click', () => {
        const id_personal = button.getAttribute('data-id');
        const ciclo = button.getAttribute('data-ciclo');
        console.log('Clic en botón Perfil, id_personal:', id_personal, 'ciclo:', ciclo);
        mostrarFichaCompleta(id_personal, ciclo);
      });
    });

    personalContainer.querySelectorAll('.btn-resultados').forEach(button => {
      button.addEventListener('click', () => {
        const id_personal = button.getAttribute('data-id');
        const ciclo = button.getAttribute('data-ciclo');
        console.log('Clic en botón Resultados, id_personal:', id_personal, 'ciclo:', ciclo);
        const resultadosModal = new bootstrap.Modal(document.getElementById('resultadosModal'));
        resultadosModal.show();

        const kpisButton = document.querySelector('#resultadosModal .btn-kpis');
        const evaluacionesButton = document.querySelector('#resultadosModal .btn-evaluaciones');
        kpisButton.setAttribute('data-id', id_personal);
        kpisButton.setAttribute('data-ciclo', ciclo);
        evaluacionesButton.setAttribute('data-id', id_personal);
        evaluacionesButton.setAttribute('data-ciclo', ciclo);

        kpisButton.onclick = () => {
          resultadosModal.hide();
          mostrarKPIs(id_personal, ciclo);
        };

        evaluacionesButton.onclick = () => {
          resultadosModal.hide();
          mostrarEvaluaciones(id_personal, ciclo);
        };
      });
    });
  }

  async function mostrarFichaCompleta(id_personal, ciclo) {
    try {
      const modalElement = document.getElementById('perfilModal');
      console.log('Perfil modal element:', modalElement);
      if (!modalElement) throw new Error('No se encontró el elemento #perfilModal');

      const data = await fetchWithRetry(`/historico-personal-resultados/${id_personal}/${ciclo}`, { credentials: 'include' });
      const { nombre_personal, apaterno_personal, amaterno_personal, telefono_personal, fecha_nacimiento_personal, img_personal, roles_puesto, roles, materias = [], talleres = [] } = data;
      const fecha = fecha_nacimiento_personal ? new Date(fecha_nacimiento_personal).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'No disponible';
      const groupedMaterias = materias.reduce((acc, materia) => {
        const key = `${materia.nombre_materia}|${materia.grado_materia}`;
        if (!acc[key]) {
          acc[key] = { nombre_materia: materia.nombre_materia, grado_materia: materia.grado_materia, grupos: [] };
        }
        acc[key].grupos.push(materia.grupo);
        return acc;
      }, {});
      const materiasList = Object.values(groupedMaterias).sort((a, b) => a.grado_materia === b.grado_materia ? a.nombre_materia.localeCompare(b.nombre_materia) : a.grado_materia - b.grado_materia);
      const modalBody = document.querySelector('#perfilModal .modal-body');
      modalBody.innerHTML = `
        <div class="text-center">
          <img src="/assets/img/${img_personal || 'user.png'}" alt="Foto de ${nombre_personal}" class="perfil-img mb-3">
          <h4>${nombre_personal} ${apaterno_personal} ${amaterno_personal}</h4>
          <p class="text-muted">${roles_puesto || roles || 'Sin roles asignados'}</p>
          <p class="text-muted">Ciclo: ${ciclo}</p>
        </div>
        <div class="perfil-details">
          <h5>Datos Personales</h5>
          <p><strong>Teléfono:</strong> ${telefono_personal || 'No disponible'}</p>
          <p><strong>Fecha de Nacimiento:</strong> ${fecha}</p>
          <h5>Materias Impartidas</h5>
          ${materiasList.length > 0 ? `
            <ul class="list-group mb-3">
              ${materiasList.map(m => `
                <li class="list-group-item">
                  <strong>${m.nombre_materia}</strong> (Grado ${m.grado_materia}, Grupos: ${m.grupos.sort().join(', ')})
                </li>
              `).join('')}
            </ul>
          ` : '<p class="text-muted">No imparte materias</p>'}
          <h5>Talleres Asignados</h5>
          ${talleres.length > 0 ? `
            <ul class="list-group">
              ${talleres.map(t => `
                <li class="list-group-item">${t.nombre_taller}</li>
              `).join('')}
            </ul>
          ` : '<p class="text-muted">No está asignado a talleres</p>'}
        </div>
      `;
      const modal = new bootstrap.Modal(modalElement);
      console.log('Perfil modal inicializado:', modal);
      modal.show();
    } catch (error) {
      console.error('Error en mostrarFichaCompleta:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') ? 'Personal no encontrado.' : 'No se pudieron cargar los datos del personal.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  async function mostrarKPIs(id_personal, ciclo) {
    try {
      const modalElement = document.getElementById('kpisModal');
      console.log('KPIs modal element:', modalElement);
      if (!modalElement) throw new Error('No se encontró el elemento #kpisModal');

      const personalData = await fetchWithRetry(`/historico-personal-resultados/${id_personal}/${ciclo}`, { credentials: 'include' });
      if (!personalData) throw new Error('No se encontraron datos del personal');
      const { nombre_personal = '', apaterno_personal = '', amaterno_personal = '', nombre_puesto = 'No disponible' } = personalData;
      const data = await fetchWithRetry(`/historico-personal-kpis/${id_personal}/${ciclo}`, { credentials: 'include' });
      if (!data || !Array.isArray(data)) throw new Error('No se encontraron datos de KPIs o formato inválido');
      const modalBody = document.querySelector('#kpisModal .modal-body');
      if (!modalBody) throw new Error('No se encontró el elemento #kpisModal .modal-body');
      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = `
        <h4 class="kpi-title">TABLERO DE INDICADORES CLAVE DE RENDIMIENTO Y PERMANENCIA POR PUESTO</h4>
        <table class="kpi-header-table">
          <tr><th>PUESTO:</th><td>${nombre_puesto}</td></tr>
          <tr><th>Período de evaluación:</th><td>${ciclo}</td></tr>
          <tr><th>NOMBRE COLABORADOR:</th><td>${nombre_personal} ${apaterno_personal} ${amaterno_personal}</td></tr>
        </table>
        ${data.map(categoria => {
          const resumen = calcularResumen(categoria);
          return `
            <div class="kpi-category">
              <h3 class="category-header">CATEGORÍA DE EVALUACIÓN: ${categoria.nombre_categoria_kpi?.toUpperCase() || 'Sin categoría'}</h3>
              <table class="kpi-summary-table">
                <thead>
                  <tr class="sub-header">
                    <th class="valor">VALOR</th>
                    <th class="num-kpis"># KPIs</th>
                    <th class="kpis-cumplidos"># KPIs CON CUMPLIMIENTO</th>
                    <th class="resultado-categoria">RESULTADO</th>
                  </tr>
                </thead>
                <tbody class="category-data">
                  <tr>
                    <td class="valor">${categoria.porcentaje_categoria ? categoria.porcentaje_categoria + '%' : 'N/A'}</td>
                    <td class="num-kpis">${resumen.totalKPIs}</td>
                    <td class="kpis-cumplidos">${resumen.kpisCalificados}</td>
                    <td class="resultado-categoria">${resumen.resultadoCategoria}</td>
                  </tr>
                </tbody>
              </table>
              <table class="kpi-table">
                <thead>
                  <tr class="sub-header">
                    <th class="no">No.</th>
                    <th colspan="5">ÁREAS ESTRATÉGICAS</th>
                    <th colspan="2">INDICADOR</th>
                    <th class="nombre-kpi">INDICADORES CLAVE DE RENDIMIENTO Y PERMANENCIA (KPIs)</th>
                    <th class="meta">META</th>
                    <th class="responsable">RESPONSABLE DE MEDICIÓN</th>
                    <th class="resultado">RESULTADO</th>
                  </tr>
                  <tr class="sub-header">
                    <th class="no"></th>
                    <th class="area-estrategica">EA</th>
                    <th class="area-estrategica">FI</th>
                    <th class="area-estrategica">GE</th>
                    <th class="area-estrategica">AF</th>
                    <th class="area-estrategica">DG</th>
                    <th class="indicador">E</th>
                    <th class="indicador">O</th>
                    <th class="nombre-kpi"></th>
                    <th class="meta"></th>
                    <th class="responsable"></th>
                    <th class="resultado"></th>
                  </tr>
                </thead>
                <tbody>
                  ${categoria.kpis?.map((kpi, index) => `
                    <tr>
                      <td class="no">${index + 1}</td>
                      <td class="area-estrategica">${kpi.siglas_area_estrategica === 'EA' ? 'X' : ''}</td>
                      <td class="area-estrategica">${kpi.siglas_area_estrategica === 'FI' ? 'X' : ''}</td>
                      <td class="area-estrategica">${kpi.siglas_area_estrategica === 'GE' ? 'X' : ''}</td>
                      <td class="area-estrategica">${kpi.siglas_area_estrategica === 'AF' ? 'X' : ''}</td>
                      <td class="area-estrategica">${kpi.siglas_area_estrategica === 'DG' ? 'X' : ''}</td>
                      <td class="indicador">${kpi.sigla_indicador_kpi === 'E' ? 'X' : ''}</td>
                      <td class="indicador">${kpi.sigla_indicador_kpi === 'O' ? 'X' : ''}</td>
                      <td class="nombre-kpi">${kpi.nombre_kpi || 'Sin nombre'}</td>
                      <td class="meta">${kpi.meta_kpi}${kpi.tipo_kpi === 'Porcentaje' ? '%' : ''}</td>
                      <td class="responsable">${kpi.responsable_medicion || 'No asignado'}</td>
                      <td class="resultado">${kpi.resultado_kpi || 'No evaluado'}${kpi.tipo_kpi === 'Porcentaje' && kpi.resultado_kpi && kpi.resultado_kpi !== 'No evaluado' ? '%' : ''}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="12">No hay KPIs disponibles</td></tr>'}
                </tbody>
              </table>
            </div>
          `;
        }).join('')}
      `;
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
      }
      modalBody.innerHTML = '';
      modalBody.appendChild(fragment);
      const modal = new bootstrap.Modal(modalElement);
      console.log('KPIs modal inicializado:', modal);

      modalElement.addEventListener('hidden.bs.modal', () => {
        console.log('KPIs modal cerrado, limpiando backdrop');
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());
        document.body.classList.remove('modal-open');
        document.body.style.paddingRight = '';
      }, { once: true });

      modal.show();
    } catch (error) {
      console.error('Error en mostrarKPIs:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') ? 'KPIs no encontrados.' : 'No se pudieron cargar los KPIs.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  async function mostrarEvaluaciones(id_personal, ciclo) {
    try {
      const modalElement = document.getElementById('evaluacionesModal');
      console.log('Evaluaciones modal element:', modalElement);
      if (!modalElement) throw new Error('No se encontró el elemento #evaluacionesModal');

      const modalBody = document.querySelector('#evaluacionesModal .modal-body');
      console.log('Evaluaciones modal body:', modalBody);
      if (!modalBody) throw new Error('No se encontró el elemento #evaluacionesModal .modal-body');

      const tipos = await fetchWithRetry(`/historico-personal-evaluaciones-types/${id_personal}/${ciclo}`, { credentials: 'include' });
      console.log('Tipos de evaluaciones:', tipos);

      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = tipos.length === 0 
        ? '<p class="text-muted text-center">No hay evaluaciones disponibles para este personal.</p>' 
        : tipos.map(tipo => `<button class="btn btn-evaluacion">${tipo}</button>`).join('');
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
      }
      modalBody.innerHTML = '';
      modalBody.appendChild(fragment);

      const modal = new bootstrap.Modal(modalElement);
      console.log('Evaluaciones modal inicializado:', modal);

      modalElement.addEventListener('hidden.bs.modal', () => {
        console.log('Evaluaciones modal cerrado, limpiando backdrop');
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());
        document.body.classList.remove('modal-open');
        document.body.style.paddingRight = '';
      }, { once: true });

      modalBody.querySelectorAll('.btn-evaluacion').forEach(button => {
        button.addEventListener('click', async () => {
          const tipo = button.textContent;
          console.log(`Clic en botón de evaluación: ${tipo}, id_personal: ${id_personal}, ciclo: ${ciclo}`);
          modal.hide();
          await mostrarEvaluacionResults(id_personal, tipo, ciclo);
        });
      });

      modal.show();
    } catch (error) {
      console.error('Error en mostrarEvaluaciones:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudieron cargar las evaluaciones.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  async function mostrarEvaluacionResults(id_personal, tipo, ciclo) {
    try {
      const modalElement = document.getElementById('evaluacionResultsModal');
      console.log('EvaluacionResults modal element:', modalElement);
      if (!modalElement) throw new Error('No se encontró el elemento #evaluacionResultsModal');

      const modalBody = document.querySelector('#evaluacionResultsModal .modal-body');
      console.log('EvaluacionResults modal body:', modalBody);
      if (!modalBody) throw new Error('No se encontró el elemento #evaluacionResultsModal .modal-body');

      const idTipoPregunta = tipoToIdPregunta[tipo];
      if (!idTipoPregunta) throw new Error('Tipo de evaluación no soportado');

      const data = await fetchWithRetry(`/historico-personal-evaluaciones-results/${id_personal}/${tipo}/${ciclo}?id_tipo_pregunta=${idTipoPregunta}`, { credentials: 'include' });
      console.log('Datos de evaluación:', data);

      let html = `
        <div class="results-header">
          <h4>PREPA BALMORAL ESCOCÉS</h4>
          <h5>CONCENTRADO EVALUACIÓN - CICLO ${ciclo}</h5>
          <p>NOMBRE: ${data.teacherName}</p>
        </div>
        <table class="results-table">
          <thead>
            <tr>
              <th>No.</th>
              <th>CRITERIO DE EVALUACIÓN</th>
      `;

      if (data.isMultiple) {
        data.subjects.forEach(subject => {
          html += `<th colspan="2">${subject.name}</th>`;
        });
        html += `<th>PROMEDIO</th></tr><tr><th></th><th></th>`;
        data.subjects.forEach(() => {
          html += `<th>% de Sí</th><th>% de No</th>`;
        });
        html += `<th></th></tr>`;
      } else {
        html += `
          <th colspan="2">${data.subjects[0]?.name || 'N/A'}</th>
          <th>PROMEDIO</th>
        </tr>
        <tr>
          <th></th>
          <th></th>
          <th>% de Sí</th>
          <th>% de No</th>
          <th></th>
        </tr>
        `;
      }

      html += `</thead><tbody>`;

      html += `<tr><td></td><td>Total de alumnos</td>`;
      data.subjects.forEach(subject => {
        html += `<td colspan="2">${subject.totalAlumnos}</td>`;
      });
      html += `<td></td></tr>`;

      for (let i = 0; i < data.criteria.length; i++) {
        const crit = data.criteria[i];
        html += `<tr><td>${crit.no}</td><td>${crit.criterio}</td>`;
        data.subjects.forEach(subject => {
          const c = subject.criteria[i] || { pctSi: 0, pctNo: 0 };
          html += `<td>${c.pctSi}%</td><td>${c.pctNo}%</td>`;
        });
        html += `<td>${crit.promedio}%</td></tr>`;
      }

      html += `<tr><td></td><td>PROMEDIO GENERAL DE SATISFACCIÓN</td>`;
      data.subjects.forEach(subject => {
        html += `<td>${subject.avgSi}%</td><td>${subject.avgNo}%</td>`;
      });
      html += `<td>${data.generalAverage}%</td></tr>`;

      html += `</tbody></table>`;

      html += `
        <div class="comments-section">
          <h3>Comentarios</h3>
          <ul>
            ${data.comments.length > 0 ? data.comments.map(comment => `<li>"${comment}"</li>`).join('') : '<li>No hay comentarios disponibles</li>'}
          </ul>
        </div>
      `;

      modalBody.innerHTML = html;

      const modal = new bootstrap.Modal(modalElement);
      console.log('EvaluacionResults modal inicializado:', modal);

      modalElement.addEventListener('hidden.bs.modal', () => {
        console.log('EvaluacionResults modal cerrado, limpiando backdrop');
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());
        document.body.classList.remove('modal-open');
        document.body.style.paddingRight = '';
      }, { once: true });

      modal.show();
    } catch (error) {
      console.error('Error en mostrarEvaluacionResults:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudieron cargar los resultados de la evaluación.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  function calcularResumen(categoria) {
    const totalKPIs = categoria.kpis?.length || 0;
    let kpisCalificados = 0;
    let resultadoCategoria = 0;
    if (totalKPIs > 0) {
      const pesoPorKPI = categoria.porcentaje_categoria / totalKPIs;
      categoria.kpis.forEach(kpi => {
        if (kpi.resultado_kpi !== 'No evaluado' && kpi.resultado_kpi !== null) {
          kpisCalificados++;
          const resultado = parseFloat(kpi.resultado_kpi);
          const meta = parseFloat(kpi.meta_kpi);
          if (!isNaN(resultado) && !isNaN(meta) && meta > 0) {
            resultadoCategoria += (resultado / meta) * pesoPorKPI;
          }
        }
      });
      resultadoCategoria = Math.round(resultadoCategoria * 100) / 100 + '%';
    } else {
      resultadoCategoria = 'N/A';
    }
    return { totalKPIs, kpisCalificados, resultadoCategoria };
  }

  sidebar.addEventListener('click', async (e) => {
    const cicloItem = e.target.closest('.ciclo-item');
    if (cicloItem) {
      document.querySelectorAll('.ciclo-item').forEach(item => item.classList.remove('active'));
      cicloItem.classList.add('active');
      buscadorPersonal.value = '';
      currentCiclo = cicloItem.dataset.ciclo;
      await cargarPersonalPorCiclo(currentCiclo);
    }
  });

  buscadorPersonal.addEventListener('input', () => {
    mostrarPersonal(personal);
  });

  await cargarCiclos();
});