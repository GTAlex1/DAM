/* Conversor de bases de la Unidad 1 (decimal, binario, octal, hexadecimal).
   Cálculo en tiempo real; usa delegación de eventos en document, así funciona
   aunque el script se cargue antes de que exista el HTML. */
(function () {
  var OUT = { 2: 'r2', 8: 'r8', 10: 'r10', 16: 'r16' };
  var VALIDO = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-f]+$/i };
  var PREFIJO = { 2: '0b', 8: '0o', 16: '0x' };

  function $(id) { return document.getElementById(id); }

  function agrupar(s, n) {
    var r = '';
    while (s.length % n) s = '0' + s;
    for (var i = 0; i < s.length; i += n) r += s.slice(i, i + n) + ' ';
    return r.trim();
  }

  function limpiar() {
    for (var k in OUT) $(OUT[k]).textContent = '—';
  }

  function convertir() {
    var num = $('conv-num'), base = $('conv-base'), msg = $('conv-msg');
    if (!num || !base) return;
    var b = Number(base.value);
    var t = num.value.trim();
    msg.textContent = '';
    if (!t) { limpiar(); return; }
    if (t.length > 40 || !VALIDO[b].test(t)) {
      limpiar();
      msg.textContent = 'Valor no válido para la base ' + b + '.';
      return;
    }
    var n = BigInt(b === 10 ? t : PREFIJO[b] + t);
    $(OUT[10]).textContent = n.toString(10);
    $(OUT[2]).textContent = agrupar(n.toString(2), 4);
    $(OUT[8]).textContent = n.toString(8);
    $(OUT[16]).textContent = n.toString(16).toUpperCase();
  }

  function alCambiar(e) {
    if (e.target && (e.target.id === 'conv-num' || e.target.id === 'conv-base')) convertir();
  }
  document.addEventListener('input', alCambiar);
  document.addEventListener('change', alCambiar);
  document.addEventListener('keyup', alCambiar);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', convertir);
  else convertir();
})();
