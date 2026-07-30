const ICONS = Object.freeze({
  search: 'magnifying-glass',
  ask: 'sparkle',
  packages: 'books',
  notes: 'note-pencil',
  back: 'arrow-left',
  forward: 'arrow-right',
  close: 'x',
  download: 'download-simple',
  retry: 'arrow-clockwise',
  spinner: 'spinner-gap',
  import: 'upload-simple',
  graph: 'share-network',
  list: 'list-bullets',
  document: 'file-text',
  pdf: 'file-pdf',
  concept: 'circles-three-plus',
  statement: 'quotes',
  model: 'brain',
  respiratory: 'lungs',
  medications: 'pill',
  pediatrics: 'baby',
  dentistry: 'tooth',
  infections: 'virus',
  nephrology: 'drop',
  reference: 'book-open-text',
  personal: 'user-focus',
  placeholder: 'placeholder',
});

const LEGACY_ICON_ALIASES = Object.freeze({
  'download-simple': 'download',
  'arrow-clockwise': 'retry',
  'spinner-gap': 'spinner',
  'share-network': 'graph',
  'list-bullets': 'list',
  brain: 'model',
  'arrow-right': 'forward',
});

const CATEGORY_ALIASES = Object.freeze({
  respiratory: 'respiratory',
  pulmonology: 'respiratory',
  'дыхательная система': 'respiratory',
  medication: 'medications',
  medications: 'medications',
  drug: 'medications',
  'лекарства': 'medications',
  'лекарственный реестр': 'medications',
  pediatrics: 'pediatrics',
  'педиатрия': 'pediatrics',
  dentistry: 'dentistry',
  'стоматология': 'dentistry',
  infectious: 'infections',
  infection: 'infections',
  infections: 'infections',
  'инфекции': 'infections',
  nephrology: 'nephrology',
  urology: 'nephrology',
  'нефрология': 'nephrology',
  'урология': 'nephrology',
  reference: 'reference',
  personal: 'personal',
});

function normalizedCategory(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru-RU').trim();
}

export function iconName(name) {
  const key = LEGACY_ICON_ALIASES[name] ?? name;
  return ICONS[key] ?? ICONS.placeholder;
}

export function iconNameForCategory(category) {
  const normalized = normalizedCategory(category);
  const key = CATEGORY_ALIASES[normalized] ?? normalized;
  return ICONS[key] ?? ICONS.placeholder;
}

export function iconNameForSearchResult(result) {
  if (result?.kind === 'note' || result?.authority === 'personal') return ICONS.personal;
  const haystack = normalizedCategory([
    result?.packId,
    result?.packTitle,
    result?.documentTitle,
    result?.tags,
  ].filter(Boolean).join(' '));
  const entries = [
    ['respiratory', ['respir', 'дыхатель', 'бронх', 'пневмон']],
    ['medications', ['medication', 'drug', 'лекар', 'препарат', 'grls']],
    ['pediatrics', ['pediatr', 'детск', 'ребен', 'ребён']],
    ['dentistry', ['dent', 'стомат', 'зуб']],
    ['infections', ['infect', 'инфек', 'корь', 'ротавирус', 'менингокок']],
    ['nephrology', ['nephro', 'uro', 'нефро', 'уролог', 'мочев']],
  ];
  for (const [category, fragments] of entries) {
    if (fragments.some((fragment) => haystack.includes(fragment))) return ICONS[category];
  }
  return result?.kind === 'section' ? ICONS.document : ICONS.placeholder;
}

export function Icon({
  name = 'placeholder',
  category,
  label = '',
  className = '',
  size,
} = {}) {
  const resolved = category ? iconNameForCategory(category) : iconName(name);
  const node = document.createElement('i');
  node.className = ['ph', `ph-${resolved}`, 'icon', String(className ?? '').trim()].filter(Boolean).join(' ');
  if (size !== undefined && size !== null) node.style.fontSize = typeof size === 'number' ? `${size}px` : String(size);
  if (label) {
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', label);
  } else {
    node.setAttribute('aria-hidden', 'true');
  }
  return node;
}

export const icons = ICONS;
export const categoryIconAliases = CATEGORY_ALIASES;
