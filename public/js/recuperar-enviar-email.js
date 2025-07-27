const form = document.getElementById('requestResetForm');
const mensaje = document.getElementById('mensaje');

async function fetchCsrfToken() {
  try {
    const res = await fetch('/csrf-token', {
      method: 'GET',
      credentials: 'include'
    });
    const data = await res.json();
    document.getElementById('csrf-token').value = data.csrfToken;
  } catch (error) {
    console.error('Error al obtener CSRF token:', error);
  }
}

fetchCsrfToken();

form.addEventListener('submit', async e => {
  e.preventDefault();
  mensaje.textContent = '';

  const email = document.getElementById('email').value;
  const csrfToken = document.getElementById('csrf-token').value;

  try {
    const res = await fetch('/solicitar-recuperacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, _csrf: csrfToken })
    });

    const data = await res.json();
    mensaje.textContent = data.message;

    if (data.success) {
      mensaje.className = 'text-success mt-2 text-center';
      form.reset();
      fetchCsrfToken();
    } else {
      mensaje.className = 'text-danger mt-2 text-center';
    }
  } catch (error) {
    mensaje.textContent = 'Error al conectar con el servidor.';
    mensaje.className = 'text-danger mt-2 text-center';
  }
});
