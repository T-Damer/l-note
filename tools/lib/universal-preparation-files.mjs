import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { embeddedAssetExtension } from './document-formats.mjs';
import { slugify, stableId } from './pack-builder.mjs';

export async function listUniversalSourceFiles(inputPath, { excludePath } = {}) {
  const absolute = path.resolve(inputPath);
  const excluded = excludePath ? path.resolve(excludePath) : null;
  const inputStat = await stat(absolute);
  if (inputStat.isFile()) return [absolute];
  const output = [];
  async function walk(directory) {
    if (excluded && (directory === excluded || directory.startsWith(`${excluded}${path.sep}`))) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(directory, entry.name);
      if (excluded && (fullPath === excluded || fullPath.startsWith(`${excluded}${path.sep}`))) continue;
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) output.push(fullPath);
    }
  }
  await walk(absolute);
  return output;
}

export function uniqueAssetName(relative, used, forcedExtension = null) {
  const originalExtension = path.extname(relative).toLowerCase();
  const extension = forcedExtension ?? originalExtension;
  const withoutExtension = originalExtension ? relative.slice(0, -originalExtension.length) : relative;
  const base = slugify(path.basename(withoutExtension), 'document');
  let name = `${base}${extension}`;
  if (used.has(name)) name = `${base}-${stableId(relative).slice(-8)}${extension}`;
  used.add(name);
  return name;
}

export function uniqueDocumentKey(relative, used) {
  const base = slugify(relative, 'document');
  let key = base;
  if (used.has(key)) key = `${base}-${stableId(relative).slice(-8)}`;
  used.add(key);
  return key;
}

export function uniqueSectionIds(sections = []) {
  const used = new Set();
  return sections.map((section, index) => {
    const base = slugify(section?.id ?? section?.title, `section-${index + 1}`);
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return id === section.id ? section : { ...section, id };
  });
}

export async function copyPrimaryAsset(filename, relative, assetRoot, usedAssets) {
  const assetName = uniqueAssetName(relative, usedAssets);
  await mkdir(assetRoot, { recursive: true });
  await copyFile(filename, path.join(assetRoot, assetName));
  return {
    name: assetName,
    url: `./assets/${assetName}`,
  };
}

function replaceAssetReferences(sections, replacements) {
  if (!replacements.size) return sections;
  return sections.map((section) => {
    let text = section.text;
    for (const [id, url] of replacements) {
      text = text.replaceAll(`](asset:${id})`, `](${url})`);
    }
    return text === section.text ? section : { ...section, text };
  });
}

export async function saveEmbeddedAssets({
  embeddedAssets = [],
  relative,
  assetRoot,
  usedAssets,
  sections,
} = {}) {
  const descriptors = [];
  const replacements = new Map();
  for (const asset of embeddedAssets) {
    const extension = embeddedAssetExtension(asset.mediaType);
    const synthetic = `${relative}-embedded-${asset.id}${extension}`;
    const name = uniqueAssetName(synthetic, usedAssets, extension);
    const url = `./assets/${name}`;
    await writeFile(path.join(assetRoot, name), Buffer.from(asset.data ?? []));
    descriptors.push({
      id: asset.id,
      url,
      mimeType: asset.mediaType,
      originPart: asset.originPart || null,
      bytes: Buffer.byteLength(asset.data ?? []),
    });
    replacements.set(asset.id, url);
  }
  return {
    descriptors,
    sections: replaceAssetReferences(sections, replacements),
  };
}
