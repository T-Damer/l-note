export function slugifyPackValue(value, fallback = 'knowledge') {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96);
  return slug || fallback;
}

function shortHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value ?? '')) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function proposedBrowserPackId(title) {
  const readable = slugifyPackValue(title, '')
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return readable
    ? `user.${readable}`
    : `user.knowledge-${shortHash(title)}`;
}

export function cleanPackText(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export function packSourceExtension(filename) {
  const match = /\.[^.]+$/u.exec(String(filename ?? '').toLocaleLowerCase('en-US'));
  return match?.[0] ?? '';
}

function titleFromFilename(filename) {
  const name = String(filename ?? 'document').replace(/\.[^.]+$/u, '');
  return name.replace(/[-_]+/gu, ' ').trim() || 'Документ';
}

function splitLongSection(section, maxChars = 5000) {
  if (section.text.length <= maxChars) return [section];
  const paragraphs = section.text.split(/\n{2,}/gu).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  if (chunks.length <= 1) {
    chunks.length = 0;
    for (let offset = 0; offset < section.text.length; offset += maxChars) {
      chunks.push(section.text.slice(offset, offset + maxChars));
    }
  }
  return chunks.map((text, index) => ({
    ...section,
    id: `${section.id}-part-${index + 1}`,
    title: `${section.title} · часть ${index + 1}`,
    text,
  }));
}

export function parseBrowserMarkdown(text, filename = 'document.md') {
  const source = cleanPackText(text);
  const sections = [];
  let title = titleFromFilename(filename);
  let currentTitle = 'Содержание';
  let currentLines = [];
  let firstHeadingHandled = false;

  const flush = () => {
    const body = cleanPackText(currentLines.join('\n'));
    currentLines = [];
    if (!body) return;
    sections.push(...splitLongSection({
      id: slugifyPackValue(currentTitle, `section-${sections.length + 1}`),
      title: currentTitle,
      text: body,
      entityIds: [],
      tags: [],
    }));
  };

  for (const line of source.split('\n')) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
    if (!heading) {
      currentLines.push(line);
      continue;
    }
    const headingText = cleanPackText(heading[2]);
    if (heading[1].length === 1 && !firstHeadingHandled && sections.length === 0 && !cleanPackText(currentLines.join('\n'))) {
      title = headingText;
      firstHeadingHandled = true;
      continue;
    }
    flush();
    currentTitle = headingText;
    firstHeadingHandled = true;
  }
  flush();
  if (!sections.length && source) {
    sections.push({ id: 'content', title: 'Содержание', text: source, entityIds: [], tags: [] });
  }
  return { title, sections };
}

export function parseBrowserPlainText(text, filename = 'document.txt') {
  const source = cleanPackText(text);
  const lines = source.split('\n');
  let title = titleFromFilename(filename);
  let body = source;
  if (lines[0] && lines[0].length <= 120 && lines.length > 1) {
    title = lines[0].replace(/^#+\s*/u, '').trim();
    body = cleanPackText(lines.slice(1).join('\n')) || source;
  }
  return {
    title,
    sections: splitLongSection({ id: 'content', title: 'Содержание', text: body, entityIds: [], tags: [] }),
  };
}

function flattenJson(value, prefix = '$', output = []) {
  if (value === null || typeof value !== 'object') {
    output.push(`${prefix}: ${JSON.stringify(value)}`);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenJson(item, `${prefix}[${index}]`, output));
    return output;
  }
  for (const [key, item] of Object.entries(value)) flattenJson(item, `${prefix}.${key}`, output);
  return output;
}

export function parseBrowserJson(text, filename = 'document.json') {
  const parsed = JSON.parse(text);
  if (parsed?.schemaVersion === 1 && Array.isArray(parsed.documents) && Array.isArray(parsed.entities)) {
    return { existingPack: parsed };
  }
  return {
    title: typeof parsed?.title === 'string' ? parsed.title : titleFromFilename(filename),
    sections: splitLongSection({
      id: 'data',
      title: 'Данные',
      text: flattenJson(parsed).join('\n') || '{}',
      entityIds: [],
      tags: ['json'],
    }),
  };
}

export function parseBrowserSource(filename, text) {
  const extension = packSourceExtension(filename);
  if (extension === '.md' || extension === '.markdown') return parseBrowserMarkdown(text, filename);
  if (extension === '.json') return parseBrowserJson(text, filename);
  return parseBrowserPlainText(text, filename);
}
