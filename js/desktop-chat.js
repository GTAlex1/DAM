// desktop-chat.js — Chat en la web de escritorio: botón debajo de la estrella (favoritos) que abre un panel lateral.
import { el } from './dom.js';
import { montarChat } from './chat-ui.js?v=0c0964db';

const favoritos = document.getElementById('nav-favoritos');
if (favoritos && !document.getElementById('nav-chat')) {
  const NS = 'http://www.w3.org/2000/svg';
  const icono = document.createElementNS(NS, 'svg');
  icono.setAttribute('viewBox', '0 0 24 24'); icono.setAttribute('width', '22'); icono.setAttribute('height', '22');
  icono.setAttribute('aria-hidden', 'true'); icono.setAttribute('focusable', 'false');
  const ruta = document.createElementNS(NS, 'path');
  ruta.setAttribute('fill', 'currentColor');
  ruta.setAttribute('d', 'M4 4h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2z');
  icono.append(ruta);

  const boton = el('button', 'activity-icon', '');
  boton.id = 'nav-chat'; boton.type = 'button'; boton.title = 'Chat';
  boton.setAttribute('aria-label', 'Chat'); boton.setAttribute('aria-expanded', 'false');
  boton.append(icono);
  favoritos.after(boton); // justo debajo de la estrella

  const nuevo = el('button', 'chat-panel-btn', '+');
  nuevo.type = 'button'; nuevo.hidden = true; nuevo.title = 'Crear grupo'; nuevo.setAttribute('aria-label', 'Crear grupo');
  const cerrarBtn = el('button', 'chat-panel-btn', '×');
  cerrarBtn.type = 'button'; cerrarBtn.title = 'Cerrar chat'; cerrarBtn.setAttribute('aria-label', 'Cerrar chat');
  const cab = el('header', 'chat-panel-cab');
  cab.append(el('h2', '', 'Chat'), nuevo, cerrarBtn);
  const cuerpo = el('div', 'chat-panel-cuerpo');
  const panel = el('aside', 'chat-panel');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Chat de la clase');
  panel.append(cab, cuerpo);
  document.body.append(panel);

  const chat = montarChat({ slot: cuerpo, btnNuevo: nuevo, anfitrion: panel });
  const fijar = (abierto) => {
    panel.hidden = !abierto;
    boton.classList.toggle('active', abierto);
    boton.setAttribute('aria-expanded', String(abierto));
    if (abierto) chat.iniciar();
  };
  boton.addEventListener('click', () => fijar(panel.hidden));
  cerrarBtn.addEventListener('click', () => { fijar(false); boton.focus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden && !panel.querySelector('.mch-conv') && !document.querySelector('dialog[open]')) { fijar(false); boton.focus(); }
  });
}
