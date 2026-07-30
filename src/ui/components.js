import { Icon } from './icons.js';
import { Text } from './text.js';

const CONTROL_VARIANTS = Object.freeze({
  primary: 'primary-button',
  secondary: 'secondary-button',
  ghost: 'ghost-button',
  danger: 'danger-button',
  icon: 'icon-button',
});

export function controlClassName(variant = 'secondary', className = '', withIcon = false) {
  return [
    CONTROL_VARIANTS[variant] ?? CONTROL_VARIANTS.secondary,
    withIcon && variant !== 'icon' ? 'button-with-icon' : '',
    String(className ?? '').trim(),
  ].filter(Boolean).join(' ');
}

export function cardClassName(kind = 'surface', className = '', interactive = false) {
  return [
    'ui-card',
    `ui-card--${kind}`,
    interactive ? 'ui-card--interactive' : '',
    String(className ?? '').trim(),
  ].filter(Boolean).join(' ');
}

function appendChildren(node, children) {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === undefined || child === null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function Button({
  variant = 'secondary',
  icon,
  iconLabel = '',
  text,
  className = '',
  children = [],
  type = 'button',
  onClick,
  ...attributes
} = {}) {
  const node = document.createElement('button');
  node.type = type;
  node.className = controlClassName(variant, className, Boolean(icon));
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key in node) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  if (icon) node.append(Icon({ name: icon, label: iconLabel }));
  if (text !== undefined && text !== null) node.append(Text({ variant: 'label', as: 'span', text }));
  appendChildren(node, children);
  if (typeof onClick === 'function') node.addEventListener('click', onClick);
  return node;
}

export function Card({
  kind = 'surface',
  className = '',
  interactive = false,
  ariaLabel = '',
  onActivate,
  children = [],
  ...attributes
} = {}) {
  const node = document.createElement('article');
  node.className = cardClassName(kind, className, interactive);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key in node) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  appendChildren(node, children);
  if (interactive) {
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
    if (typeof onActivate === 'function') {
      node.addEventListener('click', onActivate);
      node.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onActivate(event);
      });
    }
  }
  return node;
}

export function bindRoutedDialog(dialog, onFullClose, { closeOnBackdrop = true } = {}) {
  if (!(dialog instanceof HTMLDialogElement)) throw new TypeError('bindRoutedDialog requires a dialog element.');
  if (typeof onFullClose !== 'function') throw new TypeError('bindRoutedDialog requires an onFullClose callback.');

  const onCancel = (event) => {
    event.preventDefault();
    onFullClose('escape');
  };
  const onClick = (event) => {
    if (closeOnBackdrop && event.target === dialog) onFullClose('backdrop');
  };
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('click', onClick);

  return () => {
    dialog.removeEventListener('cancel', onCancel);
    dialog.removeEventListener('click', onClick);
  };
}

export const controlVariants = CONTROL_VARIANTS;
