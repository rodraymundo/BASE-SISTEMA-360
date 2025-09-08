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
  'ingles': 1, // Asumiendo DOCENTE
  'artes': 1, // Asumiendo DOCENTE
  'psicopedagogico': 1 // Asumiendo DOCENTE
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
  let roles = [];
  let personal = [];
  let personalCompleto = [];

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

  async function cargarRoles() {
    try {
      roles = await fetchWithRetry('/roles', { credentials: 'include' });
      document.querySelectorAll('.role-item').forEach(item => {
        const roleName = item.dataset.role;
        const role = roles.find(r => r.nombre_rol.toLowerCase() === roleName.toLowerCase());
        if (role) {
          item.dataset.idRol = role.id_rol;
        } else {
          item.classList.add('disabled');
          item.title = 'Rol no encontrado en la base de datos';
        }
      });
    } catch (error) {
      console.error('Error al cargar roles:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404')
          ? 'El servidor no tiene configurada la lista de roles (/roles).'
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

  async function cargarPersonalCompleto() {
    try {
      personalCompleto = await fetchWithRetry('/personal-resultados', { credentials: 'include' });
      mostrarPersonal(personalCompleto);
    } catch (error) {
      console.error('Error al cargar personal completo:', error);
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404')
          ? 'El servidor no tiene configurada la lista de personal (/personal-resultados).'
          : 'No se pudieron cargar los datos del personal. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) cargarPersonalCompleto();
      });
    }
  }

  async function cargarPersonalPorRol(id_rol) {
    try {
      personalContainer.innerHTML = '<div class="col-12 text-muted text-center">Cargando personal...</div>';
      personal = await fetchWithRetry(`/personal-por-rol-resultados/${id_rol}`, { credentials: 'include' });
      mostrarPersonal(personal);
    } catch (error) {
      console.error('Error al cargar personal por rol:', error);
      personalContainer.innerHTML = '<div class="col-12 text-muted text-center">Error al cargar personal.</div>';
      Swal.fire({
        title: 'Error',
        text: error.message.includes('404')
          ? 'El servidor no tiene configurada la lista de personal por rol (/personal-por-rol-resultados/:id_rol).'
          : 'No se pudieron cargar los datos del personal. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        showCancelButton: true,
        confirmButtonText: 'Reintentar',
        cancelButtonText: 'Cancelar'
      }).then(result => {
        if (result.isConfirmed) cargarPersonalPorRol(id_rol);
      });
    }
  }

  function mostrarPersonal(personalList) {
    const textoBusqueda = buscadorPersonal.value.trim().toLowerCase();
    const listaParaMostrar = textoBusqueda ? personalCompleto : personalList;
    const filtrados = listaParaMostrar.filter(p =>
      `${p.nombre_personal} ${p.apaterno_personal} ${p.amaterno_personal}`.toLowerCase().includes(textoBusqueda)
    );

    if (filtrados.length === 0) {
      personalContainer.innerHTML = '<div class="col-12 text-muted text-center">No se encontró personal.</div>';
      return;
    }

    personalContainer.innerHTML = filtrados.map(p => `
      <div class="col-12 col-sm-6 col-md-4 col-lg-3 mb-4">
        <div class="personal-card">
        <div class="card-content">
          <img src="./assets/img/${p.img_personal || '/assets/img/user.png'}" alt="Foto de ${p.nombre_personal}">
          <h5>${p.nombre_personal} ${p.apaterno_personal} ${p.amaterno_personal}</h5>
          <p>${p.roles_puesto || p.roles || p.nombre_puesto}</p>
          </div>
          <div class="card-buttons">
            <button class="btn btn-perfil" data-id="${p.id_personal}">Perfil</button>
            <button class="btn btn-resultados" data-id="${p.id_personal}">Resultados</button>
          </div>
        </div>
      </div>
    `).join('');

    // Eventos para botones
    personalContainer.querySelectorAll('.btn-perfil').forEach(button => {
      button.addEventListener('click', () => {
        const id_personal = button.getAttribute('data-id');
        console.log('Clic en botón Perfil, id_personal:', id_personal);
        mostrarFichaCompleta(id_personal); // Fixed: Call the profile modal function
      });
    });

    personalContainer.querySelectorAll('.btn-resultados').forEach(button => {
      button.addEventListener('click', () => {
        const id_personal = button.getAttribute('data-id');
        console.log('Clic en botón Resultados, id_personal:', id_personal);
        const resultadosModal = new bootstrap.Modal(document.getElementById('resultadosModal'));
        resultadosModal.show();

        // Set data-id on choice buttons
        const kpisButton = document.querySelector('#resultadosModal .btn-kpis');
        const evaluacionesButton = document.querySelector('#resultadosModal .btn-evaluaciones');
        kpisButton.setAttribute('data-id', id_personal);
        evaluacionesButton.setAttribute('data-id', id_personal);

        // Handle KPIs choice
        kpisButton.onclick = () => {
          resultadosModal.hide();
          mostrarKPIs(id_personal);
        };

        // Handle Evaluations choice
        evaluacionesButton.onclick = () => {
          resultadosModal.hide();
          mostrarEvaluaciones(id_personal);
        };
      });
    });
  }

  async function getEvaluationPeriod() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 1 && month <= 6 ? `ENERO - JUNIO ${year}` : `JULIO - DICIEMBRE ${year}`;
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

  async function mostrarFichaCompleta(id_personal) {
  try {
    const modalElement = document.getElementById('perfilModal');
    console.log('Perfil modal element:', modalElement);
    if (!modalElement) throw new Error('No se encontró el elemento #perfilModal');

    const data = await fetchWithRetry(`/personal-resultados/${id_personal}`, { credentials: 'include' });
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
        <img src="/assets/img/${img_personal || '/assets/img/user.png'}" alt="Foto de ${nombre_personal}" class="perfil-img mb-3">
        <h4>${nombre_personal} ${apaterno_personal} ${amaterno_personal}</h4>
        <p class="text-muted">${roles_puesto || roles || 'Sin roles asignados'}</p>
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

    // Agregar botón de Resultados al footer del modal
    const modalFooter = document.querySelector('#perfilModal .modal-footer');
    const existingDownloadButton = modalFooter.querySelector('.btn-resultados-pdf');
    if (existingDownloadButton) existingDownloadButton.remove(); // Evitar duplicados
    const downloadButton = document.createElement('button');
    downloadButton.className = 'btn btn-resultados-pdf';
    downloadButton.innerHTML = '<i class="fas fa-download"></i> Resultados';
    downloadButton.addEventListener('click', () => generarPDFResultados(id_personal, data));
    modalFooter.insertBefore(downloadButton, modalFooter.firstChild);

    const modal = new bootstrap.Modal(modalElement);
    console.log('Perfil modal inicializado:', modal);
    modal.show();
  } catch (error) {
    console.error('Error en mostrarFichaCompleta:', error);
    Swal.fire({
      title: 'Error',
      text: error.message.includes('404') ? 'Personal no encontrado.' : 'No se pudieron cargar los datos del personal. Asegúrese de que el servidor esté corriendo.',
      icon: 'error',
      confirmButtonText: 'Aceptar'
    });
  }
}

