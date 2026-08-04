import {
  cleanAnydocText,
  renderAnydocInlines,
} from './anydoc-inline-markdown.mjs';

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
    const body = cleanAnydocText(renderAnydocBlocks(item.blocks ?? [], depth + 1));
    const [first = '', ...rest] = body.split('\n');
    lines.push(`${'  '.repeat(depth)}${marker} ${checkbox}${first}`.trimEnd());
    if (rest.length) lines.push(indentLines(rest.join('\n'), (depth + 1) * 2));
  }
  return lines.join('\n');
}

function escapeTableCell(value) {
  return cleanAnydocText(value).replaceAll('|', '\\|').replace(/\n+/gu, '<br>');
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
  if (block?.kind === 'heading') {
    const level = Math.min(6, Math.max(1, Number(block.level) || 1));
    return `${'#'.repeat(level)} ${renderAnydocInlines(block.content ?? [])}`;
  }
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
  const rendered = blocks.map((block) => renderAnydocBlock(block, depth)).filter(Boolean).join('\n\n');
  return cleanAnydocText(rendered);
}
