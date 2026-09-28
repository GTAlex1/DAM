/* Conversor de bases de la Unidad 1 (decimal, binario, octal, hexadecimal). */
(function () {
  var num = document.getElementById('conv-num');
  var base = document.getElementById('conv-base');
  var msg = document.getElementById('conv-msg');
  var out = { 2: 'r2', 8: 'r8', 10: 'r10', 16: 'r16' };
  var valido = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-f]+$/i };
  var prefijo = { 2: '0b', 8: '0o', 16: '0x' };

  function agrupar(s, n) {
    var r = '';
    while (s.length % n) s = '0' + s;
    for (var i = 0; i < s.length; i += n) r += s.slice(i, i + n) + ' ';
    return r.trim();
  }

  function convertir() {
    var b = Number(base.value);
    var t = num.value.trim();
    msg.textContent = '';
    if (!t) { limpiar(); return; }
    if (t.length > 40 || !valido[b].test(t)) {
      limpiar();
      msg.textContent = 'Valor no válido para la base ' + b + '.';
      return;
    }
    var n = BigInt(b === 10 ? t : prefijo[b] + t);
    document.getElementById(out[10]).textContent = n.toString(10);
    document.getElementById(out[2]).textContent = agrupar(n.toString(2), 4);
    document.getElementById(out[8]).textContent = n.toString(8);
    document.getElementById(out[16]).textContent = n.toString(16).toUpperCase();
  }

  function limpiar() {
    for (var k in out) document.getElementById(out[k]).textContent = '—';
  }

  num.addEventListener('input', convertir);
  base.addEventListener('change', convertir);
  convertir();
})();
