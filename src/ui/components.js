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

export function fieldClassName(className = '') {
  return ['ui-field', String(className ?? '').trim()].filter(Boolean).join(' ');
}

export function switchClassName(className = '', disabled = false) {
  return [
    'ui-switch',
    disabled ? 'is-disabled' : '',
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

export function Field({
  label = '',
  hint = '',
  control,
  className = '',
  required = false,
} = {}) {
  if (!(control instanceof HTMLElement)) throw new TypeError('Field requires a control element.');
  const root = document.createElement('label');
  root.className = fieldClassName(className);
  root.append(Text({ variant: 'label', as: 'span', text: required ? `${label} *` : label }));
  root.append(control);
  if (hint) root.append(Text({ variant: 'caption', as: 'span', className: 'ui-field__hint', text: hint }));
  return root;
}

export function Switch({
  label = '',
  hint = '',
  input = null,
  id,
  name,
  checked = false,
  disabled = false,
  className = '',
  onChange,
} = {}) {
  const control = input instanceof HTMLInputElement ? input : document.createElement('input');
  control.type = 'checkbox';
  if (id) control.id = id;
  if (name) control.name = name;
  if (!(input instanceof HTMLInputElement)) control.checked = Boolean(checked);
  control.disabled = Boolean(disabled);

  const root = document.createElement('label');
  root.className = switchClassName(className, control.disabled);
  const track = document.createElement('span');
  track.className = 'ui-switch__track';
  track.setAttribute('aria-hidden', 'true');
  track.append(Object.assign(document.createElement('span'), { className: 'ui-switch__thumb' }));

  const copy = document.createElement('span');
  copy.className = 'ui-switch__copy';
  copy.append(Text({ variant: 'label', as: 'span', text: label }));
  if (hint) copy.append(Text({ variant: 'caption', as: 'span', text: hint }));

  root.append(control, track, copy);
  if (typeof onChange === 'function') control.addEventListener('change', onChange);
  Object.defineProperty(root, 'control', { value: control, enumerable: false });
  return root;
}

export function SourceCard({
  sourceId = '',
  title = 'Источник',
  type = 'Справочный источник',
  excerpt = '',
  actionText = 'Открыть источник',
  onOpen,
} = {}) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'source-card';
  node.setAttribute('aria-label', `${actionText}: ${title}`);

  const heading = document.createElement('span');
  heading.className = 'source-card__heading';
  heading.append(
    Text({ variant: 'caption', as: 'span', className: 'source-card__id', text: sourceId ? `[${sourceId}]` : 'Источник' }),
    Text({ variant: 'title', as: 'strong', className: 'source-card__title', text: title }),
    Text({ variant: 'caption', as: 'span', className: 'source-card__type', text: type }),
  );

  const action = document.createElement('span');
  action.className = 'source-card__action';
  action.append(
    Text({ variant: 'label', as: 'span', text: actionText }),
    Icon({ name: 'forward', className: 'source-card__action-icon' }),
  );

  node.append(
    heading,
    Text({ variant: 'muted', as: 'span', className: 'source-card__excerpt', text: excerpt }),
    action,
  );
  if (typeof onOpen === 'function') node.addEventListener('click', onOpen);
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
