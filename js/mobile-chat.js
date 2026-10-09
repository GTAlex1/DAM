// mobile-chat.js — conecta el chat con la pestaña «Chat» de la app móvil.
import { montarChat } from './chat-ui.js?v=fcbc23ea';

const raiz = document.getElementById('mobile-app');
if (raiz) {
  const chat = montarChat({ slot: raiz.querySelector('[data-m-slot="chat"]'), btnNuevo: raiz.querySelector('#m-chat-nuevo'), anfitrion: raiz });
  raiz.addEventListener('m:vista', (e) => { if (e.detail?.vista === 'chat') chat.iniciar(); });
  if (raiz.dataset.mVista === 'chat') chat.iniciar();
}

// Escritorio: botón del chat debajo de la estrella de favoritos.
if (document.getElementById('nav-favoritos')) {
  import('./desktop-chat.js?v=fe78f5fc').catch((err) => console.warn('Chat de escritorio no disponible', err));
}