/* Calculadora "capacidad del fabricante (SI) → capacidad que muestra el sistema (CEI)". */
(function () {
  var num = document.getElementById('um-num');
  var uni = document.getElementById('um-uni');
  var msg = document.getElementById('um-msg');
  var rBytes = document.getElementById('um-bytes');
  var rBin = document.getElementById('um-bin');
  var rDif = document.getElementById('um-dif');
  var exp = { MB: 2, GB: 3, TB: 4 };
  var nombre = { MB: 'MiB', GB: 'GiB', TB: 'TiB' };

  function fmt(x, dec) {
    return x.toLocaleString('es-ES', { maximumFractionDigits: dec });
  }

  function calcular() {
    var v = parseFloat(num.value.replace(',', '.'));
    var u = uni.value;
    msg.textContent = '';
    if (!isFinite(v) || v <= 0) {
      rBytes.textContent = rBin.textContent = rDif.textContent = '—';
      if (num.value.trim()) msg.textContent = 'Introduce un número mayor que 0.';
      return;
    }
    var bytes = v * Math.pow(1000, exp[u]);
    var bin = bytes / Math.pow(1024, exp[u]);
    rBytes.textContent = fmt(bytes, 0) + ' B';
    rBin.textContent = fmt(bin, 2) + ' ' + nombre[u];
    rDif.textContent = '−' + fmt((1 - bin / v) * 100, 1) + ' %';
  }

  num.addEventListener('input', calcular);
  uni.addEventListener('change', calcular);
  calcular();
})();
