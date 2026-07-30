const TEXT_VARIANTS = Object.freeze({
  eyebrow: Object.freeze({ tag: 'p', className: 'text text--eyebrow' }),
  display: Object.freeze({ tag: 'h1', className: 'text text--display' }),
  title: Object.freeze({ tag: 'h2', className: 'text text--title' }),
  heading: Object.freeze({ tag: 'h3', className: 'text text--heading' }),
  body: Object.freeze({ tag: 'p', className: 'text text--body' }),
  muted: Object.freeze({ tag: 'p', className: 'text text--muted' }),
  caption: Object.freeze({ tag: 'small', className: 'text text--caption' }),
  label: Object.freeze({ tag: 'span', className: 'text text--label' }),
});

export function textVariant(name = 'body') {
  return TEXT_VARIANTS[name] ?? TEXT_VARIANTS.body;
}

export function textClassName(variant = 'body', extraClassName = '') {
  return [textVariant(variant).className, String(extraClassName ?? '').trim()].filter(Boolean).join(' ');
}

/**
 * Small DOM component used by the framework-free web shell. It deliberately
 * accepts nodes rather than HTML strings so source and user text stay escaped.
 */
export function Text({
  variant = 'body',
  as,
  text,
  children = [],
  className = '',
  ...attributes
} = {}) {
  const definition = textVariant(variant);
  const node = document.createElement(as ?? definition.tag);
  node.className = textClassName(variant, className);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key in node) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  if (text !== undefined && text !== null) node.textContent = String(text);
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === undefined || child === null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const textVariants = TEXT_VARIANTS;
