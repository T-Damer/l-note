import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const USE_PATTERN = /^\s*@use\s+['"]([^'"]+)['"]\s*;\s*$/gmu;

export async function buildStyles(root) {
  const stylesRoot = path.join(root, 'styles');
  const entryPath = path.join(stylesRoot, 'main.scss');
  const entry = await readFile(entryPath, 'utf8');
  const partialNames = [...entry.matchAll(USE_PATTERN)].map((match) => match[1]);
  if (partialNames.length === 0) throw new Error('styles/main.scss must declare at least one @use partial.');

  const chunks = ['/* Generated from styles/main.scss. Edit SCSS partials, not this file. */\n'];
  for (const partialName of partialNames) {
    if (!/^[a-z0-9/-]+$/u.test(partialName)) throw new Error(`Unsupported SCSS partial name: ${partialName}`);
    const partialPath = path.join(stylesRoot, `${path.dirname(partialName) === '.' ? '' : `${path.dirname(partialName)}/`}_${path.basename(partialName)}.scss`);
    const content = await readFile(partialPath, 'utf8');
    chunks.push(`\n/* ${partialName} */\n${content.trim()}\n`);
  }

  const outputPath = path.join(root, 'styles.css');
  await writeFile(outputPath, chunks.join(''), 'utf8');
  return { outputPath, partialNames };
}
