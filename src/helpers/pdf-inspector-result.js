const PAGE_MARKER = /<!--\s*Page\s+(\d+)\s*-->/giu;
const DEFAULT_MAX_SECTION_CHARS = 5000;

function clean(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function appendPage(pages, pageNumber, value) {
  const page = pages[pageNumber - 1];
  const text = clean(value);
  if (!page || !text) return;
  page.markdown = clean(page.markdown ? `${page.markdown}\n\n${text}` : text);
}

function detectedPageCount(markdown) {
  let maximum = 0;
  for (const match of String(markdown ?? '').matchAll(PAGE_MARKER)) {
    maximum = Math.max(maximum, Number(match[1]));
  }
  return maximum;
}

function markdownDestination(value) {
  const source = String(value ?? '').trim();
  if (!source) return '';
  if (source.startsWith('<')) {
    const end = source.indexOf('>');
    return end > 0 ? source.slice(1, end).trim() : '';
  }
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (/\s/u.test(character)) return source.slice(0, index);
  }
  return source;
}

function decodedBasename(value) {
  try {
    const url = new URL(value, 'https://lnote.invalid/');
    const encoded = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
    return decodeURIComponent(encoded).toLocaleLowerCase('en-US');
  } catch {
    const path = String(value ?? '').split(/[?#]/u, 1)[0].replaceAll('\\', '/');
    const encoded = path.split('/').filter(Boolean).at(-1) ?? '';
    try {
      return decodeURIComponent(encoded).toLocaleLowerCase('en-US');
    } catch {
      return encoded.toLocaleLowerCase('en-US');
    }
  }
}

function urlIdentity(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/$/u, '').toLocaleLowerCase('en-US');
  } catch {
    return null;
  }
}

function isPdfSelfTarget(target, { sourceFilename, sourceUrl } = {}) {
  const value = String(target ?? '').trim();
  if (!value) return false;
  if (value.startsWith('#') || value.startsWith('?')) return true;
  const sourceIdentity = sourceUrl ? urlIdentity(sourceUrl) : null;
  const targetIdentity = urlIdentity(value);
  if (sourceIdentity && targetIdentity === sourceIdentity) return true;
  const filename = decodedBasename(sourceFilename);
  return Boolean(filename && decodedBasename(value) === filename);
}

function unescapedLabel(value) {
  return String(value ?? '').replace(/\\([\\[\]()])/gu, '$1').trim();
}

function redundantSelfLabel(label, target, sourceFilename) {
  const visible = unescapedLabel(label);
  if (!visible) return true;
  if (visible === target.trim()) return true;
  const filename = decodedBasename(sourceFilename);
  return Boolean(filename && decodedBasename(visible) === filename);
}

function selfLinkReplacement(source, start, end, label, target, sourceFilename) {
  if (!redundantSelfLabel(label, target, sourceFilename)) return label;
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = source.indexOf('\n', end + 1);
  const lineEnd = nextBreak < 0 ? source.length : nextBreak;
  const token = source.slice(start, end + 1).trim();
  return source.slice(lineStart, lineEnd).trim() === token ? '' : label;
}

function closingBracket(source, start, closing) {
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\n') return -1;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === closing) return index;
  }
  return -1;
}

function closingParenthesis(source, start) {
  let depth = 1;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\n') return -1;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function stripPdfSelfLinks(value, options = {}) {
  const source = String(value ?? '');
  let output = '';
  let cursor = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '[' || source[index - 1] === '!') continue;
    const labelEnd = closingBracket(source, index + 1, ']');
    if (labelEnd < 0 || source[labelEnd + 1] !== '(') continue;
    const linkEnd = closingParenthesis(source, labelEnd + 2);
    if (linkEnd < 0) continue;
    const target = markdownDestination(source.slice(labelEnd + 2, linkEnd));
    if (!isPdfSelfTarget(target, options)) continue;

    const label = source.slice(index + 1, labelEnd);
    const replacement = selfLinkReplacement(
      source, index, linkEnd, label, target, options.sourceFilename,
    );
    output += source.slice(cursor, index);
    output += replacement;
    cursor = linkEnd + 1;
    if (!replacement && output.endsWith(' ') && source[cursor] === ' ') cursor += 1;
    index = cursor - 1;
  }
  output += source.slice(cursor);
  return clean(output);
}