async function generarPDFResultados(id_personal, personalData) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const margin = 15;

    // ====== HEADER (encabezado institucional arriba del todo, suave) ======
    const logo = "/assets/img/logo_balmoral.png"; // ruta de tu logo
    doc.addImage(logo, "PNG", margin, 8, 25, 12); // Logo arriba izquierda

    // Nombre de la escuela (centrado, en gris medio para efecto "transparente")
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120, 120, 120); // gris suave
    doc.text("Preparatoria Balmoral Escocés", 105, 14, { align: "center" });

    // Slogan (más pequeño, en gris claro)
    doc.setFontSize(9);
    doc.setFont("times", "italic");
    doc.setTextColor(150, 150, 150); // aún más claro
    doc.text(
      '"Inspiro a creer que es posible lo que pareciera imposible"',
      105,
      20,
      { align: "center" }
    );

    // Quitamos la línea divisoria y dejamos solo espacio
    let y = 40;

    // ====== TÍTULO DEL REPORTE ======
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text("Resultados del Personal", 105, y, { align: "center" });
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

    // Línea divisoria de la sección de contenido
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, 195, y);
    y += 10;

    // ... 🔽 aquí sigue igual el resto de tu código


    // ====== DATOS DEL PERSONAL ======
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#000000");
    doc.text("Datos del Personal", margin, y);
    y += 8;

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#333333");
    doc.text(
      `Nombre: ${personalData.nombre_personal} ${personalData.apaterno_personal} ${personalData.amaterno_personal}`,
      margin,
      y
    );
    y += 6;
    doc.text(`Teléfono: ${personalData.telefono_personal || "No disponible"}`, margin, y);
    y += 6;
    doc.text(
      `Fecha de Nacimiento: ${
        personalData.fecha_nacimiento_personal
          ? new Date(personalData.fecha_nacimiento_personal).toLocaleDateString("es-MX")
          : "No disponible"
      }`,
      margin,
      y
    );
    y += 6;
    doc.text(
      `Roles: ${personalData.roles_puesto || personalData.roles || "Sin roles"}`,
      margin,
      y
    );
    y += 12;

    // ====== SECCIONES (Materias y Talleres) ======
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#d9534f");
    doc.text("Materias Impartidas:", margin, y);
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
        acc[key].grupos.push(materia.grupo || "N/A");
        return acc;
      }, {});
      Object.values(groupedMaterias).forEach(m => {
        doc.text(
          `- ${m.nombre_materia} (Grado ${m.grado_materia}, Grupos: ${m.grupos.sort().join(", ")})`,
          margin + 5,
          y
        );
        y += 6;
      });
    } else {
      doc.text("No imparte materias", margin + 5, y);
      y += 6;
    }
    y += 6;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#d9534f");
    doc.text("Talleres Asignados:", margin, y);
    y += 6;

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#000000");

    if (personalData.talleres && personalData.talleres.length > 0) {
      personalData.talleres.forEach(t => {
        doc.text(`- ${t.nombre_taller}`, margin + 5, y);
        y += 6;
      });
    } else {
      doc.text("No asignado a talleres", margin + 5, y);
      y += 6;
    }
    y += 12;

    // ====== EVALUACIONES ======
    const tipos = await fetchWithRetry(`/personal-evaluaciones-types/${id_personal}`, {
      credentials: "include"
    });
    if (tipos.length === 0) {
      doc.text("No hay evaluaciones calificadas disponibles.", margin, y);
      doc.save(`Resultados_${personalData.nombre_personal}.pdf`);
      return;
    }

    const labels = [];
    const dataScores = [];
    for (const tipo of tipos) {
      const idTipoPregunta = tipoToIdPregunta[tipo];
      const results = await fetchWithRetry(
        `/personal-evaluaciones-results/${id_personal}/${tipo}?id_tipo_pregunta=${idTipoPregunta}`,
        { credentials: "include" }
      );
      if (results.generalAverage !== "N/A" && !isNaN(parseFloat(results.generalAverage))) {
        labels.push(tipo.toUpperCase());
        dataScores.push(parseFloat(results.generalAverage));
      }
    }

    if (labels.length === 0) {
      doc.text("No hay resultados de evaluaciones calificadas disponibles.", margin, y);
      doc.save(`Resultados_${personalData.nombre_personal}.pdf`);
      return;
    }

    // ====== GRÁFICA DE BARRAS ======
    const canvas = document.getElementById("chart-canvas");
    const ctx = canvas.getContext("2d");
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
    const chartImage = canvas.toDataURL("assets/img/profesor.png");
    doc.addImage(chartImage, "PNG", margin, y, 180, 80);
    y += 90;

    chart.destroy();

    // ====== PIE DE PÁGINA ======
    const fecha = new Date().toLocaleDateString("es-MX");
    doc.setFontSize(10);
    doc.setTextColor("#555555");
    doc.text(`Generado el ${fecha}`, 105, 290, { align: "center" });

    // ====== GUARDAR ======
    doc.save(`Resultados_${personalData.nombre_personal}.pdf`);
  } catch (error) {
    console.error("Error generando PDF:", error);
    Swal.fire({
      title: "Error",
      text: "No se pudo generar el PDF. Intenta nuevamente.",
      icon: "error",
      confirmButtonText: "Aceptar"
    });
  }
}



  async function mostrarKPIs(id_personal) {
    try {
      const modalElement = document.getElementById('kpisModal');
      console.log('KPIs modal element:', modalElement);
      if (!modalElement) throw new Error('No se encontró el elemento #kpisModal');

      const personalData = await fetchWithRetry(`/personal-resultados/${id_personal}`, { credentials: 'include' });
      if (!personalData) throw new Error('No se encontraron datos del personal');
      const { nombre_personal = '', apaterno_personal = '', amaterno_personal = '', nombre_puesto = 'No disponible' } = personalData;
      const period = await getEvaluationPeriod();
      const data = await fetchWithRetry(`/personal-kpis/${id_personal}`, { credentials: 'include' });
      if (!data || !Array.isArray(data)) throw new Error('No se encontraron datos de KPIs o formato inválido');
      const modalBody = document.querySelector('#kpisModal .modal-body');
      if (!modalBody) throw new Error('No se encontró el elemento #kpisModal .modal-body');
      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = `
        <h4 class="kpi-title">TABLERO DE INDICADORES CLAVE DE RENDIMIENTO Y PERMANENCIA POR PUESTO</h4>
        <table class="kpi-header-table">
          <tr><th>PUESTO:</th><td>${nombre_puesto}</td></tr>
          <tr><th>Período de evaluación:</th><td>${period}</td></tr>
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

      // Agregar manejador para limpiar el backdrop al cerrar el modal
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
        text: error.message.includes('404') ? 'KPIs no encontrados.' : error.message || 'No se pudieron cargar los KPIs. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  async function mostrarEvaluaciones(id_personal) {
    try {
      const modalElement = document.getElementById('evaluacionesModal');
      console.log('Evaluaciones modal element:', modalElement);
      if (!modalElement) throw new Error('No se encontró el elemento #evaluacionesModal');

      const modalBody = document.querySelector('#evaluacionesModal .modal-body');
      console.log('Evaluaciones modal body:', modalBody);
      if (!modalBody) throw new Error('No se encontró el elemento #evaluacionesModal .modal-body');

      const tipos = await fetchWithRetry(`/personal-evaluaciones-types/${id_personal}`, { credentials: 'include' });
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

      // Limpieza de backdrop
      modalElement.addEventListener('hidden.bs.modal', () => {
        console.log('Evaluaciones modal cerrado, limpiando backdrop');
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());
        document.body.classList.remove('modal-open');
        document.body.style.paddingRight = '';
      }, { once: true });

      // Agregar eventos a los botones de tipos
      modalBody.querySelectorAll('.btn-evaluacion').forEach(button => {
        button.addEventListener('click', async () => {
          const tipo = button.textContent;
          console.log(`Clic en botón de evaluación: ${tipo}, id_personal: ${id_personal}`);
          modal.hide();
          await mostrarEvaluacionResults(id_personal, tipo);
        });
      });

      modal.show();
    } catch (error) {
      console.error('Error en mostrarEvaluaciones:', error);
      Swal.fire({
        title: 'Error',
        text: error.message || 'No se pudieron cargar las evaluaciones. Asegúrese de que el servidor esté corriendo.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

async function mostrarEvaluacionResults(id_personal, tipo) {
  try {
    const modalElement = document.getElementById('evaluacionResultsModal');
    console.log('EvaluacionResults modal element:', modalElement);
    if (!modalElement) throw new Error('No se encontró el elemento #evaluacionResultsModal');

    const modalBody = document.querySelector('#evaluacionResultsModal .modal-body');
    console.log('EvaluacionResults modal body:', modalBody);
    if (!modalBody) throw new Error('No se encontró el elemento #evaluacionResultsModal .modal-body');

    const idTipoPregunta = tipoToIdPregunta[tipo];
    if (!idTipoPregunta) throw new Error('Tipo de evaluación no soportado');

    const data = await fetchWithRetry(`/personal-evaluaciones-results/${id_personal}/${tipo}?id_tipo_pregunta=${idTipoPregunta}`, { credentials: 'include' });
    console.log('Datos de evaluación:', data);

      let html = `
        <div class="results-header">
          <h4>PREPA BALMORAL ESCOCÉS</h4>
          <h5>CONCENTRADO EVALUACIÓN DOCENTE</h5>
          <p>NOMBRE DEL DOCENTE: ${data.teacherName}</p>
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

      // Fila de total alumnos
      html += `<tr><td></td><td>Total de alumnos</td>`;
      data.subjects.forEach(subject => {
        html += `<td colspan="2">${subject.totalAlumnos}</td>`;
      });
      html += `<td></td></tr>`;

      // Criterios
      for (let i = 0; i < data.criteria.length; i++) {
        const crit = data.criteria[i];
        html += `<tr><td>${crit.no}</td><td>${crit.criterio}</td>`;
        data.subjects.forEach(subject => {
          const c = subject.criteria[i] || { pctSi: 0, pctNo: 0 };
          html += `<td>${c.pctSi}%</td><td>${c.pctNo}%</td>`;
        });
        html += `<td>${crit.promedio}%</td></tr>`;
      }

      // Promedio general
      html += `<tr><td></td><td>PROMEDIO GENERAL DE SATISFACCIÓN</td>`;
      data.subjects.forEach(subject => {
        html += `<td>${subject.avgSi}%</td><td>${subject.avgNo}%</td>`;
      });
      html += `<td>${data.generalAverage}%</td></tr>`;

      html += `</tbody></table>`;

      // Comentarios
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

      // Limpieza de backdrop
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
        text: error.message || 'No se pudieron cargar los resultados de la evaluación.',
        icon: 'error',
        confirmButtonText: 'Aceptar'
      });
    }
  }

  sidebar.addEventListener('click', async (e) => {
    const roleItem = e.target.closest('.role-item');
    if (roleItem && !roleItem.classList.contains('disabled')) {
      const idRol = roleItem.dataset.idRol;
      document.querySelectorAll('.role-item').forEach(item => item.classList.remove('active'));
      roleItem.classList.add('active');
      buscadorPersonal.value = '';
      await cargarPersonalPorRol(idRol);
    }
  });

  buscadorPersonal.addEventListener('input', () => {
    mostrarPersonal(personal);
  });

  await Promise.all([cargarRoles(), cargarPersonalCompleto()]);
});