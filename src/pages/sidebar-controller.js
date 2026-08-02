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

function normalizedProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, normalized));
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
  const progressNodes = new Map();
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

  function progressNode(section) {
    if (progressNodes.has(section)) return progressNodes.get(section);
    const button = navButtons.find((item) => item.dataset.nav === section);
    if (!button) return null;
    const node = document.createElement('span');
    node.className = 'sidebar-activity-progress';
    node.hidden = true;
    node.setAttribute('role', 'progressbar');
    button.append(node);
    progressNodes.set(section, node);
    return node;
  }

  function setActivityProgress(section, { active = false, progress, label = 'Загрузка' } = {}) {
    const node = progressNode(section);
    if (!node) return false;
    const value = normalizedProgress(progress);
    node.hidden = !active;
    node.classList.toggle('is-indeterminate', active && value === null);
    node.style.setProperty('--activity-progress', `${Math.round((value ?? 0) * 100)}%`);
    node.setAttribute('aria-label', label);
    node.setAttribute('aria-valuemin', '0');
    node.setAttribute('aria-valuemax', '100');
    if (value === null) node.removeAttribute('aria-valuenow');
    else node.setAttribute('aria-valuenow', String(Math.round(value * 100)));
    return active;
  }

  toggle.addEventListener('click', () => {
    void setCollapsed(!collapsed).catch((error) => {
      console.warn('Sidebar preference could not be saved.', error);
    });
  });

  render(false);
  return Object.freeze({
    element: sidebar,
    restore,
    setActivityProgress,
    setCollapsed,
    toggle,
    get collapsed() {
      return collapsed;
    },
  });
}
