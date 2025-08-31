import { renderHeader } from '../assets/js/header.js';

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
  const listaKpisList = document.getElementById('listaKpisList');
  listaKpisList.innerHTML = '<div class="text-muted text-center py-3">Cargando KPIs...</div>';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }


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
    console.error('Error verificando sesión:', error);
    Swal.fire({
      title: 'Error de Sesión',
      text: 'No se pudo verificar la sesión. Asegúrese de que el servidor esté corriendo.',
      icon: 'error',
      confirmButtonText: 'Ir al inicio'
    }).then(() => window.location.href = '/');
    return;
  }

  const kpiModal = new bootstrap.Modal(document.getElementById('kpiModal'));
  const kpiForm = document.getElementById('kpiForm');
  const modalTitle = document.getElementById('modalTitle');
  const addKpiBtn = document.getElementById('addKpiBtn');
  const buscadorKpi = document.getElementById('buscadorKpi');
  const idPuestoSelect = document.getElementById('id_puesto');
  const idCategoriaKpiSelect = document.getElementById('id_categoria_kpi');
  const idAreaEstrategicaSelect = document.getElementById('id_area_estrategica');
  const idIndicadorKpiSelect = document.getElementById('id_indicador_kpi');
  const idRolSelect = document.getElementById('id_rol');
  const tipoKpiSelect = document.getElementById('tipo_kpi');
  const metaKpiInput = document.getElementById('meta_kpi');

  let todosKpis = [];
  let puestos = [];
  let categorias = [];
  let areasEstrategicas = [];
  let indicadores = [];
  let roles = [];

  async function cargarKpis() {
    try {
      listaKpisList.innerHTML = '<div class="text-muted text-center py-3">Cargando KPIs...</div>';
      const data = await fetchWithRetry('/kpis-gestion', { credentials: 'include' });
      todosKpis = data.kpis;
      mostrarKpis(todosKpis);
    } catch (error) {
      console.error('Error al cargar KPIs:', error);
      listaKpisList.innerHTML = '<div class="text-muted text-center py-3">No se pudo cargar los KPIs. Verifique que el servidor esté corriendo.</div>';
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de KPIs (/kpis). Contacte al administrador.'
          : 'No se pudo conectar con el servidor. Asegúrese de que esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarKpis();
        else window.location.href = '/';
      });
    }
  }

