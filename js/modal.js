// modal.js
// Comportamiento común de los modales (.auth-modal). Lo usan acceso-ui.js, apuntes.js y app.js.

/**
 * Comportamiento común de los modales (.auth-modal): abrir/cerrar, Esc, clic en el fondo
 * (elementos con data-auth-cerrar) y foco atrapado. Exportado: app.js lo reutiliza.
 */
export function crearControlModal(modal, { focoInicial, alCerrar } = {}) {
  const enfocables = () =>
    [...modal.querySelectorAll("button, input, select, a[href]")].filter(
      (n) => !n.disabled && n.getClientRects().length > 0
    );

  function abrir() {
    modal.hidden = false;
    document.documentElement.classList.add("auth-bloqueo");
    const destino = typeof focoInicial === "function" ? focoInicial() : null;
    (destino || enfocables()[0])?.focus();
  }

  function cerrar() {
    if (modal.hidden) return;
    modal.hidden = true;
    if (!document.querySelector(".auth-modal:not([hidden])")) {
      document.documentElement.classList.remove("auth-bloqueo");
    }
    if (typeof alCerrar === "function") alCerrar();
  }

  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-auth-cerrar]")) cerrar();
  });

  // En fase de captura y con stopPropagation: así el Esc que cierra el modal no
  // llega también a los atajos globales de la página (p. ej. «cerrar pestaña»).
  document.addEventListener(
    "keydown",
    (e) => {
      if (modal.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cerrar();
      } else if (e.key === "Tab") {
        const f = enfocables();
        if (!f.length) return;
        const primero = f[0];
        const ultimo = f[f.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    },
    true
  );

  return { abrir, cerrar, estaAbierto: () => !modal.hidden };
}
