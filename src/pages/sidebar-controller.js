import { Button } from '../ui/components.js';
import { Icon } from '../ui/icons.js';

export const SIDEBAR_COLLAPSED_SETTING_KEY = 'ui.sidebar.collapsed';

function requireElement(value, label) {
  if (!(value instanceof HTMLElement)) throw new TypeError(`${label} must be an HTML element.`);
  return value;
}

function navLabel(button) {
  const text = [...button.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return text || button.getAttribute('aria-label') || 'Раздел';
}

function prepareNavButton(button) {
  const text = navLabel(button);
  for (const node of [...button.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  }
  let label = button.querySelector('.nav-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = text;
    button.insertBefore(label, button.querySelector('b'));
  }
  button.dataset.tooltip = text;
  button.title = text;
  button.setAttribute('aria-label', text);
  return label;
}

export function createSidebarController({
  sidebar,
  workspace,
  navButtons = [],
  storagePort,
  settingKey = SIDEBAR_COLLAPSED_SETTING_KEY,
} = {}) {
  requireElement(sidebar, 'sidebar');
  requireElement(workspace, 'workspace');
  if (!storagePort?.getSetting || !storagePort?.setSetting) {
    throw new TypeError('A StoragePort with settings support is required.');
  }

  for (const button of navButtons) prepareNavButton(button);
  const toggle = Button({
    variant: 'icon',
    className: 'sidebar-toggle',
    icon: 'back',
    iconLabel: 'Свернуть боковую панель',
  });
  sidebar.append(toggle);
  let collapsed = false;

  function render(value) {
    collapsed = Boolean(value);
    sidebar.classList.toggle('is-collapsed', collapsed);
    workspace.classList.toggle('is-sidebar-collapsed', collapsed);
    const label = collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель';
    toggle.replaceChildren(Icon({ name: collapsed ? 'forward' : 'back', label }));
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', label);
    toggle.dataset.tooltip = label;
    toggle.title = label;
    return collapsed;
  }

  async function setCollapsed(value, { persist = true } = {}) {
    render(value);
    if (persist) await storagePort.setSetting(settingKey, collapsed);
    return collapsed;
  }

  async function restore() {
    const stored = await storagePort.getSetting(settingKey, false);
    return setCollapsed(Boolean(stored), { persist: false });
  }

  toggle.addEventListener('click', () => {
    void setCollapsed(!collapsed).catch((error) => {
      console.warn('Sidebar preference was not persisted.', error);
    });
  });

  render(false);
  return Object.freeze({
    element: sidebar,
    restore,
    setCollapsed,
    toggle,
    get collapsed() {
      return collapsed;
    },
  });
}
