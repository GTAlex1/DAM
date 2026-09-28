/* Calculadora "capacidad del fabricante (SI) → capacidad que muestra el sistema (CEI)".
   Se calcula en tiempo real al escribir o cambiar la unidad (no hay botón).
   Usa delegación de eventos en document, así funciona aunque el script se cargue
   antes de que exista el HTML o la página se inserte dinámicamente. */
(function () {
  var EXP = { MB: 2, GB: 3, TB: 4 };
  var BIN = { MB: 'MiB', GB: 'GiB', TB: 'TiB' };

  function $(id) { return document.getElementById(id); }
  function fmt(x, dec) { return x.toLocaleString('es-ES', { maximumFractionDigits: dec }); }

  function calcular() {
    var num = $('um-num'), uni = $('um-uni');
    if (!num || !uni) return;
    var rBytes = $('um-bytes'), rBin = $('um-bin'), rDif = $('um-dif'), msg = $('um-msg');
    var v = parseFloat(num.value.replace(',', '.'));
    var u = uni.value;
    msg.textContent = '';
    if (!isFinite(v) || v <= 0) {
      rBytes.textContent = rBin.textContent = rDif.textContent = '—';
      if (num.value.trim()) msg.textContent = 'Introduce un número mayor que 0.';
      return;
    }
    var bytes = v * Math.pow(1000, EXP[u]);
    var bin = bytes / Math.pow(1024, EXP[u]);
    rBytes.textContent = fmt(bytes, 0) + ' B';
    rBin.textContent = fmt(bin, 2) + ' ' + BIN[u];
    rDif.textContent = '−' + fmt((1 - bin / v) * 100, 1) + ' %';
  }

  function alCambiar(e) {
    if (e.target && (e.target.id === 'um-num' || e.target.id === 'um-uni')) calcular();
  }
  document.addEventListener('input', alCambiar);
  document.addEventListener('change', alCambiar);
  document.addEventListener('keyup', alCambiar);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', calcular);
  else calcular();
})();
