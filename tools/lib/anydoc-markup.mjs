import path from 'node:path';

import { slugify } from './pack-builder.mjs';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[-_]+/gu, ' ').trim() || 'Документ';
}

function escapeTableCell(value) {
  return cleanText(value).replaceAll('|', '\\|').replace(/\n+/gu, '<br>');
}

function styledText(text, style = {}) {
  let output = String(text ?? '');
  if (!output) return '';
  if (style.code) output = `\`${output.replaceAll('`', '\\`')}\``;
  if (style.bold) output = `**${output}**`;
  if (style.italic) output = `*${output}*`;
  if (style.strike) output = `~~${output}~~`;
  return output;
}

function linkTarget(target) {
  const value = String(target?.value ?? '').trim();
  if (!value) return '';
  return target.kind === 'anchor' ? `#${value}` : value;
}

export function renderAnydocInlines(inlines = []) {
  return inlines.map((inline) => {
    if (inline?.kind === 'text') return styledText(inline.text, inline.style);
    if (inline?.kind === 'lineBreak') return '\n';
    if (inline?.kind === 'anchor') return inline.anchor ? `<a id="${inline.anchor}"></a>` : '';
    if (inline?.kind === 'noteRef') return inline.noteId ? `[^${inline.noteId}]` : '';
    if (inline?.kind === 'link') {
      const label = renderAnydocInlines(inline.content ?? []) || linkTarget(inline.target);
      const target = linkTarget(inline.target);
      return target ? `[${label}](${target})` : label;
    }
    if (inline?.kind === 'image') {
      const alt = cleanText(inline.alt) || 'Встроенное изображение';
      if (inline.source?.kind === 'external' && inline.source.url) return `![${alt}](${inline.source.url})`;
      if (inline.source?.kind === 'asset' && Number.isInteger(inline.source.assetId)) {
        return `![${alt}](asset:${inline.source.assetId})`;
      }
      return `[Изображение: ${alt}]`;
    }
    return '';
  }).join('');
}

function alphaMarker(index, uppercase) {
  const value = String.fromCharCode(97 + (index % 26));
  return uppercase ? value.toUpperCase() : value;
}

function romanMarker(value) {
  const pairs = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
  let remaining = Math.max(1, Number(value) || 1);
  let output = '';
  for (const [symbol, amount] of pairs) {
    while (remaining >= amount) {
      output += symbol;
      remaining -= amount;
    }
  }
  return output;
}

function listMarker(list, item, index) {
  if (item?.markerLabel) return item.markerLabel;
  if (list.marker === 'bullet') return '-';
  const ordinal = (Number(list.start) || 1) + index;
  if (list.marker === 'lowerAlpha') return `${alphaMarker(ordinal - 1, false)}.`;
  if (list.marker === 'upperAlpha') return `${alphaMarker(ordinal - 1, true)}.`;
  if (list.marker === 'lowerRoman') return `${romanMarker(ordinal).toLowerCase()}.`;
  if (list.marker === 'upperRoman') return `${romanMarker(ordinal)}.`;
  return `${ordinal}.`;
}

function indentLines(value, spaces) {
  const prefix = ' '.repeat(spaces);
  return String(value ?? '').split('\n').map((line) => `${prefix}${line}`).join('\n');
}

function renderList(list, depth = 0) {
  const lines = [];
  for (const [index, item] of (list?.items ?? []).entries()) {
    const marker = listMarker(list, item, index);
    const checkbox = item.checked === undefined ? '' : item.checked ? '[x] ' : '[ ] ';
    const body = cleanText(renderAnydocBlocks(item.blocks ?? [], depth + 1));
    const [first = '', ...rest] = body.split('\n');
    lines.push(`${'  '.repeat(depth)}${marker} ${checkbox}${first}`.trimEnd());
    if (rest.length) lines.push(indentLines(rest.join('\n'), (depth + 1) * 2));
  }
  return lines.join('\n');
}

function tableCellText(slot) {
  if (slot?.kind !== 'origin' || !slot.cell) return '';
  return escapeTableCell(renderAnydocBlocks(slot.cell.blocks ?? []));
}

