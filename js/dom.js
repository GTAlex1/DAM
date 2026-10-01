// dom.js
// Utilidades mínimas de DOM compartidas por la interfaz de cuenta y la de apuntes.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
