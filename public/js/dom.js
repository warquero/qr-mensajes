/** Helpers de DOM seguros: los strings SIEMPRE se insertan como texto (sin HTML). */

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** "10 de noviembre de 2027" */
export function fmtDateLong(ms) {
  return new Date(ms).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

/** "10/11/2027" */
export function fmtDateShort(ms) {
  return new Date(ms).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
