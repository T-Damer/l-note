import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export async function buildPhosphorIcons(root) {
  const source = path.join(root, 'node_modules', '@phosphor-icons', 'web', 'src', 'regular');
  const vendorRoot = path.join(root, 'vendor');
  const target = path.join(vendorRoot, 'phosphor');
  await mkdir(vendorRoot, { recursive: true });
  await rm(target, { recursive: true, force: true });
  try {
    await cp(source, target, { recursive: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    throw new Error('Phosphor icons are not installed. Run npm ci before building the app.');
  }
  return target;
}
