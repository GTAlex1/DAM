import globals from 'globals';

// Reglas mínimas: errores de verdad (variables sin definir, claves duplicadas, código inalcanzable)
// como «error»; lo demás, como aviso. Los avisos no hacen fallar la CI.
const reglas = {
  'no-undef': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-else-if': 'error',
  'no-unreachable': 'error',
  'no-redeclare': 'error',
  'no-const-assign': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
};

export default [
  { ignores: ['node_modules/**', 'js/vendor/**', 'css/vendor/**', 'DAM/**'] },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // marked, DOMPurify y hljs se cargan con <script> en index.html (js/vendor/).
      globals: { ...globals.browser, marked: 'readonly', DOMPurify: 'readonly', hljs: 'readonly' },
    },
    rules: reglas,
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: reglas,
  },
  {
    files: ['service-worker.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: globals.serviceworker },
    rules: reglas,
  },
];
