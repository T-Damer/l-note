import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const roots = ['apps', 'packages', 'scripts', 'tests'];
const failures = [];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!['.js', '.mjs'].includes(extname(path))) continue;

    const result = spawnSync(process.execPath, ['--check', path], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      failures.push(`${relative(root, path)}\n${result.stderr || result.stdout}`);
    }
  }
}

for (const directory of roots) walk(join(root, directory));

const appPartsDirectory = join(root, 'apps/web/src/main.parts');
const appParts = readdirSync(appPartsDirectory)
  .filter((name) => name.endsWith('.part'))
  .sort()
  .map((name) => readFileSync(join(appPartsDirectory, name), 'utf8'))
  .join('\n');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'l-note-source-'));
const assembledApp = join(temporaryDirectory, 'assembled-app.mjs');
writeFileSync(assembledApp, appParts);
const assembledResult = spawnSync(process.execPath, ['--check', assembledApp], { encoding: 'utf8' });
rmSync(temporaryDirectory, { recursive: true, force: true });
if (assembledResult.status !== 0) {
  failures.push(`assembled web application\n${assembledResult.stderr || assembledResult.stdout}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}

console.log('JavaScript syntax check passed.');
