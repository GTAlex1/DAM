/* ==========================================================================
   ejercicios-pseint.js
   Controla los botones "Mostrar pista" / "Mostrar solución" de cada ejercicio
   en ejercicios-pseint.html. Cada botón lleva:
     data-toggle="id-del-bloque"   -> id del <div> a mostrar/ocultar
     data-mostrar="texto cuando está oculto"
     data-ocultar="texto cuando está visible"
   No depende de ninguna librería externa.
   ========================================================================== */
(function () {
  "use strict";

  function alternarBloque(boton) {
    var idObjetivo = boton.getAttribute("data-toggle");
    var bloque = idObjetivo ? document.getElementById(idObjetivo) : null;
    if (!bloque) return;

    var estabaOculto = bloque.hasAttribute("hidden");

    if (estabaOculto) {
      bloque.removeAttribute("hidden");
    } else {
      bloque.setAttribute("hidden", "");
    }

    boton.classList.toggle("activo", estabaOculto);
    boton.setAttribute("aria-expanded", estabaOculto ? "true" : "false");

    var textoBoton = boton.querySelector(".texto-btn");
    if (textoBoton) {
      var textoMostrar = boton.getAttribute("data-mostrar");
      var textoOcultar = boton.getAttribute("data-ocultar");
      textoBoton.textContent = estabaOculto ? (textoOcultar || textoBoton.textContent)
                                             : (textoMostrar || textoBoton.textContent);
    }
  }

  function iniciar() {
    var botones = document.querySelectorAll(".btn-toggle[data-toggle]");
    botones.forEach(function (boton) {
      boton.setAttribute("aria-expanded", "false");
      boton.addEventListener("click", function () {
        alternarBloque(boton);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
