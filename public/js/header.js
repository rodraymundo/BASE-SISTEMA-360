export function renderHeader(user) {
  let  Dashboard = '';
  if (user.userType == 'alumno') {
    Dashboard = '/DashboardAlumno';
  } else {
    if (user.id_puesto==35) {
      Dashboard = '/Dashboard';
    }else{
      Dashboard = '/DashboardPersonal';
    }
  }

  const header = document.createElement('nav');
  header.className = 'navbar navbar-expand-lg';
  header.innerHTML = `
    <div class="container-fluid d-flex justify-content-between align-items-center">
      <a class="navbar-brand" href="${Dashboard}">
        <img src="/assets/img/logo_balmoral.png" alt="Logo Balmoral" style="height: 45px;">
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Alternar navegación">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse d-flex justify-content-center" id="navbarNav">
        <ul class="navbar-nav mb-2 mb-lg-0 justify-content-center">
          <li><a class="nav-link" id="nav-materias" href="/Gestion-Materias-Permisos" style="display: none;">Materias</a></li>
          <li><a class="nav-link" id="nav-kpis" href="/Gestion-Kpis-Permisos" style="display: none;">KPIs</a></li>
          <li><a class="nav-link" id="nav-grupos" href="/Gestion-Grupos" style="display: none;">Grupos</a></li>
          <li><a class="nav-link" id="nav-personal" href="/GestionPersonal-Permisos" style="display: none;">Personal</a></li>
          <li><a class="nav-link" id="nav-talleres" href="/Gestion-Talleres-Permisos" style="display: none;">Talleres</a></li>
          <li><a class="nav-link" id="nav-alumnos" href="/Gestion-Alumnos" style="display: none;">Alumnos</a></li>
        </ul>
        <div class="dropdown ms-auto">
          <a class="dropdown-toggle d-flex align-items-center text-decoration-none text-dark" href="#" role="button" id="dropdownUser" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="fas fa-user-circle me-2" id="userIcon"></i>
          </a>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="dropdownUser">
            <li><a class="dropdown-item" href="/Mi-Perfil">Ver mi perfil</a></li>
            <li><a class="dropdown-item" href="/Mis-KPIs-Pendientes">Evaluar KPIs</a></li>
            <li><a class="dropdown-item" id="mis-evaluaciones-btn" href="/Mis-Evaluaciones-Dir-General" style="display: none;">Mis Evaluaciones</a></li>
            <!--
            <li><a class="dropdown-item" id="gestion-captacion-btn" href="/Gestion-Alumnos" style="display: none;">Gestión de alumnos</a></li>
            <li><a class="dropdown-item" id="gestion-grupos-btn" href="/Gestion-Grupos" style="display: none;">Gestión de grupos</a></li>
            -->
            <li><a class="dropdown-item" id="logout-btn" href="#">Cerrar Sesión</a></li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Modal de info usuario -->
    <div class="modal fade" id="userInfoModal" tabindex="-1" aria-labelledby="userInfoModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 shadow-sm border-0">
          <div class="modal-header bg-danger text-white rounded-top-4">
            <h5 class="modal-title w-100 text-center" id="userInfoModalLabel">
              Información de Usuario
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body bg-light text-center px-4">

            <div class="mb-4">
              <i class="fas fa-user-circle fa-6x text-secondary mb-3"></i>
            </div>

            <div class="mb-3 border-bottom pb-2">
              <h6 class="text-muted mb-1">Nombre</h6>
              <p id="modalUserName" class="fw-semibold text-dark">N/A</p>
            </div>
            <div class="mb-3 border-bottom pb-2">
              <h6 class="text-muted mb-1">Email</h6>
              <p id="modalUserEmail" class="fw-semibold text-dark">N/A</p>
            </div>
            <div class="mb-3">
              <h6 class="text-muted mb-1">Roles</h6>
              <div id="modalUserRoles" class="d-flex justify-content-center flex-wrap gap-1"></div>
            </div>
            <div class="text-center">
              <button type="button" class="btn btn-danger btn-sm mx-auto" style="min-width: 150px;" id="openChangePasswordModalBtn">
                <i class="fas fa-key me-2"></i> Cambiar contraseña
              </button>
            </div>
          </div>
          <hr style="border-color: #dee2e6; margin: 0;">

          <div class="modal-footer bg-light rounded-bottom-4 justify-content-center">
            <button type="button" class="btn btn-outline-dark px-4" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Agregar modal de cambio de contraseña al body
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="changePasswordModal" tabindex="-1" aria-labelledby="changePasswordModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 shadow">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title w-100 text-center" id="changePasswordModalLabel">Cambiar contraseña</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body bg-light">
            <form id="changePasswordForm">
              <div class="mb-3">
                <label for="currentPassword" class="form-label">Contraseña actual</label>
                <input type="password" class="form-control" id="currentPassword" name="currentPassword" required>
              </div>
              <div class="mb-3">
                <label for="newPassword" class="form-label">Nueva contraseña</label>
                <input type="password" class="form-control" id="newPassword" name="newPassword" required>
              </div>
              <div class="mb-3">
                <label for="confirmNewPassword" class="form-label">Confirmar nueva contraseña</label>
                <input type="password" class="form-control" id="confirmNewPassword" name="confirmNewPassword" required>
              </div>
              <div id="passwordChangeError" class="text-danger mb-2" style="display:none;"></div>
              <div class="d-grid gap-2">
                <button type="submit" class="btn btn-danger">Actualizar contraseña</button>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `);


  // Logout con CSRF
  header.querySelector('#logout-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const csrfResponse = await fetch('/csrf-token', { method: 'GET', credentials: 'include' });
      const csrfData = await csrfResponse.json();
      const response = await fetch('/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfData.csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (data.success) {
        await Swal.fire({
          icon: 'success',
          title: 'Sesión cerrada',
          text: 'Has cerrado sesión exitosamente.',
          timer: 2000,
          showConfirmButton: false
        });
        window.location.href = data.redirect;
      } else {
        Swal.fire({ icon: 'error', title: 'Error', text: data.message || 'Error al cerrar sesión.' });
      }
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: 'Error al conectar con el servidor.' });
    }
  });

  // Rellenar info modal
  header.querySelector('#modalUserName').textContent = user.nombre_completo || 'N/A';
  header.querySelector('#modalUserEmail').textContent = user.email || 'N/A';

  const rolesSection = header.querySelector('#modalUserRoles').closest('.mb-3'); 
  if (user.userType === 'alumno') {
    rolesSection.style.display = 'none';
  } else {
    const rolesContainer = header.querySelector('#modalUserRoles');
    if (user.roles && user.roles.length > 0) {
      rolesContainer.innerHTML = user.roles.map(r =>
        `<span class="badge bg-dark text-white">${r.nombre_rol}</span>`
      ).join('');
    } else {
      rolesContainer.innerHTML = `<span class="badge bg-secondary">Ninguno</span>`;
    }
  }

  // Mostrar modal al dar clic en "Ver mi perfil"
  const verPerfilLink = header.querySelector('a.dropdown-item[href="/Mi-Perfil"]');
  // Ocultar botón de Evaluar KPIs si es alumno
    const evaluarKPIs = header.querySelector('a[href="/Mis-KPIs-Pendientes"]');

  if (evaluarKPIs) {
    if (user.userType === 'alumno') {
      evaluarKPIs.style.display = 'none';
    } else {
      // Para personal: verificar si tiene evaluaciones pendientes
      (async () => {
        try {
          const response = await fetch('/tiene-evaluaciones-pendientes', { credentials: 'include' });
          const data = await response.json();
          if (!data.success || !data.tieneEvaluaciones) {
            evaluarKPIs.style.display = 'none';
          }
        } catch (err) {
          console.error('Error al verificar KPIs pendientes:', err);
          evaluarKPIs.style.display = 'none'; // Por precaución, ocultar si algo falla
        }
      })();
    }
  }


  // Mostrar botón de Gestión de alumnos si tiene rol de Captación
  const gestionCaptacionBtn = header.querySelector('#gestion-captacion-btn');
  if (gestionCaptacionBtn && user.userType === 'personal' && Array.isArray(user.roles)) {
    const tieneRolCaptacionOSubdirector = user.roles.some(r => {
      const rol = r.nombre_rol.toLowerCase();
      return rol.includes('subdirector');
    });
    if (tieneRolCaptacionOSubdirector) {
      gestionCaptacionBtn.style.display = 'block';
    }
  }

  if (verPerfilLink) {
    verPerfilLink.addEventListener('click', (e) => {
      e.preventDefault();
      new bootstrap.Modal(header.querySelector('#userInfoModal')).show();
    });
  }

    //NUEVOOOO
  const gestionGruposBtn = header.querySelector('#gestion-grupos-btn');
  if (gestionGruposBtn && user.userType === 'personal' && Array.isArray(user.roles)) {
    const tieneRolCaptacionOSubdirector = user.roles.some(r => {
      const rol = r.nombre_rol.toLowerCase();
      return rol.includes('subdirector');
    });
    if (tieneRolCaptacionOSubdirector) {
      gestionGruposBtn.style.display = 'block';
    }
  }

  const openChangePasswordModalBtn = header.querySelector('#openChangePasswordModalBtn');
  if (openChangePasswordModalBtn) {
    openChangePasswordModalBtn.addEventListener('click', () => {
      const perfilModal = bootstrap.Modal.getInstance(header.querySelector('#userInfoModal'));
      if (perfilModal) perfilModal.hide();

      const changeModal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
      changeModal.show();
    });
  }


  const misEvaluacionesBtn = header.querySelector('#mis-evaluaciones-btn');
  if (misEvaluacionesBtn && user.userType === 'personal' && Array.isArray(user.roles)) {
    const esDirectorGeneral = user.roles.some(r => {
      const rol = r.nombre_rol.toLowerCase();
      return rol === 'director general';
    });
    if (esDirectorGeneral) {
      misEvaluacionesBtn.style.display = 'block';
    }
  }

  const changePasswordForm = document.querySelector('#changePasswordForm');
  const passwordChangeError = document.querySelector('#passwordChangeError');

  // Al cerrar el modal de cambio de contraseña, limpiar formulario y reabrir modal de perfil
  document.getElementById('changePasswordModal').addEventListener('hidden.bs.modal', () => {
    changePasswordForm.reset();
    passwordChangeError.style.display = 'none';

    // Mostrar nuevamente el modal de perfil
    const perfilModal = new bootstrap.Modal(header.querySelector('#userInfoModal'));
    setTimeout(() => perfilModal.show(), 300);
  });

  changePasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  passwordChangeError.style.display = 'none';
  
  
  const currentPassword = changePasswordForm.currentPassword.value.trim();
  const newPassword = changePasswordForm.newPassword.value.trim();
  const confirmNewPassword = changePasswordForm.confirmNewPassword.value.trim();

  if (newPassword !== confirmNewPassword) {
    passwordChangeError.textContent = 'Las nuevas contraseñas no coinciden.';
    passwordChangeError.style.display = 'block';
    return;
  }

  try {
    // Obtener token CSRF
    const csrfResponse = await fetch('/csrf-token', { credentials: 'include' });
    const csrfData = await csrfResponse.json();

    const response = await fetch('/cambiar-contrasena-perfil', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': csrfData.csrfToken
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await response.json();

    if (data.success) {
      Swal.fire({
        icon: 'success',
        title: 'Contraseña actualizada',
        text: data.message,
        timer: 2000,
        showConfirmButton: false
      });
      changePasswordForm.reset();
      // Opcional: cerrar modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('changePasswordModal'));
      modal.hide();

      // Reabrir modal de información de usuario
      const perfilModal = new bootstrap.Modal(header.querySelector('#userInfoModal'));
      setTimeout(() => perfilModal.show(), 300); // Espera 300ms para evitar conflicto visual


    } else {
      passwordChangeError.textContent = data.message || 'Error al actualizar contraseña.';
      passwordChangeError.style.display = 'block';
    }
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    passwordChangeError.textContent = 'Error al conectar con el servidor.';
    passwordChangeError.style.display = 'block';
  }

});

(async () => {
  try {
    const response = await fetch('/permisos-usuario', { credentials: 'include' });
    const data = await response.json();

    if (data.success && data.permisos) {
      const p = data.permisos;

      if (p.permiso_materias) header.querySelector('#nav-materias')?.style.removeProperty('display');
      if (p.permiso_kpis) header.querySelector('#nav-kpis')?.style.removeProperty('display');
      if (p.permiso_grupos) header.querySelector('#nav-grupos')?.style.removeProperty('display');
      if (p.permiso_personal) header.querySelector('#nav-personal')?.style.removeProperty('display');
      if (p.permiso_talleres) header.querySelector('#nav-talleres')?.style.removeProperty('display');
      if (p.permiso_alumnos) header.querySelector('#nav-alumnos')?.style.removeProperty('display');
    }
  } catch (err) {
    console.error('Error al cargar permisos:', err);
  }
})();
  return header;
}
