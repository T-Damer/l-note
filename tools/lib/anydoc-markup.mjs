import path from 'node:path';

import {
  renderAnydocBlock,
  renderAnydocBlocks,
} from './anydoc-block-markdown.mjs';
import {
  cleanAnydocText,
  renderAnydocInlines,
} from './anydoc-inline-markdown.mjs';
import { slugify } from './pack-builder.mjs';

export {
  renderAnydocBlock,
  renderAnydocBlocks,
  renderAnydocInlines,
};

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[-_]+/gu, ' ').trim() || 'Документ';
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
      text: cleanAnydocText(current.map((entry) => entry.text).join('\n\n')),
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
      const heading = cleanAnydocText(renderAnydocInlines(block.content ?? []));
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
    const text = cleanAnydocText(renderAnydocBlock(block));
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
