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

export function pdfInspectorPages(result = {}) {
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
    return pages;
  }

  let activePage = 1;
  let cursor = 0;
  for (const match of matches) {
    appendPage(pages, activePage, markdown.slice(cursor, match.index));
    activePage = Number(match[1]);
    cursor = match.index + match[0].length;
  }
  appendPage(pages, activePage, markdown.slice(cursor));
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

export function pdfInspectorSections(result, { maxChars = DEFAULT_MAX_SECTION_CHARS } = {}) {
  const sections = [];
  for (const page of pdfInspectorPages(result)) {
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
