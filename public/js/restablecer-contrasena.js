// Extraer token de recuperación de URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
document.getElementById('token').value = token;

// Obtener token CSRF del backend
fetch('/csrf-token', { credentials: 'include' })
  .then(res => res.json())
  .then(data => {
    document.getElementById('csrfToken').value = data.csrfToken;
  });

// Manejar envío del formulario
document.getElementById('reset-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const nueva = document.getElementById('nueva_contraseña').value;
  const confirmar = document.getElementById('confirmar_contraseña').value;

  if (nueva !== confirmar) {
    document.getElementById('error').style.display = 'block';
    return;
  }
  document.getElementById('error').style.display = 'none';

  const csrfToken = document.getElementById('csrfToken').value;

  fetch('/cambiar-contrasena', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'CSRF-Token': csrfToken
    },
    body: JSON.stringify({
      token: token,
      password: nueva
    })
  })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      if (data.success) {
        window.location.href = '/';
      }
    })
    .catch(err => {
      console.error('Error en fetch:', err);
      alert('Ocurrió un error. Intenta más tarde.');
    });
});