function mostrarKpis(kpis) {
  const textoBusqueda = buscadorKpi.value.trim().toLowerCase();
  const filtrados = kpis.filter(k =>
    `${k.nombre_kpi || ''} ${k.nombre_categoria_kpi || ''} ${k.nombre_area_estrategica || ''} ${k.nombre_indicador_kpi || ''} ${k.nombre_rol || ''} ${k.nombre_puesto || ''}`
      .toLowerCase()
      .includes(textoBusqueda)
  );

  if (filtrados.length === 0) {
    listaKpisList.innerHTML = '<div class="text-muted text-center py-3">No se encontraron KPIs.</div>';
    return;
  }

  listaKpisList.innerHTML = filtrados.map(k => {
    const nombre = escapeHtml(k.nombre_kpi || 'Sin nombre');
    const meta = escapeHtml(String(k.meta_kpi ?? ''));
    const tipo = escapeHtml(k.tipo_kpi || '');
    const categoria = escapeHtml(k.nombre_categoria_kpi || 'Sin categoría');
    const area = escapeHtml(k.nombre_area_estrategica ? `${k.nombre_area_estrategica} (${k.siglas_area_estrategica || ''})` : 'Sin área');
    const indicador = escapeHtml(k.nombre_indicador_kpi ? `${k.nombre_indicador_kpi} (${k.sigla_indicador_kpi || ''})` : 'Sin indicador');
    const rol = escapeHtml(k.nombre_rol || 'Ninguno');
    const puesto = escapeHtml(k.nombre_puesto || 'Sin puesto');

    return `
      <div class="list-group-item list-group-item-action shadow-sm p-3 d-flex justify-content-between align-items-start">
        <div class="flex-grow-1 me-3" style="min-width:0;">
          <div class="d-flex justify-content-between align-items-start">
            <h6 class="kpi-title mb-1">${nombre}</h6>
            <small class="kpi-meta ms-2">${tipo}${meta ? ' · Meta: ' + meta : ''}</small>
          </div>
          <div class="text-muted small mt-1">
            <div><strong>Categoría:</strong> ${categoria}</div>
            <div><strong>Área:</strong> ${area}</div>
            <div><strong>Indicador:</strong> ${indicador}</div>
            <div><strong>Evaluador:</strong> ${rol} · <strong>Puesto:</strong> ${puesto}</div>
          </div>
        </div>

        <div class="ms-3 d-flex align-items-center" style="flex: 0 0 auto;">
          <button class="btn btn-outline-danger btn-sm editBtn" data-id="${k.id_kpi}" title="Editar">
            <i class="fas fa-pencil-alt"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}


  async function cargarPuestos() {
    try {
      puestos = await fetchWithRetry('/puestos', { credentials: 'include' });
      idPuestoSelect.innerHTML = '<option value="">Seleccione un puesto</option>' +
        puestos.map(p => `<option value="${p.id_puesto}">${p.nombre_puesto}</option>`).join('');
    } catch (error) {
      console.error('Error al cargar puestos:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de puestos (/puestos). Contacte al administrador.'
          : 'No se pudieron cargar los puestos. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarPuestos();
        else window.location.href = '/';
      });
    }
  }

  async function cargarCategoriasPorPuesto(id_puesto) {
    try {
      categorias = await fetchWithRetry(`/categorias-por-puesto/${id_puesto}`, { credentials: 'include' });
      idCategoriaKpiSelect.innerHTML = '<option value="">Seleccione una categoría</option>' +
        categorias.map(c => `<option value="${c.id_categoria_kpi}">${c.nombre_categoria_kpi}</option>`).join('');
    } catch (error) {
      console.error('Error al cargar categorías:', error);
      idCategoriaKpiSelect.innerHTML = '<option value="">No hay categorías disponibles</option>';
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de categorías por puesto (/categorias-por-puesto/:id_puesto). Contacte al administrador.'
          : 'No se pudieron cargar las categorías. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) cargarCategoriasPorPuesto(id_puesto);
      });
    }
  }

  async function cargarAreasEstrategicas() {
    try {
      areasEstrategicas = await fetchWithRetry('/areas-estrategicas', { credentials: 'include' });
      idAreaEstrategicaSelect.innerHTML = '<option value="">Seleccione un área estratégica</option>' +
        areasEstrategicas.map(a => `<option value="${a.id_area_estrategica}">${a.nombre_area_estrategica} (${a.siglas_area_estrategica})</option>`).join('');
    } catch (error) {
      console.error('Error al cargar áreas estratégicas:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de áreas estratégicas (/areas-estrategicas). Contacte al administrador.'
          : 'No se pudieron cargar las áreas estratégicas. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarAreasEstrategicas();
        else window.location.href = '/';
      });
    }
  }

  async function cargarIndicadores() {
    try {
      indicadores = await fetchWithRetry('/indicadores-kpi', { credentials: 'include' });
      idIndicadorKpiSelect.innerHTML = '<option value="">Seleccione un indicador</option>' +
        indicadores.map(i => `<option value="${i.id_indicador_kpi}">${i.nombre_indicador_kpi} (${i.sigla_indicador_kpi})</option>`).join('');
    } catch (error) {
      console.error('Error al cargar indicadores:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de indicadores (/indicadores-kpi). Contacte al administrador.'
          : 'No se pudieron cargar los indicadores. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarIndicadores();
        else window.location.href = '/';
      });
    }
  }

  async function cargarRoles() {
    try {
      roles = await fetchWithRetry('/roles', { credentials: 'include' });
      idRolSelect.innerHTML = '<option value="">Ninguno</option>' +
        roles.map(r => `<option value="${r.id_rol}">${r.nombre_rol}</option>`).join('');
    } catch (error) {
      console.error('Error al cargar roles:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? 'El servidor no tiene configurada la lista de roles (/roles). Contacte al administrador.'
          : 'No se pudieron cargar los roles. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Ir al inicio'
      }).then(result => {
        if (result.isConfirmed) cargarRoles();
        else window.location.href = '/';
      });
    }
  }

  async function abrirModalKpi(kpi = null) {
    if (kpi) {
      modalTitle.textContent = 'Editar KPI';
      document.getElementById('id_kpi').value = kpi.id_kpi;
      document.getElementById('nombre_kpi').value = kpi.nombre_kpi;
      document.getElementById('tipo_kpi').value = kpi.tipo_kpi;
      document.getElementById('meta_kpi').value = kpi.meta_kpi;
      document.getElementById('id_puesto').value = kpi.id_puesto || '';
      document.getElementById('id_area_estrategica').value = kpi.id_area_estrategica || '';
      document.getElementById('id_indicador_kpi').value = kpi.id_indicador_kpi || '';
      document.getElementById('id_rol').value = kpi.id_rol || '';
      updateMetaKpiConstraints(kpi.tipo_kpi);
      // Cargar categorías basadas en el id_puesto del KPI y seleccionar id_categoria_kpi
      if (kpi.id_puesto) {
        await cargarCategoriasPorPuesto(kpi.id_puesto);
        document.getElementById('id_categoria_kpi').value = kpi.id_categoria_kpi || '';
      } else {
        idCategoriaKpiSelect.innerHTML = '<option value="">Seleccione un puesto primero</option>';
      }
    } else {
      modalTitle.textContent = 'Agregar KPI';
      kpiForm.reset();
      document.getElementById('id_kpi').value = '';
      idCategoriaKpiSelect.innerHTML = '<option value="">Seleccione un puesto primero</option>';
      updateMetaKpiConstraints('');
    }
    kpiModal.show();
  }

  function updateMetaKpiConstraints(tipo) {
    if (tipo === 'Porcentaje') {
      metaKpiInput.max = 100;
      metaKpiInput.placeholder = '0-100';
    } else if (tipo === 'Entero') {
      metaKpiInput.removeAttribute('max');
      metaKpiInput.placeholder = 'Número entero positivo';
    } else {
      metaKpiInput.removeAttribute('max');
      metaKpiInput.placeholder = 'Seleccione un tipo primero';
    }
    metaKpiInput.min = 0;
    metaKpiInput.step = 1;
  }

  idPuestoSelect.addEventListener('change', async () => {
    const id_puesto = idPuestoSelect.value;
    if (id_puesto) {
      await cargarCategoriasPorPuesto(id_puesto);
    } else {
      idCategoriaKpiSelect.innerHTML = '<option value="">Seleccione un puesto primero</option>';
    }
  });

  tipoKpiSelect.addEventListener('change', () => {
    updateMetaKpiConstraints(tipoKpiSelect.value);
  });

  kpiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id_kpi = document.getElementById('id_kpi').value;
    const nombre_kpi = document.getElementById('nombre_kpi').value;
    const meta_kpi = document.getElementById('meta_kpi').value;
    const tipo_kpi = document.getElementById('tipo_kpi').value;
    const id_puesto = document.getElementById('id_puesto').value;
    const id_categoria_kpi = document.getElementById('id_categoria_kpi').value;
    const id_area_estrategica = document.getElementById('id_area_estrategica').value;
    const id_indicador_kpi = document.getElementById('id_indicador_kpi').value;
    const id_rol = document.getElementById('id_rol').value;

    if (tipo_kpi === 'Porcentaje' && (meta_kpi < 0 || meta_kpi > 100 || !Number.isInteger(Number(meta_kpi)))) {
      Swal.fire('Error', 'La meta debe ser un entero entre 0 y 100 para tipo Porcentaje', 'error');
      return;
    }
    if (tipo_kpi === 'Entero' && (!Number.isInteger(Number(meta_kpi)) || meta_kpi < 0)) {
      Swal.fire('Error', 'La meta debe ser un entero positivo para tipo Entero', 'error');
      return;
    }

    const data = {
      nombre_kpi,
      meta_kpi,
      tipo_kpi,
      id_categoria_kpi,
      id_area_estrategica,
      id_indicador_kpi,
      id_rol: id_rol || null,
      id_puesto
    };

    try {
      const csrfRes = await fetch('/csrf-token', { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();
      const url = id_kpi ? `/kpis/${id_kpi}` : '/kpis';
      const method = id_kpi ? 'PUT' : 'POST';
      console.log('Enviando datos a', url, ':', JSON.stringify(data));
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      const result = await response.json();
      console.log('Respuesta de', url, ':', result);
      if (!response.ok) {
        throw new Error(result.message || `Error en la solicitud: ${response.status}`);
      }

      if (result.success) {
        kpiModal.hide();
        await cargarKpis();
        Swal.fire('Éxito', result.message, 'success');
      } else {
        Swal.fire('Error', result.message || 'Error al guardar KPI.', 'error');
      }
    } catch (error) {
      console.error('Error al guardar KPI:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404') 
          ? `El servidor no tiene configurada la funcionalidad de ${id_kpi ? 'edición' : 'guardado'} (/kpis${id_kpi ? '/:id' : ''}). Contacte al administrador.`
          : `Error al ${id_kpi ? 'actualizar' : 'guardar'} KPI. Asegúrese de que el servidor esté corriendo.`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) kpiForm.dispatchEvent(new Event('submit'));
      });
    }
  });

  listaKpisList.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.editBtn');
    if (editBtn) {
      const id = editBtn.dataset.id;
      try {
        const data = await fetchWithRetry(`/kpis/${id}`, { credentials: 'include' });
        abrirModalKpi(data.kpi);
      } catch (error) {
        console.error('Error al cargar datos de KPI:', error);
        Swal.fire({
          title: 'Error',
          text: error.message.includes('404')
            ? 'El servidor no tiene configurada la funcionalidad de edición (/kpis/:id). Contacte al administrador.'
            : 'No se pudieron cargar los datos del KPI. Asegúrese de que el servidor esté corriendo.',
          icon: 'error',
          showCancelButton: true,
          confirmButtonText: 'Reintentar',
          cancelButtonText: 'Cancelar'
        });
      }
    }
  });


  buscadorKpi.addEventListener('input', () => {
    mostrarKpis(todosKpis);
  });

  addKpiBtn.addEventListener('click', () => abrirModalKpi());

  await Promise.all([cargarKpis(), cargarPuestos(), cargarAreasEstrategicas(), cargarIndicadores(), cargarRoles()]);
});