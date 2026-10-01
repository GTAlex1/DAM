// scripts/texto-plano.mjs
// Extrae el texto de un HTML igual que htmlAPlano() de js/utils.js (que lo hace en el navegador):
// sin <script>/<style>/<noscript>/<template> y con los espacios colapsados.
// Lo usa build-index.mjs y los tests (que comprueban que ambas versiones coinciden).
import * as cheerio from 'cheerio';

export function htmlAPlano(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, template').remove();
  return $('body').text().replace(/\s+/g, ' ');
}