export function pdfInspectorPages(result = {}, options = {}) {
  const markdown = String(result.markdown ?? '');
  const pageCount = Math.max(1, Number(result.pageCount ?? 0), detectedPageCount(markdown));
  const needsOcr = new Set((result.pagesNeedingOcr ?? []).map(Number));
  const reasons = new Map((result.ocrReasonsByPage ?? []).map((item) => [Number(item.page), item.reasons ?? []]));
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    page: index + 1,
    markdown: '',
    needsOcr: needsOcr.has(index + 1),
    ocrReasons: reasons.get(index + 1) ?? [],
  }));

  const matches = [...markdown.matchAll(PAGE_MARKER)];
  if (!matches.length) {
    appendPage(pages, 1, markdown);
  } else {
    let activePage = 1;
    let cursor = 0;
    for (const match of matches) {
      appendPage(pages, activePage, markdown.slice(cursor, match.index));
      activePage = Number(match[1]);
      cursor = match.index + match[0].length;
    }
    appendPage(pages, activePage, markdown.slice(cursor));
  }
  const linkContext = {
    sourceFilename: options.sourceFilename ?? result.sourceFilename,
    sourceUrl: options.sourceUrl ?? result.sourceUrl,
  };
  for (const page of pages) page.markdown = stripPdfSelfLinks(page.markdown, linkContext);
  return pages;
}

function splitMarkdown(value, maxChars) {
  const source = clean(value);
  if (!source || source.length <= maxChars) return source ? [source] : [];
  const blocks = source.split(/\n{2,}/gu).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > maxChars) {
      chunks.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) chunks.push(current);
  if (chunks.some((chunk) => chunk.length > maxChars)) {
    return chunks.flatMap((chunk) => (
      chunk.length <= maxChars
        ? [chunk]
        : Array.from({ length: Math.ceil(chunk.length / maxChars) }, (_, index) => (
          chunk.slice(index * maxChars, (index + 1) * maxChars)
        ))
    ));
  }
  return chunks;
}

export function pdfInspectorSections(result, {
  maxChars = DEFAULT_MAX_SECTION_CHARS,
  sourceFilename,
  sourceUrl,
} = {}) {
  const sections = [];
  for (const page of pdfInspectorPages(result, { sourceFilename, sourceUrl })) {
    if (page.needsOcr) continue;
    for (const [index, text] of splitMarkdown(page.markdown, maxChars).entries()) {
      sections.push({
        id: index ? `page-${page.page}-part-${index + 1}` : `page-${page.page}`,
        title: index ? `Страница ${page.page} · часть ${index + 1}` : `Страница ${page.page}`,
        text,
        entityIds: [],
        tags: ['pdf', 'markdown'],
        assetAnchor: { page: page.page },
        provenance: {
          kind: 'pdf-inspector-markdown',
          page: page.page,
          parser: '@firecrawl/pdf-inspector-wasm',
          parserVersion: result.parserVersion ?? null,
        },
      });
    }
  }
  return sections;
}

export function pdfInspectorWarnings(result) {
  const warnings = [];
  const pages = pdfInspectorPages(result).filter((page) => page.needsOcr);
  if (pages.length) {
    warnings.push(`Страницы без надёжного текстового слоя: ${pages.map((page) => page.page).join(', ')}.`);
  }
  if (result.hasEncodingIssues) warnings.push('Обнаружены проблемы кодировки; затронутые страницы требуют OCR-проверки.');
  return warnings;
}

export function pdfInspectorMetadata(result = {}) {
  return {
    engine: '@firecrawl/pdf-inspector-wasm',
    version: result.parserVersion ?? null,
    pdfType: result.pdfType ?? 'Unknown',
    pageCount: Number(result.pageCount ?? 0),
    confidence: Number.isFinite(result.confidence) ? result.confidence : null,
    pagesNeedingOcr: [...new Set((result.pagesNeedingOcr ?? []).map(Number))].sort((a, b) => a - b),
    layout: result.layout ?? null,
    hasEncodingIssues: Boolean(result.hasEncodingIssues),
  };
}
