import { renderHeader } from '../assets/js/header.js';

async function obtenerCsrfToken() {
    const res = await fetch('/csrf-token', { credentials: 'include' });
    const data = await res.json();
    return data.csrfToken;
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/auth-check', { credentials: 'include' });
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/';
            return;
        }

        document.getElementById('header').appendChild(renderHeader(data.user));
    } catch (error) {
        console.error('Error verificando sesión:', error);
        return;
    }

    const roleSelect = document.getElementById('roleSelect');
    const personSelect = document.getElementById('personSelect');
    const permissionsSection = document.getElementById('permissionsSection');
    const selectedPersonName = document.getElementById('selectedPersonName');
    const savePermissionsBtn = document.getElementById('savePermissionsBtn');

    let allPersonnel = [];

    async function cargarRoles() {
        try {
            const res = await fetch('/roles-permisos');
            const data = await res.json();
            if (!res.ok) {
                throw new Error(`Error HTTP: ${res.status} - ${res.statusText}`);
            }
            if (!data.success || !Array.isArray(data.roles)) {
                throw new Error('Respuesta no contiene un array de roles');
            }
            roleSelect.innerHTML =
                '<option value="">-- Selecciona un rol --</option>' +
                data.roles.map(r => `<option value="${r.id_rol}">${r.nombre_rol}</option>`).join('');
        } catch (error) {
            console.error('Error cargando roles:', error);
            roleSelect.innerHTML = '<option value="">-- Error al cargar roles --</option>';
            Swal.fire('Error', 'No se pudieron cargar los roles.', 'error');
        }
    }

    async function cargarPersonal(selectedRoleId) {
        personSelect.innerHTML = '<option value="">-- Selecciona un personal --</option>';
        personSelect.disabled = !selectedRoleId;
        permissionsSection.classList.add('d-none');

        if (selectedRoleId) {
            try {
                const res = await fetch(`/personal-by-role-permisos/${selectedRoleId}`);
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(`Error HTTP: ${res.status} - ${res.statusText}`);
                }
                if (!data.success || !Array.isArray(data.personal)) {
                    throw new Error('Respuesta no contiene un array de personal');
                }
                allPersonnel = data.personal;
                personSelect.innerHTML = allPersonnel.length
                    ? allPersonnel.map(p => `<option value="${p.id_usuario}">${p.nombre_personal} ${p.apaterno_personal} ${p.amaterno_personal || ''}</option>`).join('')
                    : '<option value="">No hay personal</option>';
                personSelect.disabled = allPersonnel.length === 0;
                if (personSelect.value) mostrarPermisos(personSelect.value);
            } catch (error) {
                console.error('Error cargando personal:', error);
                personSelect.innerHTML = '<option value="">-- Error al cargar personal --</option>';
                Swal.fire('Error', 'No se pudo cargar el personal.', 'error');
            }
        }
    }

    function mostrarPermisos(id_usuario) {
        if (id_usuario && personSelect.options[personSelect.selectedIndex]) {
            selectedPersonName.textContent = personSelect.options[personSelect.selectedIndex].text;
            fetch(`/permissions-permisos/${id_usuario}`)
                .then(response => {
                    if (!response.ok) throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
                    return response.json();
                })
                .then(data => {
                    if (!data.success) throw new Error(data.message || 'Error en los permisos');
                    const permissions = data.data;
                    document.getElementById('permMaterias').checked = permissions.permiso_materias === 1;
                    document.getElementById('permKPIs').checked = permissions.permiso_kpis === 1;
                    document.getElementById('permGrupos').checked = permissions.permiso_grupos === 1;
                    document.getElementById('permPersonal').checked = permissions.permiso_personal === 1;
                    document.getElementById('permTalleres').checked = permissions.permiso_talleres === 1;
                    document.getElementById('permAlumnos').checked = permissions.permiso_alumnos === 1;
                    permissionsSection.classList.remove('d-none');
                })
                .catch(error => {
                    console.error('Error cargando permisos:', error);
                    permissionsSection.classList.add('d-none');
                    Swal.fire('Error', 'No se pudieron cargar los permisos.', 'error');
                });
        } else {
            permissionsSection.classList.add('d-none');
        }
    }

    async function guardarPermisos() {
        const id_usuario = personSelect.value;
        if (!id_usuario) {
            Swal.fire('Advertencia', 'Selecciona un personal para guardar permisos.', 'warning');
            return;
        }

        const permissions = {
            id_usuario: parseInt(id_usuario),
            permiso_materias: document.getElementById('permMaterias').checked ? 1 : 0,
            permiso_kpis: document.getElementById('permKPIs').checked ? 1 : 0,
            permiso_grupos: document.getElementById('permGrupos').checked ? 1 : 0,
            permiso_personal: document.getElementById('permPersonal').checked ? 1 : 0,
            permiso_talleres: document.getElementById('permTalleres').checked ? 1 : 0,
            permiso_alumnos: document.getElementById('permAlumnos').checked ? 1 : 0
        };

        const csrfToken = await obtenerCsrfToken();

        try {
            const res = await fetch('/permissions-permisos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'include',
                body: JSON.stringify(permissions)
            });
            if (!res.ok) {
                throw new Error(`Error HTTP: ${res.status} - ${res.statusText}`);
            }
            const data = await res.json();
            Swal.fire('Éxito', `Permisos guardados para ${selectedPersonName.textContent}.`, 'success');
        } catch (error) {
            console.error('Error guardando permisos:', error);
            Swal.fire('Error', 'Error al guardar los permisos.', 'error');
        }
    }

    roleSelect.addEventListener('change', async () => {
        const selectedRoleId = roleSelect.value;
        await cargarPersonal(selectedRoleId);
        window.history.pushState({}, '', `?role=${encodeURIComponent(selectedRoleId)}`);
    });

    personSelect.addEventListener('change', () => {
        const id_usuario = personSelect.value;
        mostrarPermisos(id_usuario);
        const selectedRoleId = roleSelect.value;
        window.history.pushState({}, '', `?role=${encodeURIComponent(selectedRoleId)}&id_usuario=${id_usuario}`);
    });

    savePermissionsBtn.addEventListener('click', guardarPermisos);

    await cargarRoles();
    const urlParams = new URLSearchParams(window.location.search);
    const role = urlParams.get('role');
    if (role) {
        roleSelect.value = role;
        await cargarPersonal(role);
        const id_usuario = urlParams.get('id_usuario');
        if (id_usuario) {
            personSelect.value = id_usuario;
            mostrarPermisos(id_usuario);
        }
    }
});