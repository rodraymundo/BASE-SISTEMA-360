import { renderHeader } from '../assets/js/header.js';

// Check session and render header
async function initializePage() {
    try {
    const response = await fetch('/auth-check', {
        method: 'GET',
        credentials: 'include'
    });
    const data = await response.json();
    if (!data.authenticated) {
        window.location.href = '/';
        return;
    }

    const headerContainer = document.getElementById('header-container');
    headerContainer.appendChild(renderHeader(data.user));
    } catch (error) {
    console.error('Error al verificar sesión:', error);
    window.location.href = '/';
    }
}

initializePage();