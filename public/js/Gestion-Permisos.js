// /js/Gestion-Permisos.js
import { renderHeader } from '../assets/js/header.js';

async function obtenerCsrfToken() {
  const res = await fetch('/csrf-token', { credentials: 'include' });
  const data = await res.json();
  return data.csrfToken;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Elementos del DOM
  const personSearch = document.getElementById('personSearch');
  const searchResults = document.getElementById('searchResults');
  const permissionsSection = document.getElementById('permissionsSection');
  const selectedPersonName = document.getElementById('selectedPersonName');
  const savePermissionsBtn = document.getElementById('savePermissionsBtn');

  let selectedPersonId = null;
  let results = [];
  let activeIndex = -1;

  // verificar sesión + render header (igual que antes)
  try {
    const response = await fetch('/auth-check', { credentials: 'include' });
    const data = await response.json();
    if (!data.authenticated) {
      window.location.href = '/';
      return;
    }
    document.getElementById('header').appendChild(renderHeader(data.user));
  } catch (err) {
    console.error('Error verificando sesión:', err);
    return;
  }

  // debounce
  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // mostrar resultados
  function showResults(list) {
    results = list;
    activeIndex = -1;
    if (!list || list.length === 0) {
      searchResults.classList.add('d-none');
      searchResults.innerHTML = '';
      return;
    }
    searchResults.classList.remove('d-none');
    searchResults.innerHTML = list.map((p, i) =>
      `<li tabindex="-1" data-index="${i}" data-id="${p.id_usuario}" class="list-group-item">
         <strong>${p.nombre_personal} ${p.apaterno_personal} ${p.amaterno_personal || ''}</strong>
         <div class="small text-muted">${p.mail || ''}${p.matricula ? ' · ' + p.matricula : ''}</div>
       </li>`).join('');
  }

  // seleccionar persona de la lista
  function selectFromList(index) {
    if (!results || index < 0 || index >= results.length) return;
    const p = results[index];
    selectedPersonId = p.id_usuario;
    const displayName = `${p.nombre_personal} ${p.apaterno_personal} ${p.amaterno_personal || ''}`.trim();
    selectedPersonName.textContent = displayName;
    personSearch.value = displayName;
    searchResults.classList.add('d-none');
    loadPermissions(selectedPersonId);
    // actualizar querystring opcionalmente
    const url = new URL(window.location);
    url.searchParams.set('id_usuario', selectedPersonId);
    window.history.pushState({}, '', url);
  }

  // navegación por teclado
  personSearch.addEventListener('keydown', (e) => {
    if (searchResults.classList.contains('d-none')) return;
    const items = searchResults.querySelectorAll('li');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach(it => it.classList.remove('active'));
      if (items[activeIndex]) items[activeIndex].classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach(it => it.classList.remove('active'));
      if (items[activeIndex]) items[activeIndex].classList.add('active');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) selectFromList(activeIndex);
    } else if (e.key === 'Escape') {
      searchResults.classList.add('d-none');
    }
  });

  // clic en item
  searchResults.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const idx = Number(li.dataset.index);
    selectFromList(idx);
  });

  // búsqueda remota (debounce)
  const buscarRemote = debounce(async (q) => {
    if (!q || q.trim().length < 2) {
      showResults([]);
      return;
    }
    try {
      const res = await fetch(`/personal-search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.personal)) throw new Error('Formato inesperado');
      showResults(data.personal);
    } catch (err) {
      console.error('Error buscando personal:', err);
      showResults([]);
    }
  }, 300);

  personSearch.addEventListener('input', (e) => {
    selectedPersonId = null;
    permissionsSection.classList.add('d-none');
    buscarRemote(e.target.value);
  });

  // ocultar lista si clic fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.position-relative')) {
      searchResults.classList.add('d-none');
    }
  });

  // cargar permisos
  async function loadPermissions(id_usuario) {
    if (!id_usuario) return;
    try {
      const res = await fetch(`/permissions-permisos/${id_usuario}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Error permisos');
      const permissions = data.data;
      document.getElementById('permMaterias').checked = permissions.permiso_materias === 1;
      document.getElementById('permKPIs').checked = permissions.permiso_kpis === 1;
      document.getElementById('permGrupos').checked = permissions.permiso_grupos === 1;
      document.getElementById('permPersonal').checked = permissions.permiso_personal === 1;
      document.getElementById('permTalleres').checked = permissions.permiso_talleres === 1;
      document.getElementById('permAlumnos').checked = permissions.permiso_alumnos === 1;
      permissionsSection.classList.remove('d-none');
    } catch (err) {
      console.error('Error cargando permisos:', err);
      Swal.fire('Error', 'No se pudieron cargar los permisos.', 'error');
      permissionsSection.classList.add('d-none');
    }
  }

  // guardar permisos
  savePermissionsBtn.addEventListener('click', async () => {
    if (!selectedPersonId) {
      Swal.fire('Atención', 'Selecciona una persona antes de guardar.', 'warning');
      return;
    }
    const payload = {
      id_usuario: Number(selectedPersonId),
      permiso_materias: document.getElementById('permMaterias').checked ? 1 : 0,
      permiso_kpis: document.getElementById('permKPIs').checked ? 1 : 0,
      permiso_grupos: document.getElementById('permGrupos').checked ? 1 : 0,
      permiso_personal: document.getElementById('permPersonal').checked ? 1 : 0,
      permiso_talleres: document.getElementById('permTalleres').checked ? 1 : 0,
      permiso_alumnos: document.getElementById('permAlumnos').checked ? 1 : 0
    };
    try {
      const csrfToken = await obtenerCsrfToken();
      const res = await fetch('/permissions-permisos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Error guardando');
      Swal.fire('Éxito', `Permisos guardados para ${selectedPersonName.textContent}`, 'success');
    } catch (err) {
      console.error('Error guardando permisos:', err);
      Swal.fire('Error', 'No se pudieron guardar los permisos.', 'error');
    }
  });

  // Si viene id_usuario por querystring, cargarlo
  const urlParams = new URLSearchParams(window.location.search);
  const qId = urlParams.get('id_usuario');
  if (qId) {
    try {
      const res = await fetch(`/personal-by-id/${encodeURIComponent(qId)}`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        if (d && d.personal) {
          const name = `${d.personal.nombre_personal} ${d.personal.apaterno_personal} ${d.personal.amaterno_personal || ''}`.trim();
          personSearch.value = name;
          selectedPersonId = qId;
          selectedPersonName.textContent = name;
          loadPermissions(qId);
        }
      }
    } catch (err) {
      console.warn('No se pudo cargar personal por id en querystring:', err);
    }
  }
});
