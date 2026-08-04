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
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, normalized));
}

export function summarizeActivitySources(values = []) {
  const active = values.filter((value) => value.active);
  if (!active.length) return null;
  const progress = active.map((value) => normalizedProgress(value.progress));
  const determinate = progress.filter((value) => value !== null);
  const labels = [...new Set(active.map((value) => String(value.label ?? '').trim()).filter(Boolean))];
  return {
    progress: progress.some((value) => value === null)
      ? null
      : determinate.reduce((sum, value) => sum + value, 0) / Math.max(1, determinate.length),
    label: labels.join(' · ') || 'Загрузка',
  };
}

export function createSidebarController({
  sidebar,
  workspace,
  navButtons = [],
  activityButtons = navButtons,
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
  const activitySources = new Map();
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

  function progressNodesFor(section) {
    if (progressNodes.has(section)) return progressNodes.get(section);
    const buttons = activityButtons.filter((item) => item.dataset.nav === section);
    const nodes = buttons.map((button) => {
      const node = document.createElement('span');
      node.className = 'sidebar-activity-progress';
      node.hidden = true;
      node.setAttribute('role', 'progressbar');
      button.append(node);
      return node;
    });
    progressNodes.set(section, nodes);
    return nodes;
  }

  function renderActivityProgress(section) {
    const nodes = progressNodesFor(section);
    if (!nodes.length) return false;
    const summary = summarizeActivitySources([...(activitySources.get(section)?.values() ?? [])]);
    for (const node of nodes) {
      node.hidden = !summary;
      if (!summary) continue;
      const value = summary.progress;
      node.classList.toggle('is-indeterminate', value === null);
      node.style.setProperty('--activity-progress', `${Math.round((value ?? 0) * 100)}%`);
      node.setAttribute('aria-label', summary.label);
      node.setAttribute('aria-valuemin', '0');
      node.setAttribute('aria-valuemax', '100');
      if (value === null) node.removeAttribute('aria-valuenow');
      else node.setAttribute('aria-valuenow', String(Math.round(value * 100)));
    }
    return Boolean(summary);
  }

  function setActivityProgress(section, activity = {}, source = 'default') {
    const key = String(source || 'default');
    const sources = activitySources.get(section) ?? new Map();
    if (activity.active) sources.set(key, { ...activity, active: true });
    else sources.delete(key);
    if (sources.size) activitySources.set(section, sources);
    else activitySources.delete(section);
    return renderActivityProgress(section);
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
