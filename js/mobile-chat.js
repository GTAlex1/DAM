// mobile-chat.js — conecta el chat con la pestaña «Chat» de la app móvil.
import { montarChat } from './chat-ui.js?v=1';

const raiz = document.getElementById('mobile-app');
if (raiz) {
  const chat = montarChat({ slot: raiz.querySelector('[data-m-slot="chat"]'), btnNuevo: raiz.querySelector('#m-chat-nuevo'), anfitrion: raiz });
  raiz.addEventListener('m:vista', (e) => { if (e.detail?.vista === 'chat') chat.iniciar(); });
  if (raiz.dataset.mVista === 'chat') chat.iniciar();
}