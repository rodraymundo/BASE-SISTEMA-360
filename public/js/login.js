import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm'; // si quieres importar SweetAlert como módulo

document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const csrfToken = document.getElementById('csrf-token').value;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, _csrf: csrfToken }),
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            await Swal.fire({
                icon: 'success',
                title: '¡Inicio de sesión exitoso!',
                text: 'Bienvenido',
                timer: 1500,
                showConfirmButton: false
            });
            window.location.href = data.redirect;
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error de autenticación',
                text: data.message || 'Correo o contraseña incorrectos.'
            });
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error de conexión',
            text: 'No se pudo conectar con el servidor. Intenta de nuevo más tarde.'
        });
    }
});

async function fetchCsrfToken() {
    try {
        const response = await fetch('/csrf-token', {
            method: 'GET',
            credentials: 'include'
        });
        const data = await response.json();
        document.getElementById('csrf-token').value = data.csrfToken;
    } catch (error) {
        console.error('Error al obtener CSRF token:', error);
    }
}
fetchCsrfToken();

window.addEventListener('load', async () => {
    try {
        const res = await fetch('/auth-check', { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated) {
            window.location.href = '/Dashboard';
        }
    } catch (error) {
        console.error('Error verificando sesión:', error);
    }
});
