import { renderHeader } from '../assets/js/header.js';

const tipoToIdPregunta = {
  materias: 1,
  counselors: 2,
  coordinadores: 3,
  subordinados: 4,
  '360': 5,
  pares: 6,
  jefes: 7,
  servicios: 8,
  talleres: 9,
  instalaciones: 10,
  ingles: 1,
  artes: 1,
  psicopedagogico: 1
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
    const response = await fetchWithRetry('/auth-check', { credentials: 'include' });
    const data = await response;
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
      console.log('Ciclos recibidos:', ciclosData);
      ciclos = Array.isArray(ciclosData) ? ciclosData : [];
      ciclosList.innerHTML = ciclos.length > 0 ? ciclos.map(c => `
        <li class="list-group-item ciclo-item" data-ciclo="${c.ciclo}">${c.ciclo}</li>
      `).join('') : '<li class="list-group-item text-muted">No hay ciclos disponibles</li>';

      if (ciclos.length > 0) {
        currentCiclo = ciclos[0].ciclo;
        ciclosList.querySelector(`.ciclo-item[data-ciclo="${currentCiclo}"]`).classList.add('active');
        await cargarPersonalPorCiclo(currentCiclo);
      } else {
        personalContainer.innerHTML = '<div class="col-12 text-muted text-center">No hay ciclos disponibles.</div>';
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
      console.log(`Cargando personal para ciclo: ${ciclo}`);
      personalContainer.innerHTML = '<div class="col-12 text-muted text-center">Cargando personal...</div>';
      personal = await fetchWithRetry(`/historico-personal-resultados/${ciclo}`, { credentials: 'include' });
      personalCompleto = Array.isArray(personal) ? personal : [];
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
    console.log('Personal a mostrar:', personalList);
    const textoBusqueda = buscadorPersonal.value.trim().toLowerCase();
    const filtrados = textoBusqueda ? personalCompleto.filter(item =>
      `${item.nombre_personal} ${item.apaterno_personal} ${item.amaterno_personal}`.toLowerCase().includes(textoBusqueda)
    ) : personalList;

    if (filtrados.length === 0) {
      console.log('No hay personal para mostrar después de filtrar');
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
            <button class="btn btn-historico" data-id="${item.id_personal}">Histórico</button>
          </div>
        </div>
      </div>
    `).join('');
    console.log('Tarjetas de personal renderizadas:', filtrados.length);

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

    personalContainer.querySelectorAll('.btn-historico').forEach(button => {
      button.addEventListener('click', async () => {
        const id_personal = button.getAttribute('data-id');
        console.log('Clic en botón Histórico, id_personal:', id_personal);
        await mostrarHistoricoModal(id_personal);
      });
    });
  }

  async function mostrarFichaCompleta(id_personal, ciclo) {
    try {
      const modalElement = document.getElementById('perfilModal');
      console.log('Perfil modal element:', modalElement);
      if (!modalElement) throw new Error('No se encontró el elemento #perfilModal');

      const data = await fetchWithRetry(`/historico-personal-resultados/${id_personal}/${ciclo}`, { credentials: 'include' });
      if (!data) throw new Error('No se encontraron datos del personal');
      const { nombre_personal = '', apaterno_personal = '', amaterno_personal = '', telefono_personal = '', fecha_nacimiento_personal = '', img_personal = '', roles_puesto = '', roles = '', materias = [], talleres = [] } = data;
      const fecha = fecha_nacimiento_personal ? new Date(fecha_nacimiento_personal).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'No disponible';
      const groupedMaterias = materias.reduce((acc, materia) => {
        const key = `${materia.nombre_materia}|${materia.grado}`;
        if (!acc[key]) {
          acc[key] = { nombre_materia: materia.nombre_materia, grado_materia: materia.grado, grupos: [] };
        }
        acc[key].grupos = materia.grupos.split(', '); // Use pre-grouped grupos
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
      const { nombre_personal = '', apaterno_personal = '', amaterno_personal = '', roles = 'No disponible' } = personalData;
      const data = await fetchWithRetry(`/historico-personal-kpis/${id_personal}/${ciclo}`, { credentials: 'include' });
      if (!data || !Array.isArray(data)) throw new Error('No se encontraron datos de KPIs o formato inválido');
      const modalBody = document.querySelector('#kpisModal .modal-body');
      if (!modalBody) throw new Error('No se encontró el elemento #kpisModal .modal-body');
      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = `
        <h4 class="kpi-title">TABLERO DE INDICADORES CLAVE DE RENDIMIENTO Y PERMANENCIA POR PUESTO</h4>
        <table class="kpi-header-table">
          <tr><th>PUESTO:</th><td>${roles}</td></tr>
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
                      <td class="responsable">${kpi.id_rol ? 'Rol ID ' + kpi.id_rol : 'No asignado'}</td>
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
        : tipos.map(tipo => `<button class="btn btn-evaluacion">${tipo.charAt(0).toUpperCase() + tipo.slice(1)}</button>`).join('');
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
          const tipo = button.textContent.toLowerCase();
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

      const idTipoPregunta = tipoToIdPregunta[tipo.toLowerCase()];
      if (!idTipoPregunta) throw new Error(`Tipo de evaluación no soportado: ${tipo}`);

      const data = await fetchWithRetry(`/historico-personal-evaluaciones-results/${id_personal}/${tipo}/${ciclo}`, { credentials: 'include' });
      console.log('Datos de evaluación:', data);
      if (!data.success) throw new Error(data.message || 'Error al obtener resultados de evaluación');

      let html = `
        <div class="results-header">
          <h4>PREPA BALMORAL ESCOCÉS</h4>
          <h5>CONCENTRADO EVALUACIÓN - CICLO ${ciclo}</h5>
          <p>NOMBRE: ${data.teacherName || 'No disponible'}</p>
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
          <th colspan="2">${data.subjects[0]?.name || tipo.charAt(0).toUpperCase() + tipo.slice(1)}</th>
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
        html += `<td colspan="2">${subject.totalAlumnos || 0}</td>`;
      });
      html += `<td></td></tr>`;

      for (let i = 0; i < data.criteria.length; i++) {
        const crit = data.criteria[i];
        html += `<tr><td>${crit.no}</td><td>${crit.criterio}</td>`;
        data.subjects.forEach(subject => {
          const c = subject.criteria[i] || { pctSi: 'N/A', pctNo: 'N/A' };
          html += `<td>${c.pctSi === 'N/A' ? 'N/A' : c.pctSi + '%'}</td><td>${c.pctNo === 'N/A' ? 'N/A' : c.pctNo + '%'}</td>`;
        });
        html += `<td>${crit.promedio === 'N/A' ? 'N/A' : crit.promedio + '%'}</td></tr>`;
      }

      html += `<tr><td></td><td>PROMEDIO GENERAL DE SATISFACCIÓN</td>`;
      data.subjects.forEach(subject => {
        html += `<td>${subject.avgSi === 'N/A' ? 'N/A' : subject.avgSi + '%'}</td><td>${subject.avgNo === 'N/A' ? 'N/A' : subject.avgNo + '%'}</td>`;
      });
      html += `<td>${data.generalAverage === 'N/A' ? 'N/A' : data.generalAverage + '%'}</td></tr>`;

      html += `</tbody></table>`;

      html += `
        <div class="comments-section">
          <h3>Comentarios</h3>
          <ul>
            ${data.comments && data.comments.length > 0 ? data.comments.map(comment => `<li>"${comment}"</li>`).join('') : '<li>No hay comentarios disponibles</li>'}
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
        text: error.message.includes('404') ? 'Resultados no encontrados.' : 'No se pudieron cargar los resultados de la evaluación.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  async function mostrarHistoricoModal(id_personal) {
    try {
      const modalElement = document.getElementById('historicoModal');
      if (!modalElement) throw new Error('No se encontró el elemento #historicoModal');

      const ciclosPersonal = await fetchWithRetry(`/historico-ciclos-personal/${id_personal}`, { credentials: 'include' });
      const checkboxesContainer = document.getElementById('ciclosCheckboxes');
      checkboxesContainer.innerHTML = ciclosPersonal.map(ciclo => `
        <div class="form-check">
          <input class="form-check-input" type="checkbox" value="${ciclo.ciclo}" id="ciclo_${ciclo.ciclo}">
          <label class="form-check-label" for="ciclo_${ciclo.ciclo}">
            ${ciclo.ciclo}
          </label>
        </div>
      `).join('');

      const modal = new bootstrap.Modal(modalElement);
      modal.show();

      document.getElementById('ciclosForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedCiclos = Array.from(document.querySelectorAll('#ciclosCheckboxes .form-check-input:checked')).map(checkbox => checkbox.value);
        if (selectedCiclos.length === 0) {
          Swal.fire({
            title: 'Error',
            text: 'Seleccione al menos un ciclo.',
            icon: 'error',
            confirmButtonText: 'Aceptar'
          });
          return;
        }
        modal.hide();
        await generarPDFHistorico(id_personal, selectedCiclos);
      }, { once: true });
    } catch (error) {
      console.error('Error en mostrarHistoricoModal:', error);
      Swal.fire({
        title: 'Error',
        text: 'No se pudieron cargar los ciclos para este personal.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  async function generarPDFHistorico(id_personal, selectedCiclos) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const canvas = document.getElementById('chart-canvas');
      const ctx = canvas.getContext('2d');

      let personalData;
      for (let i = 0; i < selectedCiclos.length; i++) {
        const ciclo = selectedCiclos[i];
        personalData = await fetchWithRetry(`/historico-personal-resultados/${id_personal}/${ciclo}`, { credentials: 'include' });
        if (!personalData) throw new Error(`No se encontraron datos para el ciclo ${ciclo}`);

        if (i > 0) doc.addPage();
        let y = 10; // Start position for each page

        // Header image and text
        doc.addImage("/assets/img/logo_balmoral.png", "PNG", 15, y, 25, 12);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 120, 120);
        doc.text("Preparatoria Balmoral Escocés", 105, y + 6, { align: "center" });
        doc.setFontSize(9);
        doc.setFont("times", "italic");
        doc.setTextColor(150, 150, 150);
        doc.text('"Construir conciencias y potenciar talentos"', 105, y + 12, { align: "center" });
        y += 20;

        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.setTextColor("#000000");
        doc.text(`Resultados del Personal - Ciclo ${ciclo}`, 105, y, { align: "center" });
        y += 12;

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor("#555555");
        doc.text(
          `Este reporte muestra los resultados de las evaluaciones aplicadas a ${personalData.nombre_personal} ${personalData.apaterno_personal} ${personalData.amaterno_personal}.`,
          105,
          y,
          { align: "center", maxWidth: 180 }
        );
        y += 18;

        doc.setDrawColor(200, 200, 200);
        doc.line(15, y, 195, y);
        y += 10;

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor("#000000");
        doc.text("Datos del Personal", 15, y);
        y += 8;

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor("#333333");
        doc.text(
          `Nombre: ${personalData.nombre_personal} ${personalData.apaterno_personal} ${personalData.amaterno_personal}`,
          15,
          y
        );
        y += 6;
        doc.text(`Teléfono: ${personalData.telefono_personal || "No disponible"}`, 15, y);
        y += 6;
        doc.text(
          `Fecha de Nacimiento: ${
            personalData.fecha_nacimiento_personal
              ? new Date(personalData.fecha_nacimiento_personal).toLocaleDateString("es-MX")
              : "No disponible"
          }`,
          15,
          y
        );
        y += 6;
        doc.text(
          `Roles: ${personalData.roles_puesto || personalData.roles || "Sin roles"}`,
          15,
          y
        );
        y += 12;

        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor("#d9534f");
        doc.text("Materias Impartidas:", 15, y);
        y += 6;

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor("#000000");

        if (personalData.materias && personalData.materias.length > 0) {
          const groupedMaterias = personalData.materias.reduce((acc, materia) => {
            const key = `${materia.nombre_materia}|${materia.grado_materia}`;
            if (!acc[key]) {
              acc[key] = {
                nombre_materia: materia.nombre_materia,
                grado_materia: materia.grado_materia,
                grupos: []
              };
            }
            acc[key].grupos = materia.grupos.split(', '); // Use pre-grouped grupos
            return acc;
          }, {});
          Object.values(groupedMaterias).forEach(m => {
            doc.text(
              `- ${m.nombre_materia} (Grado ${m.grado_materia}, Grupos: ${m.grupos.sort().join(", ")})`,
              20,
              y
            );
            y += 6;
          });
        } else {
          doc.text("No imparte materias", 20, y);
          y += 6;
        }
        y += 6;

        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor("#d9534f");
        doc.text("Talleres Asignados:", 15, y);
        y += 6;

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor("#000000");

        if (personalData.talleres && personalData.talleres.length > 0) {
          personalData.talleres.forEach(t => {
            doc.text(`- ${t.nombre_taller}`, 20, y);
            y += 6;
          });
        } else {
          doc.text("No asignado a talleres", 20, y);
          y += 6;
        }
        y += 12;

        const tipos = await fetchWithRetry(`/historico-personal-evaluaciones-types/${id_personal}/${ciclo}`, { credentials: 'include' });
        if (tipos.length === 0) {
          doc.text("No hay evaluaciones calificadas disponibles.", 15, y);
          y += 10;
        } else {
          const labels = [];
          const dataScores = [];
          for (const tipo of tipos) {
            const idTipoPregunta = tipoToIdPregunta[tipo.toLowerCase()];
            const results = await fetchWithRetry(
              `/historico-personal-evaluaciones-results/${id_personal}/${tipo}/${ciclo}`,
              { credentials: "include" }
            );
            if (results.generalAverage !== "N/A" && !isNaN(parseFloat(results.generalAverage))) {
              labels.push(tipo.toUpperCase());
              dataScores.push(parseFloat(results.generalAverage));
            }
          }

          if (labels.length > 0) {
            // Generate chart
            const chart = new Chart(ctx, {
              type: "bar",
              data: {
                labels: labels,
                datasets: [
                  {
                    label: "Porcentaje obtenido",
                    data: dataScores,
                    backgroundColor: ["#d9534f", "#0275d8", "#5cb85c", "#f0ad4e"]
                  }
                ]
              },
              options: {
                indexAxis: "y",
                responsive: true,
                plugins: {
                  legend: { display: false },
                  title: {
                    display: true,
                    text: "Resultados por Evaluación",
                    font: { size: 16 }
                  },
                  datalabels: {
                    anchor: "end",
                    align: "right",
                    color: "#000",
                    font: { size: 14, weight: "bold" },
                    formatter: value => value + "%"
                  }
                },
                scales: {
                  x: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                      callback: value => value + "%",
                      font: { size: 14 }
                    }
                  },
                  y: {
                    ticks: { font: { size: 14 } }
                  }
                }
              },
              plugins: [ChartDataLabels]
            });

            await new Promise(resolve => setTimeout(resolve, 500));
            const chartImage = canvas.toDataURL("image/png");
            doc.addImage(chartImage, "PNG", 15, y, 180, 80);
            y += 90;

            chart.destroy();
          } else {
            doc.text("No hay resultados de evaluaciones calificadas disponibles.", 15, y);
            y += 10;
          }
        }

        // Fetch and add comments
        const positiveComments = await fetchWithRetry(`/historico-comments-director/${id_personal}/${ciclo}?type=positive`, { credentials: 'include' });
        const negativeComments = await fetchWithRetry(`/historico-comments-director/${id_personal}/${ciclo}?type=negative`, { credentials: 'include' });

        if (y > 220) {
          doc.addPage();
          y = 10;
        }

        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor("#d9534f");
        doc.text("Comentarios de Admiración:", 15, y);
        y += 6;

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor("#000000");

        if (positiveComments.comments && positiveComments.comments.length > 0) {
          positiveComments.comments.forEach((comment, index) => {
            if (y > 260) {
              doc.addPage();
              y = 10;
            }
            doc.text(`${index + 1}. ${comment.commenter}: ${comment.comment}`, 20, y, { maxWidth: 170 });
            y += 10;
          });
        } else {
          doc.text("No hay comentarios de admiración disponibles.", 20, y);
          y += 6;
        }
        y += 6;

        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setTextColor("#d9534f");
        doc.text("Áreas de Mejora:", 15, y);
        y += 6;

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.setTextColor("#000000");

        if (negativeComments.comments && negativeComments.comments.length > 0) {
          negativeComments.comments.forEach((comment, index) => {
            if (y > 260) {
              doc.addPage();
              y = 10;
            }
            doc.text(`${index + 1}. ${comment.commenter}: ${comment.comment}`, 20, y, { maxWidth: 170 });
            y += 10;
          });
        } else {
          doc.text("No hay áreas de mejora disponibles.", 20, y);
          y += 6;
        }
        y += 6;

        if (y > 280) doc.addPage();
      }

      const fecha = new Date().toLocaleDateString("es-MX");
      doc.setFontSize(10);
      doc.setTextColor("#555555");
      doc.text(`Generado el ${fecha}`, 105, 290, { align: "center" });

      doc.save(`Historico_Resultados_${personalData.nombre_personal}.pdf`);
    } catch (error) {
      console.error("Error generando PDF histórico:", error);
      Swal.fire({
        title: "Error",
        text: "No se pudo generar el PDF histórico. Intenta nuevamente.",
        icon: "error",
        confirmButtonText: "Aceptar"
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