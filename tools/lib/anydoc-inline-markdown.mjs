export function cleanAnydocText(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
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
      const alt = cleanAnydocText(inline.alt) || 'Встроенное изображение';
      if (inline.source?.kind === 'external' && inline.source.url) return `![${alt}](${inline.source.url})`;
      if (inline.source?.kind === 'asset' && Number.isInteger(inline.source.assetId)) {
        return `![${alt}](asset:${inline.source.assetId})`;
      }
      return `[Изображение: ${alt}]`;
    }
    return '';
  }).join('');
}
