export function renderHeader(user) {
  const header = document.createElement('nav');
  header.className = 'navbar navbar-expand-lg';
  header.innerHTML = `
    <div class="container-fluid d-flex justify-content-between align-items-center">
      <a class="navbar-brand" href="/">
        <img src="/assets/img/logo_balmoral.png" alt="Logo Balmoral" style="height: 40px;">
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Alternar navegación">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav mb-2 mb-lg-0">
        </ul>
        <div class="dropdown ms-auto">
          <a class="dropdown-toggle d-flex align-items-center text-decoration-none text-dark" href="#" role="button" id="dropdownUser" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="fas fa-user-circle me-2" id="userIcon"></i>
          </a>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="dropdownUser">
            <li><a class="dropdown-item" href="/Mi-Perfil">Ver mi perfil</a></li>
            <li><a class="dropdown-item" href="/Mis-KPIs-Pendientes">Evaluar KPIs</a></li>
            <li><a class="dropdown-item" id="gestion-captacion-btn" href="/Gestion-Alumnos" style="display: none;">Gestión de alumnos</a></li>
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
            <!-- NUEVO: Formulario para cambiar contraseña -->
            <hr>
            <h5 class="text-center mb-3">Cambiar contraseña</h5>
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
              <button type="submit" class="btn btn-danger w-100">Actualizar contraseña</button>
            </form>

          </div>
          <div class="modal-footer bg-light rounded-bottom-4 justify-content-center">
            <button type="button" class="btn btn-outline-dark px-4" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

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

  const rolesContainer = header.querySelector('#modalUserRoles');
  if (user.userType === 'alumno') {
    rolesContainer.innerHTML = '<span class="text-muted">No aplica</span>';
  } else if (user.roles && user.roles.length > 0) {
    rolesContainer.innerHTML = user.roles.map(r =>
      `<span class="badge bg-dark text-white">${r.nombre_rol}</span>`
    ).join('');
  } else {
    rolesContainer.innerHTML = `<span class="badge bg-secondary">Ninguno</span>`;
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

  const changePasswordForm = header.querySelector('#changePasswordForm');
const passwordChangeError = header.querySelector('#passwordChangeError');

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
      const modal = bootstrap.Modal.getInstance(header.querySelector('#userInfoModal'));
      modal.hide();
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



  return header;
}