function renderTable(table) {
  const rows = (table?.grid ?? []).map((row) => row.map(tableCellText));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((row) => row.length), 1);
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
  const headerRows = Math.max(0, Number(table.headerRows) || 0);
  const output = [];
  if (headerRows > 0) {
    const header = normalized[0];
    output.push(`| ${header.join(' | ')} |`);
    output.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const row of normalized.slice(1)) output.push(`| ${row.join(' | ')} |`);
  } else {
    const header = normalized[0].map((_, index) => `Колонка ${index + 1}`);
    output.push(`| ${header.join(' | ')} |`);
    output.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const row of normalized) output.push(`| ${row.join(' | ')} |`);
  }
  return output.join('\n');
}

export function renderAnydocBlock(block, depth = 0) {
  if (block?.kind === 'heading') return `${'#'.repeat(Math.min(6, Math.max(1, Number(block.level) || 1)))} ${renderAnydocInlines(block.content ?? [])}`;
  if (block?.kind === 'paragraph') return renderAnydocInlines(block.content ?? []);
  if (block?.kind === 'list') return renderList(block.list, depth);
  if (block?.kind === 'table') return renderTable(block.table);
  if (block?.kind === 'blockQuote') {
    return renderAnydocBlocks(block.blocks ?? [], depth).split('\n').map((line) => `> ${line}`).join('\n');
  }
  if (block?.kind === 'codeBlock') return `\`\`\`${block.lang ?? ''}\n${block.text ?? ''}\n\`\`\``;
  if (block?.kind === 'rule') return '---';
  return '';
}

export function renderAnydocBlocks(blocks = [], depth = 0) {
  return cleanText(blocks.map((block) => renderAnydocBlock(block, depth)).filter(Boolean).join('\n\n'));
}

function sectionParts({ title, blocks, maxSectionChars, provenanceKind }) {
  const output = [];
  let current = [];
  let length = 0;
  const flush = () => {
    if (!current.length) return;
    const part = output.length + 1;
    output.push({
      id: output.length ? `${slugify(title)}-part-${part}` : slugify(title, 'content'),
      title: output.length ? `${title} · часть ${part}` : title,
      text: cleanText(current.map((entry) => entry.text).join('\n\n')),
      entityIds: [],
      tags: [],
      provenance: {
        kind: provenanceKind,
        blockStart: current[0].index,
        blockEnd: current.at(-1).index,
      },
    });
    current = [];
    length = 0;
  };
  for (const entry of blocks) {
    const next = entry.text.length + (current.length ? 2 : 0);
    if (current.length && length + next > maxSectionChars) flush();
    current.push(entry);
    length += next;
  }
  flush();
  return output;
}

export function sectionsFromAnydoc(document, filename, { maxSectionChars = 5000 } = {}) {
  let title = titleFromFilename(filename);
  let sectionTitle = 'Содержание';
  let current = [];
  const sections = [];
  let firstHeading = true;
  const flush = () => {
    sections.push(...sectionParts({
      title: sectionTitle,
      blocks: current,
      maxSectionChars,
      provenanceKind: 'anydoc-blocks',
    }));
    current = [];
  };
  for (const [index, block] of (document?.blocks ?? []).entries()) {
    if (block?.kind === 'heading') {
      const heading = cleanText(renderAnydocInlines(block.content ?? []));
      if (heading) {
        if (firstHeading && Number(block.level) === 1 && !current.length && !sections.length) title = heading;
        else {
          flush();
          sectionTitle = heading;
        }
        firstHeading = false;
      }
      continue;
    }
    const text = cleanText(renderAnydocBlock(block));
    if (text) current.push({ index: index + 1, text });
  }
  flush();
  const notes = (document?.notes ?? []).flatMap((note, index) => {
    const text = renderAnydocBlocks(note.blocks ?? []);
    return text ? [{ index: index + 1, text: `[^${note.id}]: ${text}` }] : [];
  });
  if (notes.length) {
    sections.push(...sectionParts({
      title: 'Сноски и примечания',
      blocks: notes,
      maxSectionChars,
      provenanceKind: 'anydoc-notes',
    }));
  }
  if (!sections.length) throw new Error(`Document ${filename} contains no extractable blocks.`);
  return { title, sections };
}
